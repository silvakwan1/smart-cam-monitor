import { app, BrowserWindow, ipcMain, protocol } from 'electron';
import * as path from 'path';
import { RecordingMode, SystemStats } from '../shared/types';
import { YoloDetector } from './ai/YoloDetector';
import { CameraManager } from './camera/CameraManager';

import {
  loadDatabases,
  cameras,
  events,
  generalSettings,
  saveEvents,
  getDatasetsDir,
  registerDatabaseHandlers
} from './services/database';

import {
  registerDatasetHandlers,
  parseDatasetYaml,
  killTrainerProcesses
} from './services/datasetManager';

import {
  registerMediaHandlers
} from './services/mediaManager';

import {
  registerMediaProtocol
} from './services/mediaProtocol';

// Register standard custom protocol for playing local recording files inside React
protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { bypassCSP: true, stream: true, supportFetchAPI: true, corsEnabled: true } }
]);

let mainWindow: BrowserWindow | null = null;
let detector: YoloDetector | null = null;
let cameraManager: CameraManager | null = null;

// Window creation
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 768,
    title: 'SmartCam Monitor - Painel Inteligente',
    backgroundColor: '#030712',
    icon: !app.isPackaged 
      ? path.join(__dirname, '../../build/icon.png')
      : path.join(__dirname, '../renderer/logo.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    autoHideMenuBar: true
  });

  // In development, load the Vite dev server URL.
  // In production, load the built index.html.
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Periodic performance system statistics
let statsInterval: NodeJS.Timeout | null = null;
function startStatsBroadcast() {
  statsInterval = setInterval(() => {
    if (!mainWindow) return;

    const memory = process.memoryUsage();
    // Simple CPU usage calculation
    const startUsage = process.cpuUsage();
    
    setTimeout(() => {
      const elapUsage = process.cpuUsage(startUsage);
      const totalMs = elapUsage.user / 1000 + elapUsage.system / 1000;
      
      const cpuPercent = Math.min(100, Math.round((totalMs / 100) * 100) / 10);
      const memoryMb = Math.round(memory.heapUsed / 1024 / 1024);

      const stats: SystemStats = {
        cpuUsage: cpuPercent,
        memoryUsage: memoryMb,
        gpuUsage: 0, // Placeholder for future graphics accelerator integration
        fpsMap: {}
      };

      if (cameraManager && cameraManager.getActiveConfig()) {
        const camConfig = cameraManager.getActiveConfig()!;
        const inferenceStats = detector?.getInferenceStats();
        
        stats.fpsMap[camConfig.id] = {
          capture: (cameraManager as any).captureFps || 0,
          inference: inferenceStats?.fps || 0
        };
      }

      mainWindow?.webContents.send('system:stats', stats);
    }, 100);
  }, 2000);
}

// App lifecycle
app.whenReady().then(async () => {
  // Register local file scheme reader for HTML5 video player security compatibility
  registerMediaProtocol();

  // Load settings and cameras databases
  loadDatabases();

  // Create & Initialize background AI detector
  console.log('[Main] Initializing YOLOv11 Detector...');
  detector = new YoloDetector(generalSettings.modelPath);
  await detector.initialize();

  // Initialize CameraManager
  cameraManager = new CameraManager(
    detector,
    // Frame callback
    (base64Frame, detections, stats) => {
      mainWindow?.webContents.send('camera:frame', { base64Frame, detections, stats });
    },
    // Status callback
    (status) => {
      mainWindow?.webContents.send('camera:status', status);
    },
    // Event callback
    (event) => {
      events.unshift(event); // Push new events to beginning
      saveEvents();
      mainWindow?.webContents.send('system:event', event);
    },
    // Settings getter
    () => generalSettings,
    // Custom classes getter
    () => {
      const datasetsDir = getDatasetsDir();
      const yamlPath = path.join(datasetsDir, 'dataset.yaml');
      const { names } = parseDatasetYaml(yamlPath);
      return names;
    }
  );

  // Register settings and cameras CRUD handlers
  registerDatabaseHandlers((oldSettings) => {
    // If model path was modified, re-initialize detector asynchronously
    if (oldSettings.modelPath !== generalSettings.modelPath && detector) {
      console.log(`[Main] Model path changed to ${generalSettings.modelPath}. Re-initializing detector...`);
      detector.close().then(() => {
        detector = new YoloDetector(generalSettings.modelPath);
        return detector.initialize();
      }).catch(console.error);
    }
  });

  // Register training and datasets handlers
  registerDatasetHandlers();

  // Register media files (recordings and snapshots) CRUD and scan handlers
  registerMediaHandlers(
    () => mainWindow,
    () => detector
  );

  // Remaining streaming handlers that directly reference cameraManager
  ipcMain.handle('camera:start', async (event, id: string, recordMode: RecordingMode) => {
    if (!cameraManager) throw new Error('Camera manager not initialized.');
    
    const cameraConfig = cameras.find(c => c.id === id);
    if (!cameraConfig) throw new Error(`Camera with ID ${id} not found.`);

    await cameraManager.start(cameraConfig, recordMode);
    return { success: true };
  });

  ipcMain.handle('camera:stop', async () => {
    if (!cameraManager) throw new Error('Camera manager not initialized.');
    await cameraManager.stop();
    return { success: true };
  });

  ipcMain.handle('camera:set-recording', async (event, mode: RecordingMode) => {
    if (!cameraManager) throw new Error('Camera manager not initialized.');
    await cameraManager.setRecordingMode(mode);
    return { success: true };
  });

  ipcMain.handle('camera:take-snapshot', async () => {
    if (!cameraManager || !cameraManager.getActiveConfig()) {
      throw new Error('Camera is not streaming.');
    }
    // Let CameraManager trigger a snapshot on the next incoming frame
    return { success: true };
  });

  createWindow();
  startStatsBroadcast();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', async () => {
  if (statsInterval) clearInterval(statsInterval);
  
  // Kill active background training processes
  killTrainerProcesses();
  
  if (cameraManager) {
    await cameraManager.stop();
  }
  if (detector) {
    await detector.close();
  }

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

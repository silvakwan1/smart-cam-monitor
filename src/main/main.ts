import { app, BrowserWindow, ipcMain, protocol, net, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import ffmpegPathRaw from 'ffmpeg-static';
const ffmpegPath = ffmpegPathRaw ? ffmpegPathRaw.replace('app.asar', 'app.asar.unpacked') : '';
import { CameraConfig, RecordingMode, SystemEvent, SystemStats } from '../shared/types';
import { YoloDetector } from './ai/YoloDetector';
import { CameraManager } from './camera/CameraManager';
import { listDevices } from './camera/listDevices';

// Register standard custom protocol for playing local recording files inside React
protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { bypassCSP: true, stream: true, supportFetchAPI: true, corsEnabled: true } }
]);

let mainWindow: BrowserWindow | null = null;
let detector: YoloDetector | null = null;
let cameraManager: CameraManager | null = null;

// Persistence file paths in OS AppData directory
const USER_DATA_PATH = app.getPath('userData');
const CAMERAS_FILE = path.join(USER_DATA_PATH, 'cameras.json');
const EVENTS_FILE = path.join(USER_DATA_PATH, 'events.json');
const SETTINGS_FILE = path.join(USER_DATA_PATH, 'settings.json');

// Store video recordings and snapshots directly inside the project root folder!
const PROJECT_DIR = process.cwd();
const RECORDINGS_DIR = path.join(PROJECT_DIR, 'recordings');
const SNAPSHOTS_DIR = path.join(PROJECT_DIR, 'snapshots');
if (!fs.existsSync(RECORDINGS_DIR)) fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
if (!fs.existsSync(SNAPSHOTS_DIR)) fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });

// Load initial databases
let cameras: CameraConfig[] = [];
let events: SystemEvent[] = [];
let generalSettings = {
  modelPath: path.join(USER_DATA_PATH, 'yolo11n.onnx'),
  recordingsFolder: RECORDINGS_DIR,
  snapshotsFolder: SNAPSHOTS_DIR,
  enableGpu: false
};

function loadDatabases() {
  // 1. Cameras
  if (fs.existsSync(CAMERAS_FILE)) {
    try {
      cameras = JSON.parse(fs.readFileSync(CAMERAS_FILE, 'utf-8'));
    } catch (e) {
      console.error('Error loading cameras.json, recreating...', e);
    }
  } else {
    // Default camera configuration (USB webcam device '0')
    cameras = [
      {
        id: 'cam_webcam',
        name: 'Webcam Local (Default)',
        type: 'usb',
        source: '0', // maps to first device (on Win/Mac/Linux)
        width: 1280,
        height: 720,
        fps: 30,
        isActive: true
      }
    ];
    fs.writeFileSync(CAMERAS_FILE, JSON.stringify(cameras, null, 2));
  }

  // 2. Events
  if (fs.existsSync(EVENTS_FILE)) {
    try {
      events = JSON.parse(fs.readFileSync(EVENTS_FILE, 'utf-8'));
    } catch (e) {
      console.error('Error loading events.json', e);
    }
  }

  // 3. Settings
  if (fs.existsSync(SETTINGS_FILE)) {
    try {
      generalSettings = { ...generalSettings, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8')) };
    } catch (e) {
      console.error('Error loading settings.json', e);
    }
  } else {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(generalSettings, null, 2));
  }
}

function saveCameras() {
  fs.writeFileSync(CAMERAS_FILE, JSON.stringify(cameras, null, 2));
}

function saveEvents() {
  // Cap history size to prevent file bloat (keep last 500 events)
  if (events.length > 500) {
    events = events.slice(-500);
  }
  fs.writeFileSync(EVENTS_FILE, JSON.stringify(events, null, 2));
}

function saveSettingsDb() {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(generalSettings, null, 2));
}

// Window creation
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 768,
    title: 'SmartCam Monitor - Painel Inteligente',
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
  protocol.handle('media', (request) => {
    let rawPath = request.url.replace(/^media:\/\/+/i, '');
    let decodedPath = decodeURIComponent(rawPath);
    
    // Normalise Windows drive letter prefix (e.g., "c/" -> "c:/" or "/c/" -> "c:/")
    if (decodedPath.startsWith('/')) {
      decodedPath = decodedPath.substring(1);
    }
    
    if (/^[a-zA-Z]\//.test(decodedPath)) {
      decodedPath = decodedPath[0] + ':' + decodedPath.substring(1);
    } else if (/^[a-zA-Z]:/.test(decodedPath)) {
      if (decodedPath[2] !== '/') {
        decodedPath = decodedPath.substring(0, 2) + '/' + decodedPath.substring(2);
      }
    }
    
    const targetUrl = 'file:///' + decodedPath;
    return net.fetch(targetUrl);
  });

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
    () => generalSettings
  );

  createWindow();
  startStatsBroadcast();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', async () => {
  if (statsInterval) clearInterval(statsInterval);
  
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

// IPC Handler Registrations
// 1. Cameras Configuration CRUD
ipcMain.handle('cameras:get', () => {
  return cameras;
});

ipcMain.handle('cameras:save', (event, config: CameraConfig) => {
  const existingIdx = cameras.findIndex(c => c.id === config.id);
  if (existingIdx > -1) {
    cameras[existingIdx] = config;
  } else {
    cameras.push(config);
  }
  saveCameras();
  return cameras;
});

ipcMain.handle('cameras:remove', (event, id: string) => {
  cameras = cameras.filter(c => c.id !== id);
  saveCameras();
  return cameras;
});

// 2. Camera Streaming Toggles
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
  // which will emit a system event containing snapshot data
  return { success: true };
});

// 3. Event History queries
ipcMain.handle('events:get', () => {
  return events;
});

ipcMain.handle('events:clear', () => {
  events = [];
  saveEvents();
  return events;
});

// 4. System Settings
ipcMain.handle('settings:get', () => {
  return generalSettings;
});

ipcMain.handle('settings:save', (event, newSettings: any) => {
  const oldModelPath = generalSettings.modelPath;
  generalSettings = { ...generalSettings, ...newSettings };
  saveSettingsDb();

  // If model path was modified, re-initialize detector asynchronously
  if (oldModelPath !== generalSettings.modelPath && detector) {
    console.log(`[Main] Model path changed to ${generalSettings.modelPath}. Re-initializing detector...`);
    detector.close().then(() => {
      detector = new YoloDetector(generalSettings.modelPath);
      return detector.initialize();
    }).catch(console.error);
  }

  return generalSettings;
});

// 5. System Devices Listing
ipcMain.handle('system:list-devices', async () => {
  return await listDevices();
});

// 6. Local recordings files queries and operations
ipcMain.handle('recordings:list', async () => {
  const folder = generalSettings.recordingsFolder;
  if (!fs.existsSync(folder)) return [];
  
  try {
    const files = await fs.promises.readdir(folder);
    const list = [];
    
    for (const file of files) {
      if (file.endsWith('.mp4')) {
        const filePath = path.join(folder, file);
        const stat = await fs.promises.stat(filePath);
        list.push({
          name: file,
          path: filePath,
          size: stat.size,
          createdAt: stat.birthtimeMs || stat.mtimeMs,
          url: `media://${filePath.replace(/\\/g, '/')}`
        });
      }
    }
    
    // Order from newest recorded file
    return list.sort((a, b) => b.createdAt - a.createdAt);
  } catch (err) {
    console.error('Failed to list recordings folder:', err);
    return [];
  }
});

ipcMain.handle('recordings:open-folder', async () => {
  shell.openPath(generalSettings.recordingsFolder);
  return { success: true };
});

ipcMain.handle('recordings:delete', async (event, filePath: string) => {
  try {
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
    const jsonPath = filePath.replace(/\.mp4$/i, '.json');
    if (fs.existsSync(jsonPath)) {
      await fs.promises.unlink(jsonPath);
    }
    return { success: true };
  } catch (err) {
    console.error('Failed to delete recording:', err);
    throw err;
  }
});

// 7. Local snapshots files queries and operations
ipcMain.handle('snapshots:list', async () => {
  const folder = generalSettings.snapshotsFolder;
  if (!fs.existsSync(folder)) return [];

  try {
    const files = await fs.promises.readdir(folder);
    const list = [];

    for (const file of files) {
      if (file.endsWith('.jpg') || file.endsWith('.png')) {
        const filePath = path.join(folder, file);
        const stat = await fs.promises.stat(filePath);
        list.push({
          name: file,
          path: filePath,
          size: stat.size,
          createdAt: stat.birthtimeMs || stat.mtimeMs,
          url: `media://${filePath.replace(/\\/g, '/')}`
        });
      }
    }

    // Order from newest snapshot file
    return list.sort((a, b) => b.createdAt - a.createdAt);
  } catch (err) {
    console.error('Failed to list snapshots folder:', err);
    return [];
  }
});

ipcMain.handle('snapshots:open-folder', async () => {
  shell.openPath(generalSettings.snapshotsFolder);
  return { success: true };
});

ipcMain.handle('snapshots:delete', async (event, filePath: string) => {
  try {
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
    return { success: true };
  } catch (err) {
    console.error('Failed to delete snapshot:', err);
    throw err;
  }
});

// 8. Bulk file deletion and video editing operations
ipcMain.handle('recordings:delete-multiple', async (event, filePaths: string[]) => {
  let count = 0;
  for (const filePath of filePaths) {
    try {
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
        count++;
      }
      const jsonPath = filePath.replace(/\.mp4$/i, '.json');
      if (fs.existsSync(jsonPath)) {
        await fs.promises.unlink(jsonPath);
      }
    } catch (err) {
      console.error(`Failed to delete recording ${filePath}:`, err);
    }
  }
  return { success: true, deletedCount: count };
});

ipcMain.handle('snapshots:delete-multiple', async (event, filePaths: string[]) => {
  let count = 0;
  for (const filePath of filePaths) {
    try {
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
        count++;
      }
    } catch (err) {
      console.error(`Failed to delete snapshot ${filePath}:`, err);
    }
  }
  return { success: true, deletedCount: count };
});

ipcMain.handle('recordings:trim', async (event, filePath: string, startTimeSec: number, durationSec: number) => {
  if (!ffmpegPath) {
    throw new Error('FFmpeg binary not found.');
  }

  // Generate output filename
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  const outputFileName = `${base}_corte_${Date.now()}${ext}`;
  const outputPath = path.join(dir, outputFileName);

  // ffmpeg -y -ss {startTimeSec} -i {filePath} -t {durationSec} -c copy {outputPath}
  const ffmpegArgs = [
    '-y',
    '-ss', startTimeSec.toString(),
    '-i', filePath,
    '-t', durationSec.toString(),
    '-c', 'copy',
    outputPath
  ];

  console.log(`[Main] Trimming video: spawn ${ffmpegPath} ${ffmpegArgs.join(' ')}`);

  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, ffmpegArgs);

    let stderr = '';
    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', async (code) => {
      if (code === 0) {
        console.log(`[Main] Video trim success: ${outputPath}`);

        // Try to trim corresponding detections JSON file if it exists
        const originalJsonPath = filePath.replace(/\.mp4$/i, '.json');
        if (fs.existsSync(originalJsonPath)) {
          try {
            const originalDetections = JSON.parse(await fs.promises.readFile(originalJsonPath, 'utf-8'));
            const endTimeSec = startTimeSec + durationSec;
            const trimmedDetections = originalDetections
              .filter((d: any) => d.time >= startTimeSec && d.time <= endTimeSec)
              .map((d: any) => ({
                ...d,
                time: d.time - startTimeSec
              }));
            const outputJsonPath = outputPath.replace(/\.mp4$/i, '.json');
            await fs.promises.writeFile(outputJsonPath, JSON.stringify(trimmedDetections, null, 2));
            console.log(`[Main] Saved trimmed detections tracker: ${outputJsonPath}`);
          } catch (e) {
            console.error('Failed to trim detections JSON:', e);
          }
        }

        resolve({ success: true, path: outputPath });
      } else {
        console.error(`[Main] FFmpeg trim error (code ${code}):`, stderr);
        reject(new Error(`FFmpeg exited with code ${code}: ${stderr}`));
      }
    });

    proc.on('error', (err) => {
      console.error('[Main] Failed to start FFmpeg trim process:', err);
      reject(err);
    });
  });
});

ipcMain.handle('recordings:get-detections', async (event, filePath: string) => {
  const jsonPath = filePath.replace(/\.mp4$/i, '.json');
  if (fs.existsSync(jsonPath)) {
    try {
      const data = await fs.promises.readFile(jsonPath, 'utf-8');
      return JSON.parse(data);
    } catch (err) {
      console.error('Failed to read detections JSON:', err);
      return [];
    }
  }
  return [];
});

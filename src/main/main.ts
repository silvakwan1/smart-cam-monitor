import { app, BrowserWindow, ipcMain, protocol, net, shell, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { Readable } from 'stream';
import { ChildProcess, spawn } from 'child_process';
import { CameraConfig, RecordingMode, SystemEvent, SystemStats } from '../shared/types';
import { YoloDetector } from './ai/YoloDetector';
import { CameraManager } from './camera/CameraManager';
import { listDevices } from './camera/listDevices';
import { assertFFmpegExists, getFFmpegPath } from './utils/ffmpeg';

// Register standard custom protocol for playing local recording files inside React
protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { bypassCSP: true, stream: true, supportFetchAPI: true, corsEnabled: true } }
]);

let mainWindow: BrowserWindow | null = null;
let detector: YoloDetector | null = null;
let cameraManager: CameraManager | null = null;
let cameraTrainerProcess: ChildProcess | null = null;
let datasetTrainerProcess: ChildProcess | null = null;

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

function getAiEngineBaseDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'ai-engine');
  }
  return path.join(PROJECT_DIR, 'ai-engine');
}

function getDatasetsDir() {
  if (generalSettings.datasetsFolder) {
    return generalSettings.datasetsFolder;
  }
  return path.join(getAiEngineBaseDir(), 'datasets');
}

// Load initial databases
let cameras: CameraConfig[] = [];
let events: SystemEvent[] = [];
let generalSettings = {
  modelPath: path.join(USER_DATA_PATH, 'yolo11n.onnx'),
  recordingsFolder: '',
  snapshotsFolder: '',
  datasetsFolder: '',
  enableGpu: false,
  needsConfiguration: true
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
      const loaded = JSON.parse(fs.readFileSync(EVENTS_FILE, 'utf-8'));
      events = Array.isArray(loaded) ? loaded.map((evt: any) => ({
        description: evt.description || `${evt.type === 'motion_detected' ? 'Movimento' : 'Pessoa'} detectada`,
        ...evt
      })) : [];
    } catch (e) {
      console.error('Error loading events.json', e);
    }
  }

  // 3. Settings
  if (fs.existsSync(SETTINGS_FILE)) {
    try {
      const loaded = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
      generalSettings = { ...generalSettings, ...loaded };
      // Compatibility with existing setups: if recordingsFolder is already defined and no needsConfiguration flag was present, set it to false.
      if (loaded.recordingsFolder && loaded.needsConfiguration === undefined) {
        generalSettings.needsConfiguration = false;
      }
    } catch (e) {
      console.error('Error loading settings.json', e);
    }
  } else {
    // Populate default folders on first run if they are not configured
    try {
      generalSettings.recordingsFolder = path.join(app.getPath('videos'), 'SmartCamRecordings');
      generalSettings.snapshotsFolder = path.join(app.getPath('pictures'), 'SmartCamSnapshots');
      generalSettings.datasetsFolder = path.join(app.getPath('documents'), 'SmartCamDatasets');
      
      // Ensure they exist
      if (!fs.existsSync(generalSettings.recordingsFolder)) fs.mkdirSync(generalSettings.recordingsFolder, { recursive: true });
      if (!fs.existsSync(generalSettings.snapshotsFolder)) fs.mkdirSync(generalSettings.snapshotsFolder, { recursive: true });
      if (!fs.existsSync(generalSettings.datasetsFolder)) fs.mkdirSync(generalSettings.datasetsFolder, { recursive: true });
    } catch (err) {
      console.error('Failed to set up default system directories:', err);
      // Fallback to project root directory
      generalSettings.recordingsFolder = path.join(PROJECT_DIR, 'recordings');
      generalSettings.snapshotsFolder = path.join(PROJECT_DIR, 'snapshots');
      generalSettings.datasetsFolder = path.join(PROJECT_DIR, 'ai-engine', 'datasets');
    }
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

function getTrainerExecutablePath() {
  const packagedPath = path.join(process.resourcesPath, 'ai-engine', 'camera_trainer.exe');
  const devPath = path.join(PROJECT_DIR, 'ai-engine', 'dist', 'camera_trainer.exe');

  if (app.isPackaged && fs.existsSync(packagedPath)) {
    return packagedPath;
  }

  if (fs.existsSync(devPath)) {
    return devPath;
  }

  return null;
}

function getDatasetTrainerExecutablePath() {
  const packagedPath = path.join(process.resourcesPath, 'ai-engine', 'dataset_trainer.exe');
  const devPath = path.join(PROJECT_DIR, 'ai-engine', 'dist', 'dataset_trainer.exe');

  if (app.isPackaged && fs.existsSync(packagedPath)) {
    return packagedPath;
  }

  if (fs.existsSync(devPath)) {
    return devPath;
  }

  return null;
}

function parseDatasetYaml(filePath: string) {
  if (!fs.existsSync(filePath)) {
    return { names: {} as Record<number, string>, path: '', train: '', val: '' };
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  const names: Record<number, string> = {};
  let pathVal = '';
  let trainVal = '';
  let valVal = '';

  let inNamesSection = false;
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (trimmed.startsWith('names:')) {
      inNamesSection = true;
      continue;
    }

    if (inNamesSection) {
      const matchProperty = trimmed.match(/^([a-zA-Z_]+)\s*:/);
      if (matchProperty && matchProperty[1] !== 'names') {
        inNamesSection = false;
      }
    }

    if (inNamesSection) {
      const match = trimmed.match(/^['"]?(\d+)['"]?\s*:\s*['"]?([^'"]+)['"]?/);
      if (match) {
        names[parseInt(match[1], 10)] = match[2].trim();
      }
    } else {
      const match = trimmed.match(/^([a-zA-Z_]+)\s*:\s*['"]?([^'"]+)['"]?/);
      if (match) {
        const key = match[1];
        const val = match[2].trim();
        if (key === 'path') pathVal = val;
        else if (key === 'train') trainVal = val;
        else if (key === 'val') valVal = val;
      }
    }
  }
  return { names, path: pathVal, train: trainVal, val: valVal };
}

function writeDatasetYaml(filePath: string, data: { names: Record<number, string>; path: string; train: string; val: string }) {
  let content = 'names:\n';
  const keys = Object.keys(data.names).map(Number).sort((a, b) => a - b);
  for (const k of keys) {
    content += `  ${k}: ${data.names[k]}\n`;
  }
  content += `path: ${data.path.replace(/\\/g, '/')}\n`;
  content += `train: ${data.train}\n`;
  content += `val: ${data.val}\n`;
  fs.writeFileSync(filePath, content, 'utf-8');
}

function launchDatasetTrainerProcess(
  scriptPath: string,
  args: { epochs: number; batch: number; device: string; output: string }
): Promise<ChildProcess> {
  const trainerExecutablePath = getDatasetTrainerExecutablePath();
  const aiEngineBaseDir = getAiEngineBaseDir();
  const trainerArgs = [
    '--config', path.join(aiEngineBaseDir, 'datasets', 'dataset.yaml'),
    '--weights', path.join(aiEngineBaseDir, 'weights', 'yolo11n.pt'),
    '--runs-dir', path.join(PROJECT_DIR, 'runs'),
    '--epochs', args.epochs.toString(),
    '--batch', args.batch.toString(),
    '--device', args.device,
    '--output', args.output
  ];

  if (process.platform === 'win32') {
    if (trainerExecutablePath) {
      return new Promise((resolve, reject) => {
        // Spawn executable in a new command prompt window to show progress logs
        const child = spawn('cmd.exe', ['/c', 'start', 'cmd.exe', '/k', trainerExecutablePath, ...trainerArgs], {
          cwd: path.dirname(trainerExecutablePath),
          windowsHide: false
        });

        child.once('spawn', () => resolve(child));
        child.once('error', reject);
      });
    }

    return new Promise((resolve, reject) => {
      const venvPythonPath = path.join(PROJECT_DIR, '.venv', 'Scripts', 'python.exe');
      const hasVenv = fs.existsSync(venvPythonPath);

      const runInCmd = (command: string, extraArgs: string[]) => {
        return spawn('cmd.exe', ['/c', 'start', 'cmd.exe', '/k', command, ...extraArgs], {
          cwd: path.join(PROJECT_DIR, 'ai-engine'),
          windowsHide: false
        });
      };

      const candidates: { command: string; args: string[] }[] = [];
      if (hasVenv) {
        candidates.push({ command: venvPythonPath, args: [scriptPath, ...trainerArgs] });
      }
      candidates.push({ command: 'py', args: ['-3', scriptPath, ...trainerArgs] });
      candidates.push({ command: 'python', args: [scriptPath, ...trainerArgs] });

      const tryLaunch = (index: number) => {
        const candidate = candidates[index];
        if (!candidate) {
          reject(new Error('Python virtual environment or global interpreter not found.'));
          return;
        }

        const child = runInCmd(candidate.command, candidate.args);
        child.once('spawn', () => resolve(child));
        child.once('error', () => tryLaunch(index + 1));
      };

      tryLaunch(0);
    });
  }

  // Unix/Mac platforms
  if (trainerExecutablePath) {
    return new Promise((resolve, reject) => {
      const child = spawn(trainerExecutablePath, trainerArgs, {
        cwd: path.dirname(trainerExecutablePath)
      });
      child.once('spawn', () => resolve(child));
      child.once('error', reject);
    });
  }

  const venvPythonPath = path.join(PROJECT_DIR, '.venv', 'bin', 'python');
  const hasVenv = fs.existsSync(venvPythonPath);

  const baseArgs = [scriptPath, ...trainerArgs];
  const candidates: { command: string; args: string[] }[] = [];
  if (hasVenv) {
    candidates.push({ command: venvPythonPath, args: baseArgs });
  }
  candidates.push({ command: 'python3', args: baseArgs });
  candidates.push({ command: 'python', args: baseArgs });

  return new Promise((resolve, reject) => {
    const tryLaunch = (index: number) => {
      const candidate = candidates[index];
      if (!candidate) {
        reject(new Error('Python interpreter not found.'));
        return;
      }
      const child = spawn(candidate.command, candidate.args, {
        cwd: path.join(PROJECT_DIR, 'ai-engine')
      });
      child.once('spawn', () => resolve(child));
      child.once('error', () => tryLaunch(index + 1));
    };

    tryLaunch(0);
  });
}


function launchTrainerProcess(scriptPath: string, className: string, cameraSource?: string): Promise<ChildProcess> {
  const trainerExecutablePath = getTrainerExecutablePath();
  const trainerArgs = ['--class-name', className];
  if (cameraSource) {
    trainerArgs.push('--cam', cameraSource);
  }

  if (trainerExecutablePath) {
    return new Promise((resolve, reject) => {
      const child = spawn(trainerExecutablePath, trainerArgs, {
        cwd: path.dirname(trainerExecutablePath),
        windowsHide: false,
        stdio: 'ignore'
      });

      child.once('spawn', () => resolve(child));
      child.once('error', reject);
    });
  }

  const baseArgs = [scriptPath, ...trainerArgs];
  const venvPythonPath = process.platform === 'win32'
    ? path.join(PROJECT_DIR, '.venv', 'Scripts', 'python.exe')
    : path.join(PROJECT_DIR, '.venv', 'bin', 'python');
  const hasVenv = fs.existsSync(venvPythonPath);

  const candidates: { command: string; args: string[] }[] = [];
  if (hasVenv) {
    candidates.push({ command: venvPythonPath, args: baseArgs });
  }

  if (process.platform === 'win32') {
    candidates.push({ command: 'py', args: ['-3', ...baseArgs] });
    candidates.push({ command: 'python', args: baseArgs });
  } else {
    candidates.push({ command: 'python3', args: baseArgs });
    candidates.push({ command: 'python', args: baseArgs });
  }

  return new Promise((resolve, reject) => {
    const tryLaunch = (index: number) => {
      const candidate = candidates[index];
      if (!candidate) {
        reject(new Error('Treinador empacotado nao encontrado e Python nao esta instalado. Gere o camera_trainer.exe antes de empacotar o app.'));
        return;
      }

      const child = spawn(candidate.command, candidate.args, {
        cwd: path.join(PROJECT_DIR, 'ai-engine'),
        windowsHide: false,
        stdio: 'ignore'
      });

      child.once('spawn', () => resolve(child));
      child.once('error', () => tryLaunch(index + 1));
    };

    tryLaunch(0);
  });
}

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
    
    const normalizedPath = path.normalize(decodedPath);
    
    if (!fs.existsSync(normalizedPath)) {
      return new Response('File not found', { status: 404 });
    }
    
    try {
      const stats = fs.statSync(normalizedPath);
      const fileSize = stats.size;
      const range = request.headers.get('range');
      
      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        
        if (start >= fileSize || end >= fileSize) {
          return new Response('Requested range not satisfiable', {
            status: 416,
            headers: {
              'Content-Range': `bytes */${fileSize}`,
              'Accept-Ranges': 'bytes'
            }
          });
        }
        
        const chunksize = (end - start) + 1;
        const fileStream = fs.createReadStream(normalizedPath, { start, end });
        const webStream = Readable.toWeb(fileStream);
        
        return new Response(webStream as any, {
          status: 206,
          headers: {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize.toString(),
            'Content-Type': 'video/mp4'
          }
        });
      } else {
        const fileStream = fs.createReadStream(normalizedPath);
        const webStream = Readable.toWeb(fileStream);
        
        return new Response(webStream as any, {
          status: 200,
          headers: {
            'Accept-Ranges': 'bytes',
            'Content-Length': fileSize.toString(),
            'Content-Type': 'video/mp4'
          }
        });
      }
    } catch (err: any) {
      console.error('[Protocol Handler] Error reading file:', err);
      return new Response('Internal Server Error', { status: 500 });
    }
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
    () => generalSettings,
    // Custom classes getter
    () => {
      const datasetsDir = getDatasetsDir();
      const yamlPath = path.join(datasetsDir, 'dataset.yaml');
      const { names } = parseDatasetYaml(yamlPath);
      return names;
    }
  );

  createWindow();
  startStatsBroadcast();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', async () => {
  if (statsInterval) clearInterval(statsInterval);
  if (cameraTrainerProcess && !cameraTrainerProcess.killed) {
    cameraTrainerProcess.kill();
    cameraTrainerProcess = null;
  }
  if (datasetTrainerProcess && !datasetTrainerProcess.killed) {
    datasetTrainerProcess.kill();
    datasetTrainerProcess = null;
  }
  
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

ipcMain.handle('trainer:start', async (event, className: string, cameraSource?: string) => {
  if (cameraTrainerProcess && !cameraTrainerProcess.killed) {
    return { success: false, message: 'O treinador de IA ja esta em execucao.' };
  }

  const trimmedClassName = className.trim();
  if (!trimmedClassName) {
    throw new Error('Informe o nome do objeto/classe para treinar.');
  }

  const trainerPath = path.join(PROJECT_DIR, 'ai-engine', 'camera_trainer.py');
  const trainerExecutablePath = getTrainerExecutablePath();
  if (!trainerExecutablePath && !fs.existsSync(trainerPath)) {
    throw new Error(`Treinador nao encontrado. Esperado camera_trainer.exe ou ${trainerPath}`);
  }

  cameraTrainerProcess = await launchTrainerProcess(trainerPath, trimmedClassName, cameraSource);

  cameraTrainerProcess.on('close', () => {
    cameraTrainerProcess = null;
  });

  cameraTrainerProcess.on('error', (err) => {
    console.error('[Main] Failed to start AI trainer:', err);
    cameraTrainerProcess = null;
  });

  return { success: true };
});

ipcMain.handle('dataset:get-data', async () => {
  const datasetsDir = getDatasetsDir();
  const yamlPath = path.join(datasetsDir, 'dataset.yaml');
  const { names } = parseDatasetYaml(yamlPath);

  const imagesTrainDir = path.join(datasetsDir, 'images', 'train');
  const labelsTrainDir = path.join(datasetsDir, 'labels', 'train');

  const images: any[] = [];
  const classCounts: Record<number, number> = {};

  // Initialize counts for all classes in dataset.yaml
  for (const idStr of Object.keys(names)) {
    classCounts[parseInt(idStr, 10)] = 0;
  }

  if (fs.existsSync(imagesTrainDir)) {
    try {
      const files = await fs.promises.readdir(imagesTrainDir);
      for (const file of files) {
        const fileExt = path.extname(file).toLowerCase();
        if (['.jpg', '.jpeg', '.png', '.bmp', '.webp'].includes(fileExt)) {
          const filePath = path.join(imagesTrainDir, file);
          const stat = await fs.promises.stat(filePath);

          // Resolve class ID and Name
          let classId = -1;
          let className = 'unknown';

          const capturedMatch = file.match(/^captured_([^_]+(?:_[^_]+)*)_(\d+)\.(?:jpe?g|png|webp|bmp)$/i);
          if (capturedMatch) {
            const parsedName = capturedMatch[1].toLowerCase();
            for (const [idStr, name] of Object.entries(names)) {
              if (name.toLowerCase() === parsedName) {
                classId = parseInt(idStr, 10);
                className = name;
                break;
              }
            }
          }

          if (classId === -1) {
            const labelFile = file.substring(0, file.lastIndexOf('.')) + '.txt';
            const labelPath = path.join(labelsTrainDir, labelFile);
            if (fs.existsSync(labelPath)) {
              try {
                const labelContent = await fs.promises.readFile(labelPath, 'utf-8');
                const match = labelContent.trim().match(/^(\d+)/);
                if (match) {
                  classId = parseInt(match[1], 10);
                  className = names[classId] || `class_${classId}`;
                }
              } catch (e) {
                console.error('Error resolving image class via label:', e);
              }
            }
          }

          if (classId !== -1) {
            classCounts[classId] = (classCounts[classId] || 0) + 1;
          }

          images.push({
            name: file,
            path: filePath,
            url: `media://${filePath.replace(/\\/g, '/')}`,
            size: stat.size,
            createdAt: stat.birthtimeMs || stat.mtimeMs,
            classId,
            className
          });
        }
      }
    } catch (e) {
      console.error('[Main] Failed to list train images:', e);
    }
  }

  // Map to structure
  const classesList = Object.entries(names).map(([idStr, name]) => {
    const id = parseInt(idStr, 10);
    return {
      id,
      name,
      count: classCounts[id] || 0
    };
  });

  // Sort images by date (newest first)
  images.sort((a, b) => b.createdAt - a.createdAt);

  return {
    classes: classesList,
    images
  };
});

ipcMain.handle('dataset:delete-image', async (event, imagePath: string) => {
  try {
    const filename = path.basename(imagePath);
    const datasetsDir = getDatasetsDir();

    // Resolve all 4 corresponding file paths
    const trainImg = path.join(datasetsDir, 'images', 'train', filename);
    const validImg = path.join(datasetsDir, 'images', 'valid', filename);

    const txtFilename = filename.substring(0, filename.lastIndexOf('.')) + '.txt';
    const trainLbl = path.join(datasetsDir, 'labels', 'train', txtFilename);
    const validLbl = path.join(datasetsDir, 'labels', 'valid', txtFilename);

    // Delete files if they exist
    if (fs.existsSync(trainImg)) await fs.promises.unlink(trainImg);
    if (fs.existsSync(validImg)) await fs.promises.unlink(validImg);
    if (fs.existsSync(trainLbl)) await fs.promises.unlink(trainLbl);
    if (fs.existsSync(validLbl)) await fs.promises.unlink(validLbl);

    return { success: true };
  } catch (err) {
    console.error('[Main] Failed to delete dataset image:', err);
    throw err;
  }
});

ipcMain.handle('dataset:delete-class', async (event, classId: number, className: string) => {
  try {
    const datasetsDir = getDatasetsDir();
    const yamlPath = path.join(datasetsDir, 'dataset.yaml');

    // 1. Delete matching images and labels
    const folders = [
      { img: path.join(datasetsDir, 'images', 'train'), lbl: path.join(datasetsDir, 'labels', 'train') },
      { img: path.join(datasetsDir, 'images', 'valid'), lbl: path.join(datasetsDir, 'labels', 'valid') }
    ];

    for (const folder of folders) {
      if (fs.existsSync(folder.img)) {
        const files = await fs.promises.readdir(folder.img);
        for (const file of files) {
          const fileExt = path.extname(file).toLowerCase();
          if (['.jpg', '.jpeg', '.png', '.bmp', '.webp'].includes(fileExt)) {
            // Check if captured prefix matches or read label to verify class
            let match = false;
            const capturedMatch = file.match(/^captured_([^_]+(?:_[^_]+)*)_(\d+)\./i);
            if (capturedMatch && capturedMatch[1].toLowerCase() === className.toLowerCase()) {
              match = true;
            } else {
              const labelFile = file.substring(0, file.lastIndexOf('.')) + '.txt';
              const labelPath = path.join(folder.lbl, labelFile);
              if (fs.existsSync(labelPath)) {
                try {
                  const labelContent = await fs.promises.readFile(labelPath, 'utf-8');
                  const classMatch = labelContent.trim().match(/^(\d+)/);
                  if (classMatch && parseInt(classMatch[1], 10) === classId) {
                    match = true;
                  }
                } catch (e) {
                  // Ignore read error
                }
              }
            }

            if (match) {
              const imgPath = path.join(folder.img, file);
              const labelFile = file.substring(0, file.lastIndexOf('.')) + '.txt';
              const lblPath = path.join(folder.lbl, labelFile);

              if (fs.existsSync(imgPath)) await fs.promises.unlink(imgPath);
              if (fs.existsSync(lblPath)) await fs.promises.unlink(lblPath);
            }
          }
        }
      }
    }

    // 2. Remove class from dataset.yaml names dictionary
    const yamlData = parseDatasetYaml(yamlPath);
    if (yamlData.names && yamlData.names[classId] !== undefined) {
      delete yamlData.names[classId];
      writeDatasetYaml(yamlPath, yamlData);
    }

    return { success: true };
  } catch (err) {
    console.error('[Main] Failed to delete class:', err);
    throw err;
  }
});

ipcMain.handle('dataset-trainer:start', async (event, config: { epochs: number; batch: number; device: string }) => {
  if (datasetTrainerProcess && !datasetTrainerProcess.killed) {
    return { success: false, message: 'O treinador de IA ja esta em execucao.' };
  }

  const trainerPath = path.join(PROJECT_DIR, 'ai-engine', 'dataset_trainer.py');
  const trainerExecutablePath = getDatasetTrainerExecutablePath();
  if (!trainerExecutablePath && !fs.existsSync(trainerPath)) {
    throw new Error(`Treinador de dataset nao encontrado. Esperado dataset_trainer.exe ou ${trainerPath}`);
  }

  // Start trainer process pointing to our active model path as the destination
  datasetTrainerProcess = await launchDatasetTrainerProcess(trainerPath, {
    epochs: config.epochs || 50,
    batch: config.batch || 8,
    device: config.device || 'auto',
    output: generalSettings.modelPath
  });

  datasetTrainerProcess.on('close', () => {
    datasetTrainerProcess = null;
  });

  datasetTrainerProcess.on('error', (err) => {
    console.error('[Main] Failed to start Dataset trainer:', err);
    datasetTrainerProcess = null;
  });

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
  
  // Ensure the configured directories exist
  try {
    if (generalSettings.recordingsFolder && !fs.existsSync(generalSettings.recordingsFolder)) {
      fs.mkdirSync(generalSettings.recordingsFolder, { recursive: true });
    }
    if (generalSettings.snapshotsFolder && !fs.existsSync(generalSettings.snapshotsFolder)) {
      fs.mkdirSync(generalSettings.snapshotsFolder, { recursive: true });
    }
    if (generalSettings.datasetsFolder && !fs.existsSync(generalSettings.datasetsFolder)) {
      fs.mkdirSync(generalSettings.datasetsFolder, { recursive: true });
    }
  } catch (err) {
    console.error('Failed to create settings directories on save:', err);
  }

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

ipcMain.handle('settings:select-directory', async (event, defaultPath?: string) => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: defaultPath || undefined
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
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
  const ffmpegPath = getFFmpegPath();
  assertFFmpegExists(ffmpegPath);

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

  console.log(`[Main] Trimming video with FFmpeg: ${ffmpegPath} ${ffmpegArgs.join(' ')}`);

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
      console.error(`[Main] Failed to start FFmpeg trim process at ${ffmpegPath}:`, err);
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

const activeAiScans = new Map<string, boolean>();

async function runVideoAiScan(filePath: string, durationSec: number, window: BrowserWindow | null) {
  activeAiScans.set(filePath, true);

  const ffmpegPath = getFFmpegPath();
  const scanFps = 5; // Scan 5 frames per second
  const totalFrames = Math.max(1, Math.round(durationSec * scanFps));

  // Spawn ffmpeg to output raw RGBA frames at 640x640 at 5 FPS
  const ffmpegArgs = [
    '-i', filePath,
    '-vf', `scale=640:640,fps=${scanFps}`,
    '-f', 'image2pipe',
    '-pix_fmt', 'rgba',
    '-vcodec', 'rawvideo',
    '-'
  ];

  const proc = spawn(ffmpegPath, ffmpegArgs);
  const frameSize = 640 * 640 * 4; // 1,638,400 bytes

  let bufferAccumulator = Buffer.alloc(0);
  let frameIndex = 0;
  const detectionsList: any[] = [];
  let stderr = '';

  proc.stderr?.on('data', (data) => {
    stderr += data.toString();
  });

  const processClosePromise = new Promise<number | null>((resolve, reject) => {
    proc.on('close', (code) => {
      resolve(code);
    });
    proc.on('error', (err) => {
      reject(err);
    });
  });

  let prevMotionGrid: number[] | null = null;
  const cellThreshold = 10.0; // sensitive motion threshold

  try {
    // Sequential stream reading process to enforce backpressure and cap memory usage at ~1.6MB per frame
    for await (const chunk of proc.stdout) {
      bufferAccumulator = Buffer.concat([bufferAccumulator, chunk]);
      while (bufferAccumulator.length >= frameSize) {
        const frameBuffer = bufferAccumulator.subarray(0, frameSize);
        bufferAccumulator = bufferAccumulator.subarray(frameSize);

        const timestamp = frameIndex / scanFps;

        // 1. Downsample the 640x640 frame to a 16x16 grid for motion detection
        const grid = new Array(256).fill(0);
        const blockSize = 40; // 640 / 16
        const numPixelsPerBlock = blockSize * blockSize;

        for (let r = 0; r < 16; r++) {
          for (let c = 0; c < 16; c++) {
            let sumLuminance = 0;
            const startX = c * blockSize;
            const startY = r * blockSize;

            for (let dy = 0; dy < blockSize; dy++) {
              const y = startY + dy;
              const rowOffset = y * 640 * 4;
              for (let dx = 0; dx < blockSize; dx++) {
                const x = startX + dx;
                const pxIdx = rowOffset + x * 4;
                
                const red = frameBuffer[pxIdx];
                const green = frameBuffer[pxIdx + 1];
                const blue = frameBuffer[pxIdx + 2];
                
                const luminance = 0.299 * red + 0.587 * green + 0.114 * blue;
                sumLuminance += luminance;
              }
            }
            grid[r * 16 + c] = sumLuminance / numPixelsPerBlock;
          }
        }

        let hasMotion = false;
        let motionBox = null;

        if (prevMotionGrid) {
          let changedCells = 0;
          const changedIndices: number[] = [];

          for (let i = 0; i < 256; i++) {
            const diff = Math.abs(grid[i] - prevMotionGrid[i]);
            if (diff > cellThreshold) {
              changedCells++;
              changedIndices.push(i);
            }
          }

          // Sensitive detection: 2 changed cells (0.78% of screen) triggers motion
          hasMotion = changedCells >= 2 && changedCells < 220;

          if (hasMotion) {
            let minCol = 16;
            let maxCol = -1;
            let minRow = 16;
            let maxRow = -1;

            for (const idx of changedIndices) {
              const col = idx % 16;
              const row = Math.floor(idx / 16);
              if (col < minCol) minCol = col;
              if (col > maxCol) maxCol = col;
              if (row < minRow) minRow = row;
              if (row > maxRow) maxRow = row;
            }

            motionBox = {
              x: minCol / 16,
              y: minRow / 16,
              width: (maxCol - minCol + 1) / 16,
              height: (maxRow - minRow + 1) / 16
            };
          }
        }

        prevMotionGrid = grid;

        // 2. Perform AI object detection
        const frameDetections = [];
        if (detector) {
          try {
            const datasetsDir = getDatasetsDir();
            const yamlPath = path.join(datasetsDir, 'dataset.yaml');
            const { names: customClasses } = parseDatasetYaml(yamlPath);

            const detections = await detector.detect(frameBuffer, customClasses);
            if (detections && detections.length > 0) {
              frameDetections.push(...detections.map(d => ({
                label: d.label,
                confidence: d.confidence,
                box: d.box
              })));
            }
          } catch (err) {
            console.error('[AI Scan] Detection error:', err);
          }
        }

        // 3. Integrate motion detection if present
        if (hasMotion && motionBox) {
          frameDetections.push({
            label: 'movimento',
            confidence: 0.9,
            box: motionBox
          });
        }

        if (frameDetections.length > 0) {
          detectionsList.push({
            time: timestamp,
            detections: frameDetections
          });
        }

        frameIndex++;
        const progress = Math.min(99, Math.round((frameIndex / totalFrames) * 100));
        window?.webContents.send('recordings:ai-progress', { filePath, progress });
      }
    }

    // Wait for the FFmpeg process to close to retrieve final exit code
    const code = await processClosePromise;

    activeAiScans.delete(filePath);

    if (code === 0 || code === null) {
      const jsonPath = filePath.replace(/\.mp4$/i, '.json');
      await fs.promises.writeFile(jsonPath, JSON.stringify(detectionsList, null, 2));
      console.log(`[AI Scan] Scan complete, saved detections to: ${jsonPath}`);
      window?.webContents.send('recordings:ai-progress', { filePath, progress: 100 });
      return { success: true };
    } else {
      console.error('[AI Scan] FFmpeg error output:', stderr);
      throw new Error(`FFmpeg exited with code ${code}`);
    }
  } catch (err: any) {
    activeAiScans.delete(filePath);
    try {
      proc.kill();
    } catch {}
    throw err;
  }
}

ipcMain.handle('recordings:process-ai', async (event, filePath: string, duration: number) => {
  if (activeAiScans.has(filePath)) {
    return { success: false, message: 'Processamento ja em andamento para este video.' };
  }

  if (!detector) {
    throw new Error('Detector de IA nao inicializado.');
  }

  // Run the async scan loop in background
  runVideoAiScan(filePath, duration, mainWindow).catch((err) => {
    console.error(`[AI Scan] Failed to run AI scan on ${filePath}:`, err);
    mainWindow?.webContents.send('recordings:ai-progress', { filePath, progress: -1, error: err.message });
  });

  return { success: true };
});

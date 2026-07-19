import { app, ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { CameraConfig, SystemEvent } from '../../shared/types';

// Persistence file paths in OS AppData directory
const USER_DATA_PATH = app.getPath('userData');
export const CAMERAS_FILE = path.join(USER_DATA_PATH, 'cameras.json');
export const EVENTS_FILE = path.join(USER_DATA_PATH, 'events.json');
export const SETTINGS_FILE = path.join(USER_DATA_PATH, 'settings.json');

const PROJECT_DIR = process.cwd();

export let cameras: CameraConfig[] = [];
export let events: SystemEvent[] = [];
export let generalSettings = {
  modelPath: path.join(USER_DATA_PATH, 'yolo11n.onnx'),
  recordingsFolder: '',
  snapshotsFolder: '',
  datasetsFolder: '',
  enableGpu: false,
  needsConfiguration: true
};

export function loadDatabases() {
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
        source: '0',
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
      if (loaded.recordingsFolder && loaded.needsConfiguration === undefined) {
        generalSettings.needsConfiguration = false;
      }
    } catch (e) {
      console.error('Error loading settings.json', e);
    }
  } else {
    try {
      generalSettings.recordingsFolder = path.join(app.getPath('videos'), 'SmartCamRecordings');
      generalSettings.snapshotsFolder = path.join(app.getPath('pictures'), 'SmartCamSnapshots');
      generalSettings.datasetsFolder = path.join(app.getPath('documents'), 'SmartCamDatasets');
      
      if (!fs.existsSync(generalSettings.recordingsFolder)) fs.mkdirSync(generalSettings.recordingsFolder, { recursive: true });
      if (!fs.existsSync(generalSettings.snapshotsFolder)) fs.mkdirSync(generalSettings.snapshotsFolder, { recursive: true });
      if (!fs.existsSync(generalSettings.datasetsFolder)) fs.mkdirSync(generalSettings.datasetsFolder, { recursive: true });
    } catch (err) {
      console.error('Failed to set up default system directories:', err);
      generalSettings.recordingsFolder = path.join(PROJECT_DIR, 'recordings');
      generalSettings.snapshotsFolder = path.join(PROJECT_DIR, 'snapshots');
      generalSettings.datasetsFolder = path.join(PROJECT_DIR, 'ai-engine', 'datasets');
    }
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(generalSettings, null, 2));
  }
}

export function saveCameras() {
  fs.writeFileSync(CAMERAS_FILE, JSON.stringify(cameras, null, 2));
}

export function saveEvents() {
  if (events.length > 500) {
    events = events.slice(-500);
  }
  fs.writeFileSync(EVENTS_FILE, JSON.stringify(events, null, 2));
}

export function saveSettingsDb() {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(generalSettings, null, 2));
}

export function getAiEngineBaseDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'ai-engine');
  }
  return path.join(PROJECT_DIR, 'ai-engine');
}

export function getDatasetsDir() {
  if (generalSettings.datasetsFolder) {
    return generalSettings.datasetsFolder;
  }
  return path.join(getAiEngineBaseDir(), 'datasets');
}

export function setCameras(newCameras: CameraConfig[]) {
  cameras = newCameras;
}

export function setEvents(newEvents: SystemEvent[]) {
  events = newEvents;
}

export function setGeneralSettings(newSettings: typeof generalSettings) {
  generalSettings = newSettings;
}

export function registerDatabaseHandlers(onSettingsSaved?: (oldSettings: typeof generalSettings) => void) {
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

  ipcMain.handle('events:get', () => {
    return events;
  });

  ipcMain.handle('events:clear', () => {
    events = [];
    saveEvents();
    return events;
  });

  ipcMain.handle('settings:get', () => {
    return generalSettings;
  });

  ipcMain.handle('settings:save', (event, newSettings: any) => {
    const oldSettings = { ...generalSettings };
    generalSettings = { ...generalSettings, ...newSettings };
    
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

    if (onSettingsSaved) {
      onSettingsSaved(oldSettings);
    }

    return generalSettings;
  });
}

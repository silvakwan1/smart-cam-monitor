import { contextBridge, ipcRenderer } from 'electron';
import { CameraConfig, RecordingMode } from '../shared/types';

contextBridge.exposeInMainWorld('electronAPI', {
  // Camera Configuration management
  getCameras: () => ipcRenderer.invoke('cameras:get'),
  saveCamera: (config: CameraConfig) => ipcRenderer.invoke('cameras:save', config),
  removeCamera: (id: string) => ipcRenderer.invoke('cameras:remove', id),

  // Camera stream controls
  startCamera: (id: string, recordMode: RecordingMode) => ipcRenderer.invoke('camera:start', id, recordMode),
  stopCamera: () => ipcRenderer.invoke('camera:stop'),
  setRecordingMode: (mode: RecordingMode) => ipcRenderer.invoke('camera:set-recording', mode),
  takeManualSnapshot: () => ipcRenderer.invoke('camera:take-snapshot'),
  startTrainer: (className: string, cameraSource?: string) => ipcRenderer.invoke('trainer:start', className, cameraSource),
  getDatasetData: () => ipcRenderer.invoke('dataset:get-data'),
  deleteDatasetImage: (path: string) => ipcRenderer.invoke('dataset:delete-image', path),
  deleteDatasetClass: (classId: number, className: string) => ipcRenderer.invoke('dataset:delete-class', classId, className),
  startDatasetTrainer: (config: { epochs: number; batch: number; device: string }) => ipcRenderer.invoke('dataset-trainer:start', config),

  // Event logger history
  getEvents: () => ipcRenderer.invoke('events:get'),
  clearEvents: () => ipcRenderer.invoke('events:clear'),

  // Application configurations
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: any) => ipcRenderer.invoke('settings:save', settings),
  listSystemDevices: () => ipcRenderer.invoke('system:list-devices'),

  // Recordings file management
  getRecordings: () => ipcRenderer.invoke('recordings:list'),
  openRecordingsFolder: () => ipcRenderer.invoke('recordings:open-folder'),
  deleteRecording: (path: string) => ipcRenderer.invoke('recordings:delete', path),
  deleteMultipleRecordings: (paths: string[]) => ipcRenderer.invoke('recordings:delete-multiple', paths),
  trimRecording: (filePath: string, startTime: number, duration: number) => ipcRenderer.invoke('recordings:trim', filePath, startTime, duration),
  getRecordingDetections: (path: string) => ipcRenderer.invoke('recordings:get-detections', path),
  processRecordingAi: (filePath: string, duration: number) => ipcRenderer.invoke('recordings:process-ai', filePath, duration),
  onAiProgress: (callback: (event: any, data: { filePath: string; progress: number; error?: string }) => void) => {
    const listener = (event: any, args: any) => callback(event, args);
    ipcRenderer.on('recordings:ai-progress', listener);
    return () => {
      ipcRenderer.removeListener('recordings:ai-progress', listener);
    };
  },

  // Snapshots file management
  getSnapshots: () => ipcRenderer.invoke('snapshots:list'),
  openSnapshotsFolder: () => ipcRenderer.invoke('snapshots:open-folder'),
  deleteSnapshot: (path: string) => ipcRenderer.invoke('snapshots:delete', path),
  deleteMultipleSnapshots: (paths: string[]) => ipcRenderer.invoke('snapshots:delete-multiple', paths),

  // Electron Main -> React Renderer event registration
  onFrame: (callback: (event: any, data: { base64Frame: string; detections: any[]; stats: { captureFps: number; inferenceFps: number } }) => void) => {
    const listener = (event: any, args: any) => callback(event, args);
    ipcRenderer.on('camera:frame', listener);
    return () => {
      ipcRenderer.removeListener('camera:frame', listener);
    };
  },
  
  onStatus: (callback: (event: any, status: string) => void) => {
    const listener = (event: any, args: any) => callback(event, args);
    ipcRenderer.on('camera:status', listener);
    return () => {
      ipcRenderer.removeListener('camera:status', listener);
    };
  },

  onSystemEvent: (callback: (event: any, sysEvent: any) => void) => {
    const listener = (event: any, args: any) => callback(event, args);
    ipcRenderer.on('system:event', listener);
    return () => {
      ipcRenderer.removeListener('system:event', listener);
    };
  },

  onStats: (callback: (event: any, stats: any) => void) => {
    const listener = (event: any, args: any) => callback(event, args);
    ipcRenderer.on('system:stats', listener);
    return () => {
      ipcRenderer.removeListener('system:stats', listener);
    };
  }
});

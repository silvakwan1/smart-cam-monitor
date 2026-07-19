import { CameraConfig, RecordingMode, SystemEvent, SystemStats } from '../shared/types';

export interface IElectronAPI {
  getCameras: () => Promise<CameraConfig[]>;
  saveCamera: (config: CameraConfig) => Promise<CameraConfig[]>;
  removeCamera: (id: string) => Promise<CameraConfig[]>;
  
  startCamera: (id: string, recordMode: RecordingMode) => Promise<{ success: boolean }>;
  stopCamera: () => Promise<{ success: boolean }>;
  setRecordingMode: (mode: RecordingMode) => Promise<{ success: boolean }>;
  takeManualSnapshot: () => Promise<{ success: boolean }>;

  getEvents: () => Promise<SystemEvent[]>;
  clearEvents: () => Promise<SystemEvent[]>;

  getSettings: () => Promise<any>;
  saveSettings: (settings: any) => Promise<any>;
  listSystemDevices: () => Promise<string[]>;
  getRecordings: () => Promise<any[]>;
  openRecordingsFolder: () => Promise<{ success: boolean }>;
  deleteRecording: (path: string) => Promise<{ success: boolean }>;
  deleteMultipleRecordings: (paths: string[]) => Promise<{ success: boolean; deletedCount: number }>;
  trimRecording: (filePath: string, startTime: number, duration: number) => Promise<{ success: boolean; path: string }>;
  getRecordingDetections: (path: string) => Promise<any[]>;

  getSnapshots: () => Promise<any[]>;
  openSnapshotsFolder: () => Promise<{ success: boolean }>;
  deleteSnapshot: (path: string) => Promise<{ success: boolean }>;
  deleteMultipleSnapshots: (paths: string[]) => Promise<{ success: boolean; deletedCount: number }>;

  onFrame: (
    callback: (
      event: any,
      data: {
        base64Frame: string;
        detections: any[];
        stats: { captureFps: number; inferenceFps: number };
      }
    ) => void
  ) => () => void;
  
  onStatus: (callback: (event: any, status: string) => void) => () => void;
  onSystemEvent: (callback: (event: any, sysEvent: any) => void) => () => void;
  onStats: (callback: (event: any, stats: any) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}

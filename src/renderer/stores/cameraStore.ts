import { create } from 'zustand';
import { CameraConfig, CameraStatus, Detection, RecordingMode, SystemStats } from '../../shared/types';

interface CameraState {
  cameras: CameraConfig[];
  activeCameraId: string | null;
  cameraStatus: CameraStatus;
  recordingMode: RecordingMode;
  
  latestFrame: string | null;
  latestDetections: Detection[];
  captureFps: number;
  inferenceFps: number;
  systemStats: SystemStats | null;
  isFullscreen: boolean;

  // Actions
  toggleFullscreen: () => void;
  fetchCameras: () => Promise<void>;
  saveCamera: (config: CameraConfig) => Promise<void>;
  removeCamera: (id: string) => Promise<void>;
  
  startStreaming: (id: string, recordMode: RecordingMode) => Promise<void>;
  stopStreaming: () => Promise<void>;
  setRecordingMode: (mode: RecordingMode) => Promise<void>;
  takeSnapshot: () => Promise<void>;

  // Updates from IPC listeners
  setFrameData: (base64Frame: string, detections: Detection[], stats: { captureFps: number; inferenceFps: number }) => void;
  setStatus: (status: CameraStatus) => void;
  setSystemStats: (stats: SystemStats) => void;
}

export const useCameraStore = create<CameraState>()((set, get) => ({
  cameras: [],
  activeCameraId: null,
  cameraStatus: 'disconnected',
  recordingMode: 'off',
  
  latestFrame: null,
  latestDetections: [],
  captureFps: 0,
  inferenceFps: 0,
  systemStats: null,
  isFullscreen: false,

  toggleFullscreen: () => set((state) => ({ isFullscreen: !state.isFullscreen })),

  fetchCameras: async () => {
    try {
      const list = await window.electronAPI.getCameras();
      set({ cameras: list });
    } catch (err) {
      console.error('Failed to fetch cameras list:', err);
    }
  },

  saveCamera: async (config) => {
    try {
      const list = await window.electronAPI.saveCamera(config);
      set({ cameras: list });
    } catch (err) {
      console.error('Failed to save camera configuration:', err);
      throw err;
    }
  },

  removeCamera: async (id) => {
    try {
      const list = await window.electronAPI.removeCamera(id);
      set({ cameras: list });
      
      // If we are currently streaming the deleted camera, stop it
      if (get().activeCameraId === id) {
        await get().stopStreaming();
      }
    } catch (err) {
      console.error('Failed to delete camera:', err);
      throw err;
    }
  },

  startStreaming: async (id, recordMode) => {
    try {
      set({ cameraStatus: 'connecting', activeCameraId: id, recordingMode: recordMode });
      await window.electronAPI.startCamera(id, recordMode);
    } catch (err) {
      set({ cameraStatus: 'error' });
      console.error('Failed to start camera streaming:', err);
      throw err;
    }
  },

  stopStreaming: async () => {
    try {
      await window.electronAPI.stopCamera();
      set({
        activeCameraId: null,
        cameraStatus: 'disconnected',
        latestFrame: null,
        latestDetections: [],
        captureFps: 0,
        inferenceFps: 0
      });
    } catch (err) {
      console.error('Failed to stop camera stream:', err);
    }
  },

  setRecordingMode: async (mode) => {
    try {
      await window.electronAPI.setRecordingMode(mode);
      set({ recordingMode: mode });
    } catch (err) {
      console.error('Failed to toggle recording mode:', err);
    }
  },

  takeSnapshot: async () => {
    try {
      await window.electronAPI.takeManualSnapshot();
    } catch (err) {
      console.error('Failed to take camera snapshot:', err);
    }
  },

  setFrameData: (base64Frame, detections, stats) => {
    set({
      latestFrame: base64Frame,
      latestDetections: detections,
      captureFps: stats.captureFps,
      inferenceFps: stats.inferenceFps
    });
  },

  setStatus: (status) => {
    set({ cameraStatus: status });
  },

  setSystemStats: (stats) => {
    set({ systemStats: stats });
  }
}));

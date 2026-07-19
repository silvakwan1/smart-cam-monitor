export type CameraType = 'usb' | 'ip' | 'capture_card';

export interface CameraConfig {
  id: string;
  name: string;
  type: CameraType;
  source: string; // Device index (e.g., '0') or RTSP URL
  width: number;
  height: number;
  fps: number;
  isActive: boolean;
  crossbarPin?: number; // RCA input pin for capture cards (0 to 3)
}

export type CameraStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface BoundingBox {
  x: number; // 0.0 to 1.0 relative
  y: number; // 0.0 to 1.0 relative
  width: number; // 0.0 to 1.0 relative
  height: number; // 0.0 to 1.0 relative
}

export interface Detection {
  label: 'person' | 'dog' | 'cat' | 'car' | 'truck' | 'bicycle' | 'motorcycle';
  confidence: number; // 0.0 to 1.0
  box: BoundingBox;
}

export interface FrameData {
  cameraId: string;
  timestamp: number;
  width: number;
  height: number;
  base64Frame: string; // Base64 JPEG buffer
  detections: Detection[];
  captureFps: number;
  detectionFps: number;
}

export interface SystemEvent {
  id: string;
  cameraId: string;
  cameraName: string;
  timestamp: number;
  type: 'person_detected' | 'person_left' | 'object_detected' | 'object_lost' | 'motion_detected' | 'camera_error' | 'frame_lost';
  label?: string;
  confidence?: number;
  snapshotPath?: string;
  snapshotData?: string; // Base64 data for immediate renderer view
}

export type RecordingMode = 'continuous' | 'motion' | 'detection' | 'off';

export interface RecordingConfig {
  cameraId: string;
  mode: RecordingMode;
  savePath: string;
  maxSegmentMinutes: number;
}

export interface SystemStats {
  cpuUsage: number;
  memoryUsage: number;
  gpuUsage: number;
  fpsMap: Record<string, { capture: number; inference: number }>;
}

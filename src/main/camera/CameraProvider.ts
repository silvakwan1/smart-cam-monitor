import { CameraConfig } from '../../shared/types';

export interface CameraProvider {
  connect(config: CameraConfig): Promise<void>;
  disconnect(): Promise<void>;
  start(onFrame: (frameBuffer: Buffer) => void, onError: (err: Error) => void): void;
  stop(): Promise<void>;
  getFrame(): Buffer | null;
}

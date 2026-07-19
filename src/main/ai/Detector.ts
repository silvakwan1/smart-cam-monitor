import { Detection } from '../../shared/types';

export interface Detector {
  initialize(): Promise<void>;
  detect(rawRgbaBuffer: Buffer): Promise<Detection[]>;
  close(): Promise<void>;
}

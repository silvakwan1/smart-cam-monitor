import { Detection } from '../../shared/types';

export interface Detector {
  initialize(): Promise<void>;
  detect(jpegBuffer: Buffer): Promise<Detection[]>;
  close(): Promise<void>;
}

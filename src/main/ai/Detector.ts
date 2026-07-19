import { Detection } from '../../shared/types';

export interface Detector {
  initialize(): Promise<void>;
  detect(rawRgbaBuffer: Buffer, customClasses?: Record<number, string>): Promise<Detection[]>;
  close(): Promise<void>;
}

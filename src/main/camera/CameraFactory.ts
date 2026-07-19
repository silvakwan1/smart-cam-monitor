import { CameraConfig } from '../../shared/types';
import { CameraProvider } from './CameraProvider';
import { UsbCamera } from './UsbCamera';
import { IpCamera } from './IpCamera';
import { CaptureCardCamera } from './CaptureCard';

export class CameraFactory {
  /**
   * Instantiates a camera provider based on type.
   */
  static createCamera(config: CameraConfig): CameraProvider {
    switch (config.type) {
      case 'usb':
        return new UsbCamera();
      case 'ip':
        return new IpCamera();
      case 'capture_card':
        return new CaptureCardCamera();
      default:
        throw new Error(`Unsupported camera provider type: ${(config as any).type}`);
    }
  }
}

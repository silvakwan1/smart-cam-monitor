import { UsbCamera } from './UsbCamera';
import { CameraConfig } from '../../shared/types';
import { CameraProvider } from './CameraProvider';

/**
 * CaptureCardCamera extends UsbCamera's behavior but adapts it specifically for
 * video capture cards (like EasyCAP, HDMI-to-USB cards) which may require custom 
 * resolution scaling, pixel format specifications, or special DirectShow inputs.
 */
export class CaptureCardCamera implements CameraProvider {
  private usbCameraInstance: UsbCamera;

  constructor() {
    this.usbCameraInstance = new UsbCamera();
  }

  async connect(config: CameraConfig): Promise<void> {
    // Custom configurations can be pre-processed here for legacy capture cards
    // e.g. EasyCAP cards typically run at 720x480 (NTSC) or 720x576 (PAL)
    const adaptedConfig: CameraConfig = {
      ...config,
      width: config.width || 720,
      height: config.height || 480,
    };
    
    await this.usbCameraInstance.connect(adaptedConfig);
  }

  async disconnect(): Promise<void> {
    await this.usbCameraInstance.disconnect();
  }

  start(onFrame: (frameBuffer: Buffer) => void, onError: (err: Error) => void): void {
    this.usbCameraInstance.start(onFrame, onError);
  }

  async stop(): Promise<void> {
    await this.usbCameraInstance.stop();
  }

  getFrame(): Buffer | null {
    return this.usbCameraInstance.getFrame();
  }
}

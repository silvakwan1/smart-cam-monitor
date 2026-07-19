import { ChildProcess, spawn } from 'child_process';
import { CameraConfig } from '../../shared/types';
import { assertFFmpegExists, getFFmpegPath } from '../utils/ffmpeg';
import { CameraProvider } from './CameraProvider';
import { listDevices } from './listDevices';

export class UsbCamera implements CameraProvider {
  private config: CameraConfig | null = null;
  private ffmpegProcess: ChildProcess | null = null;
  private latestFrame: Buffer | null = null;
  private onFrameCallback: ((frame: Buffer) => void) | null = null;
  private onErrorCallback: ((err: Error) => void) | null = null;
  private isStreaming: boolean = false;

  async connect(config: CameraConfig): Promise<void> {
    this.config = config;
  }

  async disconnect(): Promise<void> {
    await this.stop();
    this.config = null;
  }

  start(onFrame: (frame: Buffer) => void, onError: (err: Error) => void): void {
    if (!this.config) {
      onError(new Error('Camera not connected. Call connect() first.'));
      return;
    }

    this.onFrameCallback = onFrame;
    this.onErrorCallback = onError;
    this.isStreaming = true;

    const width = this.config.width || 640;
    const height = this.config.height || 480;
    const fps = this.config.fps || 30;

    // Run async setup IIFE to avoid blocking the caller
    (async () => {
      let ffmpegArgs: string[] = [];

      try {
        const ffmpegPath = getFFmpegPath();
        assertFFmpegExists(ffmpegPath);

        if (process.platform === 'win32') {
          // On Windows, if user specifies '0' or empty, dynamically query physical inputs
          let deviceName = this.config!.source;
          if (deviceName === '0' || !deviceName) {
            try {
              const devices = await listDevices();
              if (devices.length > 0) {
                deviceName = devices[0];
                console.log(`[UsbCamera] Auto-detected camera input: "${deviceName}"`);
              } else {
                deviceName = 'Integrated Camera';
              }
            } catch (err) {
              console.error('[UsbCamera] Failed to list devices, falling back to Integrated Camera:', err);
              deviceName = 'Integrated Camera';
            }
          }

          const input = deviceName.startsWith('video=') ? deviceName : `video=${deviceName}`;
          
          ffmpegArgs = [
            '-f', 'dshow'
          ];

          // Add crossbar pin index ONLY if using a multi-channel capture card (0 to 3)
          if (this.config!.type === 'capture_card' && this.config!.crossbarPin !== undefined && this.config!.crossbarPin >= 0) {
            ffmpegArgs.push('-crossbar_video_input_pin_number', this.config!.crossbarPin.toString());
          }

          ffmpegArgs.push(
            '-rtbufsize', '100M',
            '-i', input,
            '-vf', `scale=${width}:${height}`,
            '-r', fps.toString(),
            '-f', 'image2pipe',
            '-vcodec', 'mjpeg',
            '-q:v', '2',
            '-'
          );
        } else if (process.platform === 'darwin') {
          // macOS avfoundation
          ffmpegArgs = [
            '-f', 'avfoundation',
            '-framerate', fps.toString(),
            '-video_size', `${width}x${height}`,
            '-i', this.config!.source || '0',
            '-f', 'image2pipe',
            '-vcodec', 'mjpeg',
            '-q:v', '2',
            '-'
          ];
        } else {
          // Linux v4l2
          ffmpegArgs = [
            '-f', 'video4linux2',
            '-framerate', fps.toString(),
            '-video_size', `${width}x${height}`,
            '-i', this.config!.source || '/dev/video0',
            '-f', 'image2pipe',
            '-vcodec', 'mjpeg',
            '-q:v', '2',
            '-'
          ];
        }

        if (!this.isStreaming) return;

        console.log(`[UsbCamera] Spawning FFmpeg at ${ffmpegPath} with args:`, ffmpegArgs.join(' '));
        this.ffmpegProcess = spawn(ffmpegPath, ffmpegArgs, {
          stdio: ['ignore', 'pipe', 'pipe']
        });

        let bufferAccumulator: any = Buffer.alloc(0);

        this.ffmpegProcess.stdout?.on('data', (chunk: any) => {
          if (!this.isStreaming) return;
          
          bufferAccumulator = Buffer.concat([bufferAccumulator, chunk]);

          while (bufferAccumulator.length > 0) {
            const startIdx = bufferAccumulator.indexOf(Buffer.from([0xFF, 0xD8]));
            if (startIdx === -1) {
              bufferAccumulator = Buffer.alloc(0);
              break;
            }

            if (startIdx > 0) {
              bufferAccumulator = bufferAccumulator.subarray(startIdx);
            }

            const endIdx = bufferAccumulator.indexOf(Buffer.from([0xFF, 0xD9]));
            if (endIdx === -1) {
              break;
            }

            const frameLength = endIdx + 2;
            const frame = bufferAccumulator.subarray(0, frameLength);
            
            this.latestFrame = frame;
            if (this.onFrameCallback) {
              this.onFrameCallback(frame);
            }

            bufferAccumulator = bufferAccumulator.subarray(frameLength);
          }
        });

        this.ffmpegProcess.stderr?.on('data', (data: Buffer) => {
          const log = data.toString();
          if (log.toLowerCase().includes('error') || log.toLowerCase().includes('fail')) {
            console.error('[UsbCamera FFmpeg Stderr]:', log.trim());
          }
        });

        this.ffmpegProcess.on('error', (err) => {
          console.error(`[UsbCamera] FFmpeg process error at ${ffmpegPath}:`, err);
          if (this.onErrorCallback) {
            this.onErrorCallback(err);
          }
        });

        this.ffmpegProcess.on('close', (code) => {
          console.log(`[UsbCamera] FFmpeg process closed with code ${code}`);
          if (code !== 0 && code !== null && this.isStreaming) {
            if (this.onErrorCallback) {
              this.onErrorCallback(new Error(`FFmpeg process exited with code ${code}`));
            }
          }
        });

      } catch (err) {
        onError(err as Error);
      }
    })();
  }

  async stop(): Promise<void> {
    this.isStreaming = false;
    if (this.ffmpegProcess) {
      this.ffmpegProcess.kill('SIGKILL');
      this.ffmpegProcess = null;
    }
    this.latestFrame = null;
  }

  getFrame(): Buffer | null {
    return this.latestFrame;
  }
}

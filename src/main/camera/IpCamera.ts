import { ChildProcess, spawn } from 'child_process';
import { CameraConfig } from '../../shared/types';
import { assertFFmpegExists, getFFmpegPath } from '../utils/ffmpeg';
import { CameraProvider } from './CameraProvider';

export class IpCamera implements CameraProvider {
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
      onError(new Error('IP Camera not connected. Call connect() first.'));
      return;
    }

    this.onFrameCallback = onFrame;
    this.onErrorCallback = onError;
    this.isStreaming = true;

    const width = this.config.width || 1280; // IP cameras default to higher res
    const height = this.config.height || 720;
    const fps = this.config.fps || 15; // RTSP streams are often 15 FPS to conserve bandwidth

    // Spawn FFmpeg to connect to RTSP stream and output JPEG pipes
    const ffmpegArgs = [
      '-rtsp_transport', 'tcp', // Force TCP transport for RTSP stability
      '-i', this.config.source, // e.g. rtsp://username:password@ip_address:port/path
      '-vf', `scale=${width}:${height}`,
      '-r', fps.toString(),
      '-f', 'image2pipe',
      '-vcodec', 'mjpeg',
      '-q:v', '2',
      '-'
    ];

    try {
      const ffmpegPath = getFFmpegPath();
      assertFFmpegExists(ffmpegPath);

      console.log(`[IpCamera] Connecting to RTSP source using FFmpeg at ${ffmpegPath}...`);
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
            break; // Frame is incomplete
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
          console.error('[IpCamera FFmpeg Stderr]:', log.trim());
        }
      });

      this.ffmpegProcess.on('error', (err) => {
        console.error(`[IpCamera] FFmpeg process error at ${ffmpegPath}:`, err);
        if (this.onErrorCallback) {
          this.onErrorCallback(err);
        }
      });

      this.ffmpegProcess.on('close', (code) => {
        console.log(`[IpCamera] FFmpeg connection closed with code ${code}`);
        if (code !== 0 && code !== null && this.isStreaming) {
          if (this.onErrorCallback) {
            this.onErrorCallback(new Error(`IP Camera stream disconnected. FFmpeg exit code: ${code}`));
          }
        }
      });

    } catch (err) {
      onError(err as Error);
    }
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

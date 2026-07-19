import { ChildProcess, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { assertFFmpegExists, getFFmpegPath } from '../utils/ffmpeg';

export class Recorder {
  private ffmpegProcess: ChildProcess | null = null;
  private isRecording = false;
  private currentFilePath = '';

  /**
   * Starts a new recording session to an MP4 file.
   */
  async startRecording(
    outputPath: string,
    fps: number = 30,
    width: number = 640,
    height: number = 480
  ): Promise<string> {
    if (this.isRecording) {
      throw new Error('Recording is already in progress.');
    }

    const ffmpegPath = getFFmpegPath();
    assertFFmpegExists(ffmpegPath);

    // Ensure output directories exist
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.currentFilePath = outputPath;
    this.isRecording = true;

    // FFmpeg arguments to read MJPEG frames from stdin and encode to H.264 MP4
    const ffmpegArgs = [
      '-f', 'image2pipe',
      '-vcodec', 'mjpeg',
      '-r', fps.toString(),
      '-i', '-', // Read inputs from stdin
      '-vcodec', 'libx264',
      '-profile:v', 'high',
      '-preset', 'veryfast', // Fast compression preset
      '-pix_fmt', 'yuv420p', // Standard pixel format for universal player compatibility
      '-y', // Overwrite if file exists
      outputPath
    ];

    console.log(`[Recorder] Initiating recording with FFmpeg at ${ffmpegPath}: ${outputPath}`);

    try {
      this.ffmpegProcess = spawn(ffmpegPath, ffmpegArgs, {
        stdio: ['pipe', 'ignore', 'pipe']
      });

      // Handle stdin error to prevent uncaught exceptions when writing fails (e.g. after stream ends)
      this.ffmpegProcess.stdin?.on('error', (err) => {
        console.error('[Recorder] FFmpeg stdin error:', err);
      });

      this.ffmpegProcess.stderr?.on('data', (data: Buffer) => {
        const log = data.toString();
        if (log.toLowerCase().includes('error')) {
          console.error('[Recorder FFmpeg Stderr]:', log.trim());
        }
      });

      this.ffmpegProcess.on('error', (err) => {
        console.error(`[Recorder] FFmpeg execution error at ${ffmpegPath}:`, err);
        this.isRecording = false;
      });

    } catch (err) {
      this.isRecording = false;
      throw err;
    }

    return outputPath;
  }

  /**
   * Writes a raw video frame (JPEG buffer) to FFmpeg's encoding stdin stream.
   */
  writeFrame(frameBuffer: Buffer): void {
    if (!this.isRecording || !this.ffmpegProcess || !this.ffmpegProcess.stdin) {
      return;
    }

    // Do not attempt to write if the stdin stream is not writable or is ended
    if (!this.ffmpegProcess.stdin.writable || (this.ffmpegProcess.stdin as any).writableEnded) {
      return;
    }

    try {
      this.ffmpegProcess.stdin.write(frameBuffer);
    } catch (err) {
      console.error('[Recorder] Error writing frame to FFmpeg input stream:', err);
    }
  }

  /**
   * Finalizes the video recording, waits for FFmpeg to finish packaging, and returns the path.
   */
  async stopRecording(): Promise<string> {
    if (!this.isRecording) {
      return '';
    }

    // Set isRecording to false immediately to prevent writeFrame from attempting any new writes
    this.isRecording = false;

    return new Promise((resolve) => {
      if (this.ffmpegProcess) {
        // Signal EOF to FFmpeg so it wraps up encoding
        try {
          this.ffmpegProcess.stdin?.end();
        } catch (err) {
          console.error('[Recorder] Error ending FFmpeg stdin:', err);
        }

        this.ffmpegProcess.on('close', (code) => {
          console.log(`[Recorder] Recording finalized at ${this.currentFilePath}. (Code ${code})`);
          this.ffmpegProcess = null;
          resolve(this.currentFilePath);
        });
      } else {
        resolve(this.currentFilePath);
      }
    });
  }

  /**
   * Saves a single video frame as a snapshot image on disk.
   */
  async saveSnapshot(frameBuffer: Buffer, outputPath: string): Promise<string> {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    await fs.promises.writeFile(outputPath, frameBuffer);
    console.log(`[Recorder] Snapshot successfully saved at: ${outputPath}`);
    return outputPath;
  }

  isActive(): boolean {
    return this.isRecording;
  }

  getFilePath(): string {
    return this.currentFilePath;
  }
}

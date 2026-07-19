import { Worker } from 'worker_threads';
import * as path from 'path';
import { Detection } from '../../shared/types';
import { Detector } from './Detector';
import { app } from 'electron';

export class YoloDetector implements Detector {
  private worker: Worker | null = null;
  private modelPath: string;
  private isInitialized = false;
  private isProcessing = false;
  private resolvePromise: ((detections: Detection[]) => void) | null = null;
  private rejectPromise: ((err: Error) => void) | null = null;
  private initResolve: (() => void) | null = null;
  private initReject: ((err: Error) => void) | null = null;
  
  private lastInferenceTime = 0;
  private inferenceFps = 0;
  private framesCount = 0;
  private lastFpsCalcTime = Date.now();

  constructor(customModelPath?: string) {
    // Determine the default location for yolo11n.onnx in the resources folder
    const appPath = app ? app.getAppPath() : process.cwd();
    const defaultPath = path.resolve(appPath, 'resources/yolo11n.onnx');
    this.modelPath = customModelPath || defaultPath;
  }

  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.initResolve = resolve;
      this.initReject = reject;

      try {
        // Resolve path to the background worker script
        // Esbuild bundles this into dist/main/ai/detection.worker.js
        const workerScriptPath = path.resolve(__dirname, 'ai/detection.worker.js');
        
        console.log(`[YoloDetector] Initializing Worker Thread at: ${workerScriptPath}`);
        this.worker = new Worker(workerScriptPath);

        this.worker.on('message', (msg) => {
          if (msg.type === 'initialized') {
            this.isInitialized = true;
            console.log(`[YoloDetector] Background AI Worker active. (Simulation mode: ${msg.simulation})`);
            if (this.initResolve) {
              this.initResolve();
              this.initResolve = null;
            }
          } else if (msg.type === 'detection_result') {
            this.isProcessing = false;
            this.lastInferenceTime = msg.duration;
            
            // FPS Calculation
            this.framesCount++;
            const now = Date.now();
            const elapsed = now - this.lastFpsCalcTime;
            if (elapsed >= 1000) {
              this.inferenceFps = Math.round((this.framesCount * 1000) / elapsed);
              this.framesCount = 0;
              this.lastFpsCalcTime = now;
            }

            if (this.resolvePromise) {
              this.resolvePromise(msg.detections);
              this.resolvePromise = null;
              this.rejectPromise = null;
            }
          } else if (msg.type === 'error') {
            this.isProcessing = false;
            if (this.rejectPromise) {
              this.rejectPromise(new Error(msg.error));
              this.resolvePromise = null;
              this.rejectPromise = null;
            }
          }
        });

        this.worker.on('error', (err) => {
          console.error('[YoloDetector Worker Process Error]:', err);
          this.isProcessing = false;
          if (this.rejectPromise) {
            this.rejectPromise(err);
          }
          if (this.initReject) {
            this.initReject(err);
            this.initReject = null;
          }
        });

        // Trigger initialization in Worker
        this.worker.postMessage({ type: 'init', modelPath: this.modelPath });

      } catch (err) {
        reject(err as Error);
      }
    });
  }

  async detect(rawRgbaBuffer: Buffer): Promise<Detection[]> {
    if (!this.isInitialized || !this.worker) {
      throw new Error('YoloDetector is not initialized. Please call initialize() first.');
    }

    // Skip the frame if the worker is busy processing a previous one
    if (this.isProcessing) {
      return [];
    }

    this.isProcessing = true;

    return new Promise((resolve, reject) => {
      this.resolvePromise = resolve;
      this.rejectPromise = reject;

      try {
        // Convert Node Buffer to standard ArrayBuffer for thread transfer (zero-copy)
        const rawArrayBuffer = rawRgbaBuffer.buffer.slice(
          rawRgbaBuffer.byteOffset,
          rawRgbaBuffer.byteOffset + rawRgbaBuffer.byteLength
        );

        this.worker?.postMessage(
          {
            type: 'detect',
            width: 640,
            height: 640,
            buffer: rawArrayBuffer
          },
          [rawArrayBuffer] // Mark buffer as transferable (avoid duplicate memory allocation)
        );

      } catch (err) {
        this.isProcessing = false;
        reject(err as Error);
      }
    });
  }

  getInferenceStats() {
    return {
      fps: this.inferenceFps,
      durationMs: this.lastInferenceTime,
      isBusy: this.isProcessing
    };
  }

  async close(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
    }
    this.isInitialized = false;
  }
}

import { app, ipcMain, nativeImage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { CameraConfig, CameraStatus, Detection, SystemEvent, RecordingMode } from '../../shared/types';
import { CameraProvider } from './CameraProvider';
import { CameraFactory } from './CameraFactory';
import { YoloDetector } from '../ai/YoloDetector';
import { Recorder } from '../recording/Recorder';

export class CameraManager {
  private activeCamera: CameraProvider | null = null;
  private activeConfig: CameraConfig | null = null;
  private status: CameraStatus = 'disconnected';
  private detector: YoloDetector;
  private recorder: Recorder;

  // Frame statistics
  private lastFrameTime = Date.now();
  private captureFps = 0;
  private captureFramesCount = 0;
  private lastFpsCalcTime = Date.now();

  // Motion detection state
  private prevMotionGrid: number[] | null = null;
  private isMotionActive = false;
  private motionTriggerTimeout: NodeJS.Timeout | null = null;

  // Intelligent recording state
  private recordingMode: RecordingMode = 'off';
  private postRollTimeout: NodeJS.Timeout | null = null;
  private isRecordingTriggered = false;
  
  // Event history state
  private activeDetections: Detection[] = [];
  private personInScene = false;
  private detectedClassesInScene = new Set<string>();
  private classFramesSinceLastSeen: Record<string, number> = {};
  private readonly COOLDOWN_FRAMES = 45; // Cooldown frames (~1.5 seconds) to buffer flickering detections

  // Recording tracking detections state
  private recordingStartTime = 0;
  private currentRecordingDetections: Array<{ time: number; detections: Detection[] }> = [];

  // AI Inference Throttle state
  private lastInferenceStartTime = 0;

  // Callbacks
  private onFrameUpdate: (base64Frame: string, detections: Detection[], stats: { captureFps: number; inferenceFps: number }) => void;
  private onStatusUpdate: (status: CameraStatus) => void;
  private onEventTriggered: (event: SystemEvent) => void;
  private getSettings: () => { recordingsFolder: string; snapshotsFolder: string };

  constructor(
    detector: YoloDetector,
    onFrameUpdate: (base64Frame: string, detections: Detection[], stats: { captureFps: number; inferenceFps: number }) => void,
    onStatusUpdate: (status: CameraStatus) => void,
    onEventTriggered: (event: SystemEvent) => void,
    getSettings: () => { recordingsFolder: string; snapshotsFolder: string }
  ) {
    this.detector = detector;
    this.recorder = new Recorder();
    this.onFrameUpdate = onFrameUpdate;
    this.onStatusUpdate = onStatusUpdate;
    this.onEventTriggered = onEventTriggered;
    this.getSettings = getSettings;
  }

  async start(config: CameraConfig, recordingMode: RecordingMode = 'off'): Promise<void> {
    if (this.activeCamera) {
      await this.stop();
    }

    this.activeConfig = config;
    this.recordingMode = recordingMode;
    this.updateStatus('connecting');

    try {
      this.activeCamera = CameraFactory.createCamera(config);
      await this.activeCamera.connect(config);

      this.activeCamera.start(
        (frameBuffer) => this.handleFrame(frameBuffer),
        (err) => this.handleCameraError(err)
      );

      this.updateStatus('connected');
      console.log(`[CameraManager] Stream started for ${config.name}`);

      // If continuous recording is enabled from start, boot recording immediately
      if (this.recordingMode === 'continuous') {
        await this.startVideoRecording();
      }

    } catch (err) {
      console.error(`[CameraManager] Failed to start camera ${config.name}:`, err);
      this.updateStatus('error');
      this.emitEvent('camera_error', `Failed to open stream: ${(err as Error).message}`);
      throw err;
    }
  }

  async stop(): Promise<void> {
    if (this.postRollTimeout) clearTimeout(this.postRollTimeout);
    if (this.motionTriggerTimeout) clearTimeout(this.motionTriggerTimeout);
    
    // Stop recording if active
    if (this.recorder.isActive()) {
      await this.stopVideoRecording();
    }

    if (this.activeCamera) {
      await this.activeCamera.stop();
      await this.activeCamera.disconnect();
      this.activeCamera = null;
    }

    this.activeConfig = null;
    this.prevMotionGrid = null;
    this.isMotionActive = false;
    this.isRecordingTriggered = false;
    this.personInScene = false;
    this.detectedClassesInScene.clear();
    this.classFramesSinceLastSeen = {};
    this.updateStatus('disconnected');
    console.log('[CameraManager] Camera stopped successfully.');
  }

  async setRecordingMode(mode: RecordingMode): Promise<void> {
    console.log(`[CameraManager] Changing recording mode from ${this.recordingMode} to ${mode}`);
    
    // If we were recording and mode changed, wrap up active recording
    if (this.recorder.isActive() && mode !== 'continuous' && !this.isRecordingTriggered) {
      await this.stopVideoRecording();
    }

    this.recordingMode = mode;

    // Start recording if continuous was selected
    if (mode === 'continuous' && !this.recorder.isActive()) {
      await this.startVideoRecording();
    }
  }

  private handleFrame(frameBuffer: Buffer): void {
    if (!this.activeConfig) return;

    // Calculate Capture FPS
    this.captureFramesCount++;
    const now = Date.now();
    const elapsedFps = now - this.lastFpsCalcTime;
    if (elapsedFps >= 1000) {
      this.captureFps = Math.round((this.captureFramesCount * 1000) / elapsedFps);
      this.captureFramesCount = 0;
      this.lastFpsCalcTime = now;
    }

    // 1. Decode JPEG using Electron's nativeImage
    try {
      const img = nativeImage.createFromBuffer(frameBuffer);

      // Run Motion Detection on a tiny 16x16 resize (extremely fast)
      const motionImg = img.resize({ width: 16, height: 16 });
      const motionBitmap = motionImg.toBitmap();
      this.runMotionDetection(motionBitmap as unknown as Uint8Array, frameBuffer);

      // 2. Trigger AI worker detection asynchronously if worker is ready and throttled (e.g. max 5 FPS)
      const nowTime = Date.now();
      const DETECTION_THROTTLE_MS = 200;
      const canRunDetection = !this.detector.getInferenceStats().isBusy && (nowTime - this.lastInferenceStartTime >= DETECTION_THROTTLE_MS);

      if (canRunDetection) {
        this.lastInferenceStartTime = nowTime;

        // Only scale to 640x640 when AI needs to process it, saving massive CPU power
        const aiImg = img.resize({ width: 640, height: 640 });
        const aiBitmap = aiImg.toBitmap();

        this.detector.detect(aiBitmap)
          .then((detections) => {
            if (detections.length > 0 || this.activeDetections.length > 0) {
              this.processAIResults(detections, frameBuffer);
            }

            // If video recording is active, save the detections with a relative timestamp
            if (this.recorder.isActive() && this.recordingStartTime > 0) {
              const relativeTime = (Date.now() - this.recordingStartTime) / 1000;
              this.currentRecordingDetections.push({
                time: relativeTime,
                detections: detections.map(d => ({
                  label: d.label,
                  confidence: d.confidence,
                  // Clamp bounding box to screen boundaries [0.0, 1.0] to prevent crashes or overflows
                  box: {
                    x: Math.max(0, Math.min(1, d.box.x)),
                    y: Math.max(0, Math.min(1, d.box.y)),
                    width: Math.max(0, Math.min(1, d.box.width)),
                    height: Math.max(0, Math.min(1, d.box.height))
                  }
                }))
              });
            }
          })
          .catch((err) => {
            console.error('[CameraManager] AI Inference error:', err);
          });
      }
    } catch (err) {
      console.error('[CameraManager] Native frame decode error:', err);
      return;
    }

    // 3. Write frame to recorder if currently active
    if (this.recorder.isActive()) {
      this.recorder.writeFrame(frameBuffer);
    }

    // 4. Update the frontend UI with current frame (Base64 JPEG representation)
    const base64 = frameBuffer.toString('base64');
    const detectorStats = this.detector.getInferenceStats();
    
    this.onFrameUpdate(
      base64,
      this.activeDetections,
      {
        captureFps: this.captureFps,
        inferenceFps: detectorStats.fps
      }
    );
  }

  private processAIResults(detections: Detection[], currentFrame: Buffer): void {
    this.activeDetections = detections;

    const currentClasses = new Set<string>(detections.map(d => d.label));
    
    // 1. Handle Person Detection Hysteresis (cooldown buffering)
    const personDetected = currentClasses.has('person');
    if (personDetected) {
      this.classFramesSinceLastSeen['person'] = 0;
      if (!this.personInScene) {
        this.personInScene = true;
        const bestPerson = detections.find(d => d.label === 'person')!;
        this.emitEvent('person_detected', 'Pessoa detectada na cena', bestPerson, currentFrame);
        
        // Trigger recording in person detection mode
        if (this.recordingMode === 'detection') {
          this.triggerIntelligentRecording();
        }
      }
    } else {
      if (this.personInScene) {
        if (this.classFramesSinceLastSeen['person'] === undefined) {
          this.classFramesSinceLastSeen['person'] = 0;
        }
        this.classFramesSinceLastSeen['person']++;
        
        // Only trigger "person left" if they have been missing for COOLDOWN_FRAMES
        if (this.classFramesSinceLastSeen['person'] >= this.COOLDOWN_FRAMES) {
          this.personInScene = false;
          this.emitEvent('person_left', 'Pessoa saiu da cena');
        }
      }
    }

    // 2. Handle Other Objects Hysteresis
    for (const label of currentClasses) {
      if (label === 'person') continue;
      
      this.classFramesSinceLastSeen[label] = 0;

      if (!this.detectedClassesInScene.has(label)) {
        this.detectedClassesInScene.add(label);
        const item = detections.find(d => d.label === label)!;
        this.emitEvent('object_detected', `Objeto detectado: ${label}`, item, currentFrame);
      }
    }

    // Check for lost objects
    for (const label of Array.from(this.detectedClassesInScene)) {
      if (label === 'person') continue;
      
      if (!currentClasses.has(label)) {
        if (this.classFramesSinceLastSeen[label] === undefined) {
          this.classFramesSinceLastSeen[label] = 0;
        }
        this.classFramesSinceLastSeen[label]++;
        
        // Only trigger "object lost" if it has been missing for COOLDOWN_FRAMES
        if (this.classFramesSinceLastSeen[label] >= this.COOLDOWN_FRAMES) {
          this.detectedClassesInScene.delete(label);
          this.emitEvent('object_lost', `Objeto perdido: ${label}`);
        }
      }
    }
  }

  private runMotionDetection(rgba16x16: Uint8Array, frameBuffer: Buffer): void {
    // Process the tiny 16x16 image directly
    const grid = new Array(256);
    for (let i = 0; i < 256; i++) {
      const idx = i * 4;
      const r = rgba16x16[idx];
      const g = rgba16x16[idx + 1];
      const b = rgba16x16[idx + 2];
      grid[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    }

    if (!this.prevMotionGrid) {
      this.prevMotionGrid = grid;
      return;
    }

    let changedCells = 0;
    const cellThreshold = 15.0; // Minimum luminance change per block (0-255)

    for (let i = 0; i < 256; i++) {
      const diff = Math.abs(grid[i] - this.prevMotionGrid[i]);
      if (diff > cellThreshold) {
        changedCells++;
      }
    }

    // Motion is detected if at least 4 blocks change significantly (approx. 1.5% of the screen),
    // but we ignore sudden global changes like camera exposure or flash of light (e.g. if > 85% of screen blocks change).
    const hasMotion = changedCells >= 4 && changedCells < 220;

    this.prevMotionGrid = grid;

    if (hasMotion) {
      if (!this.isMotionActive) {
        this.isMotionActive = true;
        this.emitEvent('motion_detected', 'Movimento detectado', undefined, frameBuffer);
        
        // Trigger recording in motion recording mode
        if (this.recordingMode === 'motion') {
          this.triggerIntelligentRecording();
        }
      }

      // Reset debounce timeout
      if (this.motionTriggerTimeout) clearTimeout(this.motionTriggerTimeout);
      this.motionTriggerTimeout = setTimeout(() => {
        this.isMotionActive = false;
      }, 3000); // 3 seconds timeout
    }
  }

  private triggerIntelligentRecording(): void {
    this.isRecordingTriggered = true;
    
    if (this.postRollTimeout) {
      clearTimeout(this.postRollTimeout);
    }

    if (!this.recorder.isActive()) {
      this.startVideoRecording().catch(err => {
        console.error('[CameraManager] Failed to auto start recording:', err);
      });
    }

    // Maintain recording for 5 seconds (post-roll) after trigger finishes
    this.postRollTimeout = setTimeout(() => {
      this.isRecordingTriggered = false;
      // Double check that we are still in trigger mode and not continuous
      if (this.recordingMode !== 'continuous') {
        this.stopVideoRecording().catch(err => {
          console.error('[CameraManager] Failed to auto stop recording:', err);
        });
      }
    }, 5000);
  }

  private async startVideoRecording(): Promise<void> {
    if (!this.activeConfig) return;
    const recordsDir = this.getSettings().recordingsFolder || path.join(process.cwd(), 'recordings');
    const filename = `recording_${this.activeConfig.id}_${Date.now()}.mp4`;
    const fullPath = path.join(recordsDir, filename);

    this.recordingStartTime = Date.now();
    this.currentRecordingDetections = [];

    try {
      await this.recorder.startRecording(
        fullPath,
        this.activeConfig.fps,
        this.activeConfig.width,
        this.activeConfig.height
      );
    } catch (err) {
      console.error('[CameraManager] Recording start failed:', err);
    }
  }

  private async stopVideoRecording(): Promise<void> {
    try {
      const videoPath = await this.recorder.stopRecording();
      if (videoPath && this.currentRecordingDetections.length > 0) {
        const jsonPath = videoPath.replace(/\.mp4$/i, '.json');
        await fs.promises.writeFile(jsonPath, JSON.stringify(this.currentRecordingDetections, null, 2));
        console.log(`[CameraManager] Saved recording detections tracker: ${jsonPath}`);
      }
    } catch (err) {
      console.error('[CameraManager] Recording stop failed:', err);
    } finally {
      this.currentRecordingDetections = [];
      this.recordingStartTime = 0;
    }
  }

  private handleCameraError(err: Error): void {
    console.error('[CameraManager] Critical camera stream error:', err);
    this.updateStatus('error');
    this.emitEvent('camera_error', `Camera stream encountered an error: ${err.message}`);
    this.stop().catch(console.error);
  }

  private updateStatus(newStatus: CameraStatus): void {
    this.status = newStatus;
    this.onStatusUpdate(newStatus);
  }

  private emitEvent(
    type: SystemEvent['type'],
    description: string,
    detection?: Detection,
    frameBuffer?: Buffer
  ): void {
    if (!this.activeConfig) return;

    const eventId = `evt_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const event: SystemEvent = {
      id: eventId,
      cameraId: this.activeConfig.id,
      cameraName: this.activeConfig.name,
      timestamp: Date.now(),
      type,
    };

    if (detection) {
      event.label = detection.label;
      event.confidence = detection.confidence;
    }

    if (frameBuffer) {
      // Save snapshot file
      const snapshotsDir = this.getSettings().snapshotsFolder || path.join(process.cwd(), 'snapshots');
      const filename = `${eventId}.jpg`;
      const fullPath = path.join(snapshotsDir, filename);

      this.recorder.saveSnapshot(frameBuffer, fullPath)
        .then((savedPath) => {
          event.snapshotPath = savedPath;
          event.snapshotData = frameBuffer.toString('base64');
          this.onEventTriggered(event);
        })
        .catch((err) => {
          console.error('[CameraManager] Failed to write event snapshot:', err);
          event.snapshotData = frameBuffer.toString('base64'); // Fallback to memory
          this.onEventTriggered(event);
        });
    } else {
      this.onEventTriggered(event);
    }
  }

  getStatus(): CameraStatus {
    return this.status;
  }

  getActiveConfig(): CameraConfig | null {
    return this.activeConfig;
  }
}

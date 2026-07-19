import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { BrowserWindow } from 'electron';
import { getFFmpegPath } from '../utils/ffmpeg';
import { getDatasetsDir } from './database';
import { parseDatasetYaml } from '../utils/datasetYaml';
import { YoloDetector } from '../ai/YoloDetector';

export const activeAiScans = new Map<string, boolean>();

export async function runVideoAiScan(
  filePath: string,
  durationSec: number,
  getMainWindow: () => BrowserWindow | null,
  getDetector: () => YoloDetector | null
) {
  activeAiScans.set(filePath, true);

  const ffmpegPath = getFFmpegPath();
  const scanFps = 5; // Scan 5 frames per second
  const totalFrames = Math.max(1, Math.round(durationSec * scanFps));

  // Spawn ffmpeg to output raw RGBA frames at 640x640 at 5 FPS
  const ffmpegArgs = [
    '-i', filePath,
    '-vf', `scale=640:640,fps=${scanFps}`,
    '-f', 'image2pipe',
    '-pix_fmt', 'rgba',
    '-vcodec', 'rawvideo',
    '-'
  ];

  const proc = spawn(ffmpegPath, ffmpegArgs);
  const frameSize = 640 * 640 * 4; // 1,638,400 bytes

  let bufferAccumulator = Buffer.alloc(0);
  let frameIndex = 0;
  const detectionsList: any[] = [];
  let stderr = '';

  proc.stderr?.on('data', (data) => {
    stderr += data.toString();
  });

  const processClosePromise = new Promise<number | null>((resolve, reject) => {
    proc.on('close', (code) => {
      resolve(code);
    });
    proc.on('error', (err) => {
      reject(err);
    });
  });

  let prevMotionGrid: number[] | null = null;
  const cellThreshold = 10.0; // sensitive motion threshold

  try {
    for await (const chunk of proc.stdout) {
      bufferAccumulator = Buffer.concat([bufferAccumulator, chunk]);
      while (bufferAccumulator.length >= frameSize) {
        const frameBuffer = bufferAccumulator.subarray(0, frameSize);
        bufferAccumulator = bufferAccumulator.subarray(frameSize);

        const timestamp = frameIndex / scanFps;

        // 1. Downsample the 640x640 frame to a 16x16 grid for motion detection
        const grid = new Array(256).fill(0);
        const blockSize = 40; // 640 / 16
        const numPixelsPerBlock = blockSize * blockSize;

        for (let r = 0; r < 16; r++) {
          for (let c = 0; c < 16; c++) {
            let sumLuminance = 0;
            const startX = c * blockSize;
            const startY = r * blockSize;

            for (let dy = 0; dy < blockSize; dy++) {
              const y = startY + dy;
              const rowOffset = y * 640 * 4;
              for (let dx = 0; dx < blockSize; dx++) {
                const x = startX + dx;
                const pxIdx = rowOffset + x * 4;
                
                const red = frameBuffer[pxIdx];
                const green = frameBuffer[pxIdx + 1];
                const blue = frameBuffer[pxIdx + 2];
                
                const luminance = 0.299 * red + 0.587 * green + 0.114 * blue;
                sumLuminance += luminance;
              }
            }
            grid[r * 16 + c] = sumLuminance / numPixelsPerBlock;
          }
        }

        let hasMotion = false;
        let motionBox = null;

        if (prevMotionGrid) {
          let changedCells = 0;
          const changedIndices: number[] = [];

          for (let i = 0; i < 256; i++) {
            const diff = Math.abs(grid[i] - prevMotionGrid[i]);
            if (diff > cellThreshold) {
              changedCells++;
              changedIndices.push(i);
            }
          }

          // Sensitive detection: 2 changed cells (0.78% of screen) triggers motion
          hasMotion = changedCells >= 2 && changedCells < 220;

          if (hasMotion) {
            let minCol = 16;
            let maxCol = -1;
            let minRow = 16;
            let maxRow = -1;

            for (const idx of changedIndices) {
              const col = idx % 16;
              const row = Math.floor(idx / 16);
              if (col < minCol) minCol = col;
              if (col > maxCol) maxCol = col;
              if (row < minRow) minRow = row;
              if (row > maxRow) maxRow = row;
            }

            motionBox = {
              x: minCol / 16,
              y: minRow / 16,
              width: (maxCol - minCol + 1) / 16,
              height: (maxRow - minRow + 1) / 16
            };
          }
        }

        prevMotionGrid = grid;

        // 2. Perform AI object detection
        const frameDetections = [];
        const activeDetector = getDetector();
        if (activeDetector) {
          try {
            const datasetsDir = getDatasetsDir();
            const yamlPath = path.join(datasetsDir, 'dataset.yaml');
            const { names: customClasses } = parseDatasetYaml(yamlPath);

            const detections = await activeDetector.detect(frameBuffer, customClasses);
            if (detections && detections.length > 0) {
              frameDetections.push(...detections.map(d => ({
                label: d.label,
                confidence: d.confidence,
                box: d.box
              })));
            }
          } catch (err) {
            console.error('[AI Scan] Detection error:', err);
          }
        }

        // 3. Integrate motion detection if present
        if (hasMotion && motionBox) {
          frameDetections.push({
            label: 'movimento',
            confidence: 0.9,
            box: motionBox
          });
        }

        if (frameDetections.length > 0) {
          detectionsList.push({
            time: timestamp,
            detections: frameDetections
          });
        }

        frameIndex++;
        const progress = Math.min(99, Math.round((frameIndex / totalFrames) * 100));
        getMainWindow()?.webContents.send('recordings:ai-progress', { filePath, progress });
      }
    }

    const code = await processClosePromise;
    activeAiScans.delete(filePath);

    if (code === 0 || code === null) {
      const jsonPath = filePath.replace(/\.mp4$/i, '.json');
      await fs.promises.writeFile(jsonPath, JSON.stringify(detectionsList, null, 2));
      console.log(`[AI Scan] Scan complete, saved detections to: ${jsonPath}`);
      getMainWindow()?.webContents.send('recordings:ai-progress', { filePath, progress: 100 });
      return { success: true };
    } else {
      console.error('[AI Scan] FFmpeg error output:', stderr);
      throw new Error(`FFmpeg exited with code ${code}`);
    }
  } catch (err: any) {
    activeAiScans.delete(filePath);
    try {
      proc.kill();
    } catch {}
    throw err;
  }
}

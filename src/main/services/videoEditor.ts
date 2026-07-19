import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { getFFmpegPath, assertFFmpegExists } from '../utils/ffmpeg';

export function trimRecording(filePath: string, startTimeSec: number, durationSec: number): Promise<{ success: boolean; path: string }> {
  const ffmpegPath = getFFmpegPath();
  assertFFmpegExists(ffmpegPath);

  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  const outputFileName = `${base}_corte_${Date.now()}${ext}`;
  const outputPath = path.join(dir, outputFileName);

  const ffmpegArgs = [
    '-y',
    '-ss', startTimeSec.toString(),
    '-i', filePath,
    '-t', durationSec.toString(),
    '-c', 'copy',
    outputPath
  ];

  console.log(`[Main] Trimming video with FFmpeg: ${ffmpegPath} ${ffmpegArgs.join(' ')}`);

  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, ffmpegArgs);

    let stderr = '';
    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', async (code) => {
      if (code === 0) {
        console.log(`[Main] Video trim success: ${outputPath}`);

        const originalJsonPath = filePath.replace(/\.mp4$/i, '.json');
        if (fs.existsSync(originalJsonPath)) {
          try {
            const originalDetections = JSON.parse(await fs.promises.readFile(originalJsonPath, 'utf-8'));
            const endTimeSec = startTimeSec + durationSec;
            const trimmedDetections = originalDetections
              .filter((d: any) => d.time >= startTimeSec && d.time <= endTimeSec)
              .map((d: any) => ({
                ...d,
                time: d.time - startTimeSec
              }));
            const outputJsonPath = outputPath.replace(/\.mp4$/i, '.json');
            await fs.promises.writeFile(outputJsonPath, JSON.stringify(trimmedDetections, null, 2));
            console.log(`[Main] Saved trimmed detections tracker: ${outputJsonPath}`);
          } catch (e) {
            console.error('Failed to trim detections JSON:', e);
          }
        }

        resolve({ success: true, path: outputPath });
      } else {
        console.error(`[Main] FFmpeg trim error (code ${code}):`, stderr);
        reject(new Error(`FFmpeg exited with code ${code}: ${stderr}`));
      }
    });

    proc.on('error', (err) => {
      console.error(`[Main] Failed to start FFmpeg trim process at ${ffmpegPath}:`, err);
      reject(err);
    });
  });
}

export async function getDetections(filePath: string): Promise<any[]> {
  const jsonPath = filePath.replace(/\.mp4$/i, '.json');
  if (fs.existsSync(jsonPath)) {
    try {
      const data = await fs.promises.readFile(jsonPath, 'utf-8');
      return JSON.parse(data);
    } catch (err) {
      console.error('Failed to read detections JSON:', err);
      return [];
    }
  }
  return [];
}

import { spawn } from 'child_process';
import * as fs from 'fs';
import { assertFFmpegExists, getFFmpegPath } from '../utils/ffmpeg';

/**
 * Queries the system for available video capture devices using FFmpeg.
 * Returns a list of device names suitable for dshow/avfoundation capture.
 */
export function listDevices(): Promise<string[]> {
  return new Promise((resolve) => {
    let ffmpegPath = '';
    try {
      ffmpegPath = getFFmpegPath();
      assertFFmpegExists(ffmpegPath);
    } catch (err) {
      console.warn('[listDevices] FFmpeg binary path not resolved:', err);
      resolve([]);
      return;
    }

    let args: string[] = [];
    if (process.platform === 'win32') {
      args = ['-list_devices', 'true', '-f', 'dshow', '-i', 'dummy'];
    } else if (process.platform === 'darwin') {
      args = ['-f', 'avfoundation', '-list_devices', 'true', '-i', '""'];
    } else {
      // Linux: standard is reading /dev/video* entries
      try {
        const files = fs.readdirSync('/dev').filter((f) => f.startsWith('video'));
        resolve(files.map((f) => `/dev/${f}`));
        return;
      } catch {
        resolve([]);
        return;
      }
    }

    // Spawn FFmpeg query
    console.log(`[listDevices] Spawning FFmpeg at ${ffmpegPath} to query devices.`);
    const proc = spawn(ffmpegPath, args);
    let output = '';

    // FFmpeg writes device lists to stderr, not stdout
    proc.stderr.on('data', (data) => {
      output += data.toString();
    });

    proc.on('close', () => {
      const devices: string[] = [];
      const lines = output.split('\n');

      if (process.platform === 'win32') {
        // Windows dshow logs format:
        // [dshow @ 000001f...]  "Integrated Camera" (video)
        // [dshow @ 000001f...]  "USB2.0 Video Capture" (video)
        for (const line of lines) {
          if (line.includes('(video)')) {
            const match = line.match(/"([^"]+)"/);
            if (match && match[1]) {
              devices.push(match[1]);
            }
          }
        }
      } else if (process.platform === 'darwin') {
        // macOS AVFoundation logs format:
        // [AVFoundation input device @ 0x...] [0] FaceTime HD Camera
        let isVideoSection = false;
        for (const line of lines) {
          if (line.includes('AVFoundation video devices:')) {
            isVideoSection = true;
            continue;
          }
          if (line.includes('AVFoundation audio devices:')) {
            isVideoSection = false;
            break;
          }
          if (isVideoSection) {
            const match = line.match(/\[\d+\]\s+(.+)$/);
            if (match && match[1]) {
              devices.push(match[1]);
            }
          }
        }
      }

      // If no devices were parsed, add standard fallbacks
      if (devices.length === 0) {
        if (process.platform === 'win32') {
          devices.push('Integrated Camera');
        } else if (process.platform === 'darwin') {
          devices.push('0');
        } else {
          devices.push('/dev/video0');
        }
      }

      resolve(devices);
    });

    proc.on('error', (err) => {
      console.error(`[listDevices] Error starting FFmpeg at ${ffmpegPath}:`, err);
      resolve([]);
    });
  });
}

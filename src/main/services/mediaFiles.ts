import { shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { generalSettings } from './database';

export async function listRecordings() {
  const folder = generalSettings.recordingsFolder;
  if (!fs.existsSync(folder)) return [];
  
  try {
    const files = await fs.promises.readdir(folder);
    const list = [];
    
    for (const file of files) {
      if (file.endsWith('.mp4')) {
        const filePath = path.join(folder, file);
        const stat = await fs.promises.stat(filePath);
        list.push({
          name: file,
          path: filePath,
          size: stat.size,
          createdAt: stat.birthtimeMs || stat.mtimeMs,
          url: `media://${filePath.replace(/\\/g, '/')}`
        });
      }
    }
    
    return list.sort((a, b) => b.createdAt - a.createdAt);
  } catch (err) {
    console.error('Failed to list recordings folder:', err);
    return [];
  }
}

export function openRecordingsFolder() {
  shell.openPath(generalSettings.recordingsFolder);
}

export async function deleteRecording(filePath: string) {
  if (fs.existsSync(filePath)) {
    await fs.promises.unlink(filePath);
  }
  const jsonPath = filePath.replace(/\.mp4$/i, '.json');
  if (fs.existsSync(jsonPath)) {
    await fs.promises.unlink(jsonPath);
  }
}

export async function listSnapshots() {
  const folder = generalSettings.snapshotsFolder;
  if (!fs.existsSync(folder)) return [];

  try {
    const files = await fs.promises.readdir(folder);
    const list = [];

    for (const file of files) {
      if (file.endsWith('.jpg') || file.endsWith('.png')) {
        const filePath = path.join(folder, file);
        const stat = await fs.promises.stat(filePath);
        list.push({
          name: file,
          path: filePath,
          size: stat.size,
          createdAt: stat.birthtimeMs || stat.mtimeMs,
          url: `media://${filePath.replace(/\\/g, '/')}`
        });
      }
    }

    return list.sort((a, b) => b.createdAt - a.createdAt);
  } catch (err) {
    console.error('Failed to list snapshots folder:', err);
    return [];
  }
}

export function openSnapshotsFolder() {
  shell.openPath(generalSettings.snapshotsFolder);
}

export async function deleteSnapshot(filePath: string) {
  if (fs.existsSync(filePath)) {
    await fs.promises.unlink(filePath);
  }
}

export async function deleteMultipleRecordings(filePaths: string[]) {
  let count = 0;
  for (const filePath of filePaths) {
    try {
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
        count++;
      }
      const jsonPath = filePath.replace(/\.mp4$/i, '.json');
      if (fs.existsSync(jsonPath)) {
        await fs.promises.unlink(jsonPath);
      }
    } catch (err) {
      console.error(`Failed to delete recording ${filePath}:`, err);
    }
  }
  return count;
}

export async function deleteMultipleSnapshots(filePaths: string[]) {
  let count = 0;
  for (const filePath of filePaths) {
    try {
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
        count++;
      }
    } catch (err) {
      console.error(`Failed to delete snapshot ${filePath}:`, err);
    }
  }
  return count;
}

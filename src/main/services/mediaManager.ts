import { dialog, ipcMain, BrowserWindow } from 'electron';
import { YoloDetector } from '../ai/YoloDetector';
import {
  listRecordings,
  openRecordingsFolder,
  deleteRecording,
  listSnapshots,
  openSnapshotsFolder,
  deleteSnapshot,
  deleteMultipleRecordings,
  deleteMultipleSnapshots
} from './mediaFiles';
import {
  trimRecording,
  getDetections
} from './videoEditor';
import {
  runVideoAiScan,
  activeAiScans
} from './videoScanner';

export function registerMediaHandlers(
  getMainWindow: () => BrowserWindow | null,
  getDetector: () => YoloDetector | null
) {
  ipcMain.handle('settings:select-directory', async (event, defaultPath?: string) => {
    const win = getMainWindow();
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: defaultPath || undefined
    });
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0];
    }
    return null;
  });

  ipcMain.handle('recordings:list', async () => {
    return listRecordings();
  });

  ipcMain.handle('recordings:open-folder', async () => {
    openRecordingsFolder();
    return { success: true };
  });

  ipcMain.handle('recordings:delete', async (event, filePath: string) => {
    try {
      await deleteRecording(filePath);
      return { success: true };
    } catch (err) {
      console.error('Failed to delete recording:', err);
      throw err;
    }
  });

  ipcMain.handle('snapshots:list', async () => {
    return listSnapshots();
  });

  ipcMain.handle('snapshots:open-folder', async () => {
    openSnapshotsFolder();
    return { success: true };
  });

  ipcMain.handle('snapshots:delete', async (event, filePath: string) => {
    try {
      await deleteSnapshot(filePath);
      return { success: true };
    } catch (err) {
      console.error('Failed to delete snapshot:', err);
      throw err;
    }
  });

  ipcMain.handle('recordings:delete-multiple', async (event, filePaths: string[]) => {
    const deletedCount = await deleteMultipleRecordings(filePaths);
    return { success: true, deletedCount };
  });

  ipcMain.handle('snapshots:delete-multiple', async (event, filePaths: string[]) => {
    const deletedCount = await deleteMultipleSnapshots(filePaths);
    return { success: true, deletedCount };
  });

  ipcMain.handle('recordings:trim', async (event, filePath: string, startTimeSec: number, durationSec: number) => {
    return trimRecording(filePath, startTimeSec, durationSec);
  });

  ipcMain.handle('recordings:get-detections', async (event, filePath: string) => {
    return getDetections(filePath);
  });

  ipcMain.handle('recordings:process-ai', async (event, filePath: string, duration: number) => {
    if (activeAiScans.has(filePath)) {
      return { success: false, message: 'Processamento ja em andamento para este video.' };
    }

    if (!getDetector()) {
      throw new Error('Detector de IA nao inicializado.');
    }

    runVideoAiScan(filePath, duration, getMainWindow, getDetector).catch((err) => {
      console.error(`[AI Scan] Failed to run AI scan on ${filePath}:`, err);
      getMainWindow()?.webContents.send('recordings:ai-progress', { filePath, progress: -1, error: err.message });
    });

    return { success: true };
  });
}

import { ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { getDatasetsDir, generalSettings } from './database';
import { parseDatasetYaml as parseYaml, writeDatasetYaml as writeYaml } from '../utils/datasetYaml';
import {
  getDatasetData,
  deleteDatasetImage,
  deleteDatasetClass
} from './datasetFiles';
import {
  cameraTrainerProcess,
  datasetTrainerProcess,
  getTrainerExecutablePath,
  getDatasetTrainerExecutablePath,
  launchTrainerProcess,
  launchDatasetTrainerProcess,
  killTrainerProcesses,
  setCameraTrainerProcess,
  setDatasetTrainerProcess
} from './trainerLauncher';

const PROJECT_DIR = process.cwd();

// Re-export needed functions for main.ts compatibility
export { parseYaml as parseDatasetYaml, writeYaml as writeDatasetYaml, killTrainerProcesses };

export function registerDatasetHandlers() {
  ipcMain.handle('trainer:start', async (event, className: string, cameraSource?: string) => {
    if (cameraTrainerProcess && !cameraTrainerProcess.killed) {
      return { success: false, message: 'O treinador de IA ja esta em execucao.' };
    }

    const trimmedClassName = className.trim();
    if (!trimmedClassName) {
      throw new Error('Informe o nome do objeto/classe para treinar.');
    }

    const trainerPath = path.join(PROJECT_DIR, 'ai-engine', 'camera_trainer.py');
    const trainerExecutablePath = getTrainerExecutablePath();
    if (!trainerExecutablePath && !fs.existsSync(trainerPath)) {
      throw new Error(`Treinador nao encontrado. Esperado camera_trainer.exe ou ${trainerPath}`);
    }

    const proc = await launchTrainerProcess(trainerPath, trimmedClassName, cameraSource);
    setCameraTrainerProcess(proc);

    proc.on('close', () => {
      setCameraTrainerProcess(null);
    });

    proc.on('error', (err) => {
      console.error('[Main] Failed to start AI trainer:', err);
      setCameraTrainerProcess(null);
    });

    return { success: true };
  });

  ipcMain.handle('dataset:get-data', async () => {
    return getDatasetData();
  });

  ipcMain.handle('dataset:delete-image', async (event, imagePath: string) => {
    try {
      await deleteDatasetImage(imagePath);
      return { success: true };
    } catch (err) {
      console.error('[Main] Failed to delete dataset image:', err);
      throw err;
    }
  });

  ipcMain.handle('dataset:delete-class', async (event, classId: number, className: string) => {
    try {
      await deleteDatasetClass(classId, className);
      return { success: true };
    } catch (err) {
      console.error('[Main] Failed to delete class:', err);
      throw err;
    }
  });

  ipcMain.handle('dataset-trainer:start', async (event, config: { epochs: number; batch: number; device: string }) => {
    if (datasetTrainerProcess && !datasetTrainerProcess.killed) {
      return { success: false, message: 'O treinador de IA ja esta em execucao.' };
    }

    const trainerPath = path.join(PROJECT_DIR, 'ai-engine', 'dataset_trainer.py');
    const trainerExecutablePath = getDatasetTrainerExecutablePath();
    if (!trainerExecutablePath && !fs.existsSync(trainerPath)) {
      throw new Error(`Treinador de dataset nao encontrado. Esperado dataset_trainer.exe ou ${trainerPath}`);
    }

    const proc = await launchDatasetTrainerProcess(trainerPath, {
      epochs: config.epochs || 50,
      batch: config.batch || 8,
      device: config.device || 'auto',
      output: generalSettings.modelPath
    });
    setDatasetTrainerProcess(proc);

    proc.on('close', () => {
      setDatasetTrainerProcess(null);
    });

    proc.on('error', (err) => {
      console.error('[Main] Failed to start Dataset trainer:', err);
      setDatasetTrainerProcess(null);
    });

    return { success: true };
  });
}

import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { ChildProcess, spawn } from 'child_process';
import { getDatasetsDir, getAiEngineBaseDir } from './database';

const PROJECT_DIR = process.cwd();

export let cameraTrainerProcess: ChildProcess | null = null;
export let datasetTrainerProcess: ChildProcess | null = null;

export function getTrainerExecutablePath() {
  const packagedPath = path.join(process.resourcesPath, 'ai-engine', 'camera_trainer.exe');
  const devPath = path.join(PROJECT_DIR, 'ai-engine', 'dist', 'camera_trainer.exe');

  if (app.isPackaged && fs.existsSync(packagedPath)) {
    return packagedPath;
  }

  if (fs.existsSync(devPath)) {
    return devPath;
  }

  return null;
}

export function getDatasetTrainerExecutablePath() {
  const packagedPath = path.join(process.resourcesPath, 'ai-engine', 'dataset_trainer.exe');
  const devPath = path.join(PROJECT_DIR, 'ai-engine', 'dist', 'dataset_trainer.exe');

  if (app.isPackaged && fs.existsSync(packagedPath)) {
    return packagedPath;
  }

  if (fs.existsSync(devPath)) {
    return devPath;
  }

  return null;
}

export function launchDatasetTrainerProcess(
  scriptPath: string,
  args: { epochs: number; batch: number; device: string; output: string }
): Promise<ChildProcess> {
  const trainerExecutablePath = getDatasetTrainerExecutablePath();
  const aiEngineBaseDir = getAiEngineBaseDir();
  const trainerArgs = [
    '--config', path.join(aiEngineBaseDir, 'datasets', 'dataset.yaml'),
    '--weights', path.join(aiEngineBaseDir, 'weights', 'yolo11n.pt'),
    '--runs-dir', path.join(PROJECT_DIR, 'runs'),
    '--epochs', args.epochs.toString(),
    '--batch', args.batch.toString(),
    '--device', args.device,
    '--output', args.output
  ];

  if (process.platform === 'win32') {
    if (trainerExecutablePath) {
      return new Promise((resolve, reject) => {
        const child = spawn('cmd.exe', ['/c', 'start', 'cmd.exe', '/k', trainerExecutablePath, ...trainerArgs], {
          cwd: path.dirname(trainerExecutablePath),
          windowsHide: false
        });

        child.once('spawn', () => resolve(child));
        child.once('error', reject);
      });
    }

    return new Promise((resolve, reject) => {
      const venvPythonPath = path.join(PROJECT_DIR, '.venv', 'Scripts', 'python.exe');
      const hasVenv = fs.existsSync(venvPythonPath);

      const runInCmd = (command: string, extraArgs: string[]) => {
        return spawn('cmd.exe', ['/c', 'start', 'cmd.exe', '/k', command, ...extraArgs], {
          cwd: path.join(PROJECT_DIR, 'ai-engine'),
          windowsHide: false
        });
      };

      const candidates: { command: string; args: string[] }[] = [];
      if (hasVenv) {
        candidates.push({ command: venvPythonPath, args: [scriptPath, ...trainerArgs] });
      }
      candidates.push({ command: 'py', args: ['-3', scriptPath, ...trainerArgs] });
      candidates.push({ command: 'python', args: [scriptPath, ...trainerArgs] });

      const tryLaunch = (index: number) => {
        const candidate = candidates[index];
        if (!candidate) {
          reject(new Error('Python virtual environment or global interpreter not found.'));
          return;
        }

        const child = runInCmd(candidate.command, candidate.args);
        child.once('spawn', () => resolve(child));
        child.once('error', () => tryLaunch(index + 1));
      };

      tryLaunch(0);
    });
  }

  if (trainerExecutablePath) {
    return new Promise((resolve, reject) => {
      const child = spawn(trainerExecutablePath, trainerArgs, {
        cwd: path.dirname(trainerExecutablePath)
      });
      child.once('spawn', () => resolve(child));
      child.once('error', reject);
    });
  }

  const venvPythonPath = path.join(PROJECT_DIR, '.venv', 'bin', 'python');
  const hasVenv = fs.existsSync(venvPythonPath);

  const baseArgs = [scriptPath, ...trainerArgs];
  const candidates: { command: string; args: string[] }[] = [];
  if (hasVenv) {
    candidates.push({ command: venvPythonPath, args: baseArgs });
  }
  candidates.push({ command: 'python3', args: baseArgs });
  candidates.push({ command: 'python', args: baseArgs });

  return new Promise((resolve, reject) => {
    const tryLaunch = (index: number) => {
      const candidate = candidates[index];
      if (!candidate) {
        reject(new Error('Python interpreter not found.'));
        return;
      }
      const child = spawn(candidate.command, candidate.args, {
        cwd: path.join(PROJECT_DIR, 'ai-engine')
      });
      child.once('spawn', () => resolve(child));
      child.once('error', () => tryLaunch(index + 1));
    };

    tryLaunch(0);
  });
}

export function launchTrainerProcess(scriptPath: string, className: string, cameraSource?: string): Promise<ChildProcess> {
  const trainerExecutablePath = getTrainerExecutablePath();
  const trainerArgs = ['--class-name', className];
  if (cameraSource) {
    trainerArgs.push('--cam', cameraSource);
  }

  if (trainerExecutablePath) {
    return new Promise((resolve, reject) => {
      const child = spawn(trainerExecutablePath, trainerArgs, {
        cwd: path.dirname(trainerExecutablePath),
        windowsHide: false,
        stdio: 'ignore'
      });

      child.once('spawn', () => resolve(child));
      child.once('error', reject);
    });
  }

  const baseArgs = [scriptPath, ...trainerArgs];
  const venvPythonPath = process.platform === 'win32'
    ? path.join(PROJECT_DIR, '.venv', 'Scripts', 'python.exe')
    : path.join(PROJECT_DIR, '.venv', 'bin', 'python');
  const hasVenv = fs.existsSync(venvPythonPath);

  const candidates: { command: string; args: string[] }[] = [];
  if (hasVenv) {
    candidates.push({ command: venvPythonPath, args: baseArgs });
  }

  if (process.platform === 'win32') {
    candidates.push({ command: 'py', args: ['-3', ...baseArgs] });
    candidates.push({ command: 'python', args: baseArgs });
  } else {
    candidates.push({ command: 'python3', args: baseArgs });
    candidates.push({ command: 'python', args: baseArgs });
  }

  return new Promise((resolve, reject) => {
    const tryLaunch = (index: number) => {
      const candidate = candidates[index];
      if (!candidate) {
        reject(new Error('Treinador empacotado nao encontrado e Python nao esta instalado. Gere o camera_trainer.exe antes de empacotar o app.'));
        return;
      }

      const child = spawn(candidate.command, candidate.args, {
        cwd: path.join(PROJECT_DIR, 'ai-engine'),
        windowsHide: false,
        stdio: 'ignore'
      });

      child.once('spawn', () => resolve(child));
      child.once('error', () => tryLaunch(index + 1));
    };

    tryLaunch(0);
  });
}

export function killTrainerProcesses() {
  if (cameraTrainerProcess && !cameraTrainerProcess.killed) {
    cameraTrainerProcess.kill();
    cameraTrainerProcess = null;
  }
  if (datasetTrainerProcess && !datasetTrainerProcess.killed) {
    datasetTrainerProcess.kill();
    datasetTrainerProcess = null;
  }
}

export function setCameraTrainerProcess(proc: ChildProcess | null) {
  cameraTrainerProcess = proc;
}

export function setDatasetTrainerProcess(proc: ChildProcess | null) {
  datasetTrainerProcess = proc;
}

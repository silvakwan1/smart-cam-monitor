import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

const FFMPEG_BINARY_NAME = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';

export interface FFmpegResolution {
  path: string;
  mode: 'development' | 'production';
  exists: boolean;
}

function getProjectRoot(): string {
  return path.resolve(__dirname, '../..');
}

function getCandidatePaths(): string[] {
  if (app.isPackaged) {
    return [
      path.join(process.resourcesPath, 'bin', FFMPEG_BINARY_NAME),
      path.join(process.resourcesPath, FFMPEG_BINARY_NAME)
    ];
  }

  const projectRoot = getProjectRoot();

  return [
    path.join(projectRoot, 'resources', 'bin', FFMPEG_BINARY_NAME),
    path.join(projectRoot, 'resources', FFMPEG_BINARY_NAME),
    path.join(projectRoot, 'node_modules', 'ffmpeg-static', FFMPEG_BINARY_NAME)
  ];
}

function describeMode(): 'development' | 'production' {
  return app.isPackaged ? 'production' : 'development';
}

export function resolveFFmpegPath(): FFmpegResolution {
  const mode = describeMode();
  const candidates = getCandidatePaths();

  console.log(`[FFmpeg] Mode: ${mode}`);
  console.log(`[FFmpeg] Candidate paths: ${candidates.join(' | ')}`);

  const foundPath = candidates.find((candidatePath) => fs.existsSync(candidatePath));
  const selectedPath = foundPath || candidates[0];
  const exists = Boolean(foundPath);

  if (exists) {
    console.log(`[FFmpeg] Binary found: ${selectedPath}`);
  } else {
    console.error(`[FFmpeg] Binary not found. Expected one of: ${candidates.join(' | ')}`);
  }

  return {
    path: selectedPath,
    mode,
    exists
  };
}

export function getFFmpegPath(): string {
  const resolution = resolveFFmpegPath();

  if (!resolution.exists) {
    throw new Error(
      `FFmpeg nao encontrado em modo ${resolution.mode}. ` +
      `Caminho esperado: ${resolution.path}. ` +
      'Instale as dependencias ou copie o binario para resources/bin antes de iniciar o app.'
    );
  }

  return resolution.path;
}

export function assertFFmpegExists(ffmpegPath: string): void {
  console.log(`[FFmpeg] Validating binary path before spawn: ${ffmpegPath}`);

  if (!fs.existsSync(ffmpegPath)) {
    console.error(`[FFmpeg] Spawn blocked because binary does not exist: ${ffmpegPath}`);
    throw new Error(`FFmpeg nao encontrado no caminho esperado: ${ffmpegPath}`);
  }

  console.log(`[FFmpeg] Binary exists and is ready: ${ffmpegPath}`);
}

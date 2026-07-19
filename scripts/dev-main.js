const esbuild = require('esbuild');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

let electronProcess = null;

function buildMain() {
  try {
    esbuild.buildSync({
      entryPoints: [
        path.resolve(__dirname, '../src/main/main.ts'),
        path.resolve(__dirname, '../src/main/preload.ts'),
        path.resolve(__dirname, '../src/main/ai/detection.worker.ts')
      ],
      bundle: true,
      platform: 'node',
      target: 'node22',
      outdir: path.resolve(__dirname, '../dist/main'),
      external: ['electron', 'onnxruntime-node', 'fsevents', '@u4/opencv4nodejs'],
      format: 'cjs',
      sourcemap: true,
    });
    return true;
  } catch (err) {
    console.error('esbuild compilation error:', err);
    return false;
  }
}

function startElectron() {
  if (electronProcess) {
    electronProcess.kill();
  }

  // Requiring electron returns the path to the electron executable
  const electronPath = require('electron');
  
  electronProcess = spawn(electronPath, [path.resolve(__dirname, '../dist/main/main.js')], {
    stdio: 'inherit',
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true'
    }
  });

  electronProcess.on('close', (code) => {
    if (code !== null && code !== 0) {
      console.log(`Electron process exited with code ${code}`);
    }
  });
}

// Build once and start
if (buildMain()) {
  startElectron();
}

// Setup watcher
let watchTimeout = null;
const srcMainPath = path.resolve(__dirname, '../src/main');
const srcSharedPath = path.resolve(__dirname, '../src/shared');

function watchDir(dir) {
  if (!fs.existsSync(dir)) return;
  fs.watch(dir, { recursive: true }, (eventType, filename) => {
    if (filename && (filename.endsWith('.ts') || filename.endsWith('.json') || filename.endsWith('.js'))) {
      if (watchTimeout) clearTimeout(watchTimeout);
      watchTimeout = setTimeout(() => {
        console.log(`Source change detected in ${filename}. Rebuilding...`);
        if (buildMain()) {
          console.log('Rebuild successful, restarting Electron...');
          startElectron();
        }
      }, 300);
    }
  });
}

watchDir(srcMainPath);
watchDir(srcSharedPath);

process.on('exit', () => {
  if (electronProcess) {
    electronProcess.kill();
  }
});

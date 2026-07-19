const esbuild = require('esbuild');
const path = require('path');

function build() {
  console.log('Building Electron Main process...');
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
  console.log('Main process build complete!');
}

build();

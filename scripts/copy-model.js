/**
 * copy-model.js
 * Copia o modelo ONNX treinado para resources/yolo11n.onnx antes do empacotamento.
 * O electron-builder inclui este arquivo na build final via extraResources.
 *
 * Ordem de prioridade:
 *   1. resources/yolo11n.onnx  (ja copiado por uma sessao anterior)
 *   2. ai-engine/weights/custom_dataset.onnx  (treinamento via CLI ou app)
 *   3. ai-engine/weights/yolo11n.onnx  (modelo base — fallback)
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DEST = path.join(ROOT, 'resources', 'yolo11n.onnx');

const CANDIDATES = [
  path.join(ROOT, 'ai-engine', 'weights', 'custom_dataset.onnx'),
  path.join(ROOT, 'ai-engine', 'weights', 'yolo11n.onnx'),
];

function run() {
  // Garante que a pasta resources/ existe
  fs.mkdirSync(path.dirname(DEST), { recursive: true });

  // Se ja existe um modelo em resources/, verifica se ha algo mais novo nos candidatos
  let bestSource = null;
  let bestMtime = DEST && fs.existsSync(DEST) ? fs.statSync(DEST).mtimeMs : 0;

  for (const candidate of CANDIDATES) {
    if (!fs.existsSync(candidate)) continue;
    const mtime = fs.statSync(candidate).mtimeMs;
    if (mtime > bestMtime) {
      bestMtime = mtime;
      bestSource = candidate;
    }
  }

  if (bestSource) {
    fs.copyFileSync(bestSource, DEST);
    const sizeMB = (fs.statSync(DEST).size / 1024 / 1024).toFixed(1);
    console.log(`[copy-model] Modelo atualizado: ${path.basename(bestSource)} -> resources/yolo11n.onnx (${sizeMB} MB)`);
  } else if (fs.existsSync(DEST)) {
    const sizeMB = (fs.statSync(DEST).size / 1024 / 1024).toFixed(1);
    console.log(`[copy-model] Usando modelo existente: resources/yolo11n.onnx (${sizeMB} MB)`);
  } else {
    console.warn('[copy-model] AVISO: Nenhum modelo ONNX treinado encontrado.');
    console.warn('[copy-model] Execute "npm run train" antes de empacotar, ou treine pelo app.');
    // Nao aborta o build — o app funciona em modo simulacao sem o modelo
  }
}

run();

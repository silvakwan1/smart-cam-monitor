import { parentPort } from 'worker_threads';
import * as path from 'path';
import * as fs from 'fs';

let session: any = null;
let isSimulationMode = false;

// COCO Class mappings we care about
const TARGET_CLASSES: Record<number, 'person' | 'bicycle' | 'car' | 'motorcycle' | 'truck' | 'cat' | 'dog'> = {
  0: 'person',
  1: 'bicycle',
  2: 'car',
  3: 'motorcycle',
  7: 'truck',
  15: 'cat',
  16: 'dog'
};

const COCO_CLASSES = [
  'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat', 'traffic light',
  'fire hydrant', 'stop sign', 'parking meter', 'bench', 'bird', 'cat', 'dog', 'horse', 'sheep', 'cow',
  'elephant', 'bear', 'zebra', 'giraffe', 'backpack', 'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee',
  'skis', 'snowboard', 'sports ball', 'kite', 'baseball bat', 'baseball glove', 'skateboard', 'surfboard', 'tennis racket', 'bottle',
  'wine glass', 'cup', 'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple', 'sandwich', 'orange',
  'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake', 'chair', 'couch', 'potted plant', 'bed',
  'dining table', 'toilet', 'tv', 'laptop', 'mouse', 'remote', 'keyboard', 'cell phone', 'microwave', 'oven',
  'toaster', 'sink', 'refrigerator', 'book', 'clock', 'vase', 'scissors', 'teddy bear', 'hair drier', 'toothbrush'
];

// Simple NMS and IoU Helper functions
function calculateIoU(box1: { x: number; y: number; width: number; height: number }, box2: { x: number; y: number; width: number; height: number }): number {
  const x1 = Math.max(box1.x, box2.x);
  const y1 = Math.max(box1.y, box2.y);
  const x2 = Math.min(box1.x + box1.width, box2.x + box2.width);
  const y2 = Math.min(box1.y + box1.height, box2.y + box2.height);

  const intersectionArea = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const area1 = box1.width * box1.height;
  const area2 = box2.width * box2.height;
  const unionArea = area1 + area2 - intersectionArea;

  if (unionArea === 0) return 0;
  return intersectionArea / unionArea;
}

function nonMaximumSuppression(candidates: any[], iouThreshold: number): any[] {
  const sorted = [...candidates].sort((a, b) => b.confidence - a.confidence);
  const result: any[] = [];

  while (sorted.length > 0) {
    const current = sorted.shift()!;
    result.push(current);

    for (let i = 0; i < sorted.length; i++) {
      if (calculateIoU(current.box, sorted[i].box) > iouThreshold) {
        sorted.splice(i, 1);
        i--;
      }
    }
  }

  return result;
}

// Simulated YOLO detection for testing without a model file
let simAngle = 0;
function runSimulatedDetection(rawRgba: Uint8Array): any[] {
  simAngle += 0.05;
  const detections: any[] = [];
  
  // We simulate a person moving around in the frame
  const personX = 0.3 + 0.15 * Math.sin(simAngle);
  const personY = 0.2 + 0.05 * Math.cos(simAngle);
  detections.push({
    label: 'person',
    confidence: 0.89 + 0.05 * Math.sin(simAngle),
    box: { x: personX, y: personY, width: 0.22, height: 0.6 }
  });

  // Occasionally simulate a cat or dog
  if (Math.sin(simAngle * 1.5) > 0.3) {
    detections.push({
      label: 'dog',
      confidence: 0.78,
      box: { x: personX + 0.2, y: personY + 0.35, width: 0.18, height: 0.22 }
    });
  }

  // Occasionally simulate a car
  if (Math.cos(simAngle * 0.7) > 0.4) {
    detections.push({
      label: 'car',
      confidence: 0.94,
      box: { x: 0.6 + 0.05 * Math.sin(simAngle), y: 0.4, width: 0.3, height: 0.25 }
    });
  }

  return detections;
}

async function initialize(modelPath: string) {
  try {
    console.log(`[AI Worker] Loading ONNX model from: ${modelPath}`);
    
    if (!fs.existsSync(modelPath)) {
      console.warn(`[AI Worker] YOLOv11 model not found at ${modelPath}. Running in SIMULATION MODE.`);
      isSimulationMode = true;
      parentPort?.postMessage({ type: 'initialized', success: true, simulation: true });
      return;
    }

    // Dynamic import to prevent loading issues if the binary is missing initially
    const ort = require('onnxruntime-node');
    
    // Configure session options to prevent ONNX Runtime from hogging all CPU cores
    const options = {
      executionProviders: ['cpu'], // Standard fallback. Can add 'cuda' if GPU is ready.
      graphOptimizationLevel: 'all',
      intraOpNumThreads: 1,
      interOpNumThreads: 1
    };

    session = await ort.InferenceSession.create(modelPath, options);
    isSimulationMode = false;
    
    console.log(`[AI Worker] YOLOv11 ONNX model loaded successfully!`);
    parentPort?.postMessage({ type: 'initialized', success: true, simulation: false });
  } catch (err) {
    console.error(`[AI Worker] Failed to load ONNX model. Falling back to Simulation.`, err);
    isSimulationMode = true;
    parentPort?.postMessage({ type: 'initialized', success: true, simulation: true });
  }
}

async function detect(width: number, height: number, buffer: Uint8Array, customClasses?: Record<number, string>) {
  const startTime = Date.now();

  if (isSimulationMode || !session) {
    const duration = Date.now() - startTime;
    // Simulate minor processing delay
    await new Promise((resolve) => setTimeout(resolve, Math.max(2, 10 - duration)));
    parentPort?.postMessage({
      type: 'detection_result',
      detections: runSimulatedDetection(buffer),
      duration: Date.now() - startTime
    });
    return;
  }

  try {
    const ort = require('onnxruntime-node');

    // Input image is 640x640 RGBA
    // We need to convert it to standard Float32 planar RGB format (1 x 3 x 640 x 640)
    const channels = 3;
    const targetSize = 640;
    const float32Data = new Float32Array(channels * targetSize * targetSize);

    // RGB Normalization and transposition: RGBA -> RRRR... GGGG... BBBB...
    const imageSize = targetSize * targetSize;
    for (let i = 0; i < imageSize; i++) {
      const rIdx = i * 4;
      const gIdx = rIdx + 1;
      const bIdx = rIdx + 2;

      float32Data[i] = buffer[rIdx] / 255.0;                   // Red channel
      float32Data[imageSize + i] = buffer[gIdx] / 255.0;       // Green channel
      float32Data[imageSize * 2 + i] = buffer[bIdx] / 255.0;   // Blue channel
    }

    // Create tensor
    const inputTensor = new ort.Tensor('float32', float32Data, [1, 3, targetSize, targetSize]);

    // Feed to ONNX session
    const inputName = session.inputNames[0];
    const outputName = session.outputNames[0];
    const outputs = await session.run({ [inputName]: inputTensor });

    const outputTensor = outputs[outputName];
    const outputData = outputTensor.data as Float32Array;
    const outputDims = outputTensor.dims; // YOLOv8/11 output is [1, 84, 8400] or [1, 8400, 84] or [1, 4+C, 8400]

    const candidates: any[] = [];
    const confidenceThreshold = 0.45;

    // Detect format dynamically
    let numBoxes = 0;
    let numFeatures = 0;
    let isTransposed = false;

    const dim1 = outputDims[1];
    const dim2 = outputDims[2];
    if (dim1 < dim2) {
      numFeatures = dim1;
      numBoxes = dim2;
      isTransposed = false;
    } else {
      numBoxes = dim1;
      numFeatures = dim2;
      isTransposed = true;
    }

    const numClasses = numFeatures - 4;

    // Build model classes mapping
    let modelClasses: Record<number, string> = {};
    if (numClasses === 80) {
      COCO_CLASSES.forEach((name, idx) => {
        modelClasses[idx] = name;
      });
    } else if (customClasses) {
      // Map sorted custom classes keys to sequential 0, 1, 2...
      const sortedKeys = Object.keys(customClasses)
        .map(Number)
        .sort((a, b) => a - b);
      
      sortedKeys.forEach((key, idx) => {
        modelClasses[idx] = customClasses[key];
      });
    } else {
      for (let i = 0; i < numClasses; i++) {
        modelClasses[i] = `class_${i}`;
      }
    }

    // Build target classes name filter
    const targetClassNames = new Set<string>();
    
    // Always search for classes in dataset.yaml
    if (customClasses) {
      Object.values(customClasses).forEach(name => targetClassNames.add(name.toLowerCase()));
    }
    
    // Always include person as a target class
    targetClassNames.add('person');

    // If using the standard COCO model, also search for the other default COCO classes
    if (numClasses === 80) {
      Object.values(TARGET_CLASSES).forEach(name => targetClassNames.add(name.toLowerCase()));
    }

    for (let col = 0; col < numBoxes; col++) {
      let cx, cy, w, h;
      let maxClassScore = 0;
      let maxClassId = -1;

      if (!isTransposed) {
        cx = outputData[col];
        cy = outputData[numBoxes + col];
        w = outputData[numBoxes * 2 + col];
        h = outputData[numBoxes * 3 + col];

        for (let cl = 0; cl < numClasses; cl++) {
          const score = outputData[numBoxes * (4 + cl) + col];
          if (score > maxClassScore) {
            maxClassScore = score;
            maxClassId = cl;
          }
        }
      } else {
        const offset = col * numFeatures;
        cx = outputData[offset];
        cy = outputData[offset + 1];
        w = outputData[offset + 2];
        h = outputData[offset + 3];

        for (let cl = 0; cl < numClasses; cl++) {
          const score = outputData[offset + 4 + cl];
          if (score > maxClassScore) {
            maxClassScore = score;
            maxClassId = cl;
          }
        }
      }

      // Filter target classes and confidence
      const label = modelClasses[maxClassId];
      if (maxClassScore >= confidenceThreshold && label && targetClassNames.has(label.toLowerCase())) {
        // Normalize box from 640x640 coordinates to 0.0 - 1.0 relative coordinates
        const x = (cx - w / 2) / targetSize;
        const y = (cy - h / 2) / targetSize;
        const boxW = w / targetSize;
        const boxH = h / targetSize;

        candidates.push({
          label: label,
          confidence: maxClassScore,
          box: {
            x: Math.max(0, Math.min(1, x)),
            y: Math.max(0, Math.min(1, y)),
            width: Math.max(0, Math.min(1, boxW)),
            height: Math.max(0, Math.min(1, boxH))
          }
        });
      }
    }

    // Apply Non-Maximum Suppression to remove overlapping duplicates
    const finalDetections = nonMaximumSuppression(candidates, 0.45);
    const duration = Date.now() - startTime;

    parentPort?.postMessage({
      type: 'detection_result',
      detections: finalDetections,
      duration
    });

  } catch (err) {
    console.error('[AI Worker] Detection error:', err);
    parentPort?.postMessage({
      type: 'error',
      error: (err as Error).message
    });
  }
}

// Listen for messages from the main process
parentPort?.on('message', (msg) => {
  if (msg.type === 'init') {
    initialize(msg.modelPath);
  } else if (msg.type === 'detect') {
    detect(msg.width, msg.height, new Uint8Array(msg.buffer), msg.customClasses);
  }
});

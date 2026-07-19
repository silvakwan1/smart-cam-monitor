import cv2
import numpy as np
import onnxruntime as ort
import os
from typing import List, Dict, Any
from models.base.Detector import Detector

class YoloDetector(Detector):
    def __init__(self):
        self.session = None
        self.input_name = None
        self.output_names = None
        self.classes = self._get_coco_classes()
        self.device = "cpu"
        self.input_shape = (640, 640)

    def load_model(self, model_path: str, device: str = "auto") -> bool:
        if not os.path.exists(model_path):
            print(f"[YoloDetector] Model path not found: {model_path}. Running in mock mode.")
            return False

        try:
            # Set providers based on device request
            providers = ['CPUExecutionProvider']
            if device == "auto" or device == "cuda":
                available_providers = ort.get_available_providers()
                if 'CUDAExecutionProvider' in available_providers:
                    providers = ['CUDAExecutionProvider'] + providers
                    self.device = "cuda"
                    print("[YoloDetector] CUDA Execution Provider loaded successfully!")
                elif 'DmlExecutionProvider' in available_providers: # DirectML
                    providers = ['DmlExecutionProvider'] + providers
                    self.device = "directml"
                    print("[YoloDetector] DirectML (GPU) Execution Provider loaded successfully!")
                else:
                    self.device = "cpu"
                    print("[YoloDetector] No GPU providers available, falling back to CPU.")
            elif device == "directml":
                providers = ['DmlExecutionProvider', 'CPUExecutionProvider']
                self.device = "directml"
            elif device == "cuda":
                providers = ['CUDAExecutionProvider', 'CPUExecutionProvider']
                self.device = "cuda"

            self.session = ort.InferenceSession(model_path, providers=providers)
            self.input_name = self.session.get_inputs()[0].name
            self.output_names = [o.name for o in self.session.get_outputs()]
            
            # Resolve model input dimensions
            input_shape = self.session.get_inputs()[0].shape
            if len(input_shape) == 4:
                self.input_shape = (input_shape[2], input_shape[3]) # (height, width)
            
            print(f"[YoloDetector] Loaded ONNX Model {model_path} successfully. Input shape: {self.input_shape}")
            return True
        except Exception as e:
            print(f"[YoloDetector] Failed to load ONNX model: {e}. Falling back to mock.")
            self.session = None
            return False

    def detect(self, frame: np.ndarray, conf_threshold: float = 0.25, iou_threshold: float = 0.45) -> List[Dict[str, Any]]:
        if self.session is None:
            # Mock mode if no model loaded (returns empty list by default to prevent fake boxes)
            return []

        orig_h, orig_w = frame.shape[:2]
        
        # 1. Preprocessing
        # Resize to model input shape
        input_w, input_h = self.input_shape
        resized = cv2.resize(frame, (input_w, input_h))
        
        # Convert BGR to RGB, normalize, and transpose to channels-first format (C, H, W)
        rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)
        normalized = rgb.astype(np.float32) / 255.0
        transposed = np.transpose(normalized, (2, 0, 1))
        input_tensor = np.expand_dims(transposed, axis=0) # Shape: (1, 3, H, W)

        # 2. Run Inference
        outputs = self.session.run(self.output_names, {self.input_name: input_tensor})
        output = outputs[0] # Shape: (1, 84, 8400) or similar depending on YOLO format

        # 3. Postprocessing
        # Squeeze batch dimension
        output = np.squeeze(output) # Shape: (84, 8400)
        
        # If output is transposed (like YOLOv8/YOLOv11 output is 84 x 8400)
        # We transpose it back to 8400 x 84
        if output.shape[0] < output.shape[1]:
            output = output.T # Shape: (8400, 84)

        boxes = []
        confidences = []
        class_ids = []

        # YOLO output contains coordinates (xc, yc, w, h) in the first 4 columns
        # and class scores in the remaining columns
        num_classes = output.shape[1] - 4

        for row in output:
            scores = row[4:]
            class_id = np.argmax(scores)
            confidence = scores[class_id]
            
            if confidence >= conf_threshold:
                xc, yc, w, h = row[:4]
                
                # Convert center coordinates to x1, y1 coordinates
                x1 = xc - w / 2
                y1 = yc - h / 2
                
                boxes.append([x1, y1, x1 + w, y1 + h])
                confidences.append(float(confidence))
                class_ids.append(int(class_id))

        if len(boxes) == 0:
            return []

        # Apply NumPy NMS
        np_boxes = np.array(boxes)
        np_confidences = np.array(confidences)
        indices = self._nms(np_boxes, np_confidences, iou_threshold)

        detections = []
        for idx in indices:
            x1, y1, x2, y2 = boxes[idx]
            conf = confidences[idx]
            cid = class_ids[idx]
            
            # Clip coordinates
            x1 = max(0, min(x1, input_w))
            y1 = max(0, min(y1, input_h))
            x2 = max(0, min(x2, input_w))
            y2 = max(0, min(y2, input_h))
            
            # Rescale back to original frame dimensions
            abs_x1 = int(x1 * (orig_w / input_w))
            abs_y1 = int(y1 * (orig_h / input_h))
            abs_w = int((x2 - x1) * (orig_w / input_w))
            abs_h = int((y2 - y1) * (orig_h / input_h))

            label = self.classes.get(cid, f"object_{cid}")

            detections.append({
                "class": label,
                "confidence": round(conf, 2),
                "bbox": {
                    "x": abs_x1,
                    "y": abs_y1,
                    "width": abs_w,
                    "height": abs_h
                }
            })

        return detections

    def unload(self) -> None:
        self.session = None
        print("[YoloDetector] Unloaded model from memory.")

    def _nms(self, boxes: np.ndarray, scores: np.ndarray, iou_threshold: float) -> List[int]:
        x1 = boxes[:, 0]
        y1 = boxes[:, 1]
        x2 = boxes[:, 2]
        y2 = boxes[:, 3]
        areas = (x2 - x1) * (y2 - y1)
        order = scores.argsort()[::-1]
        keep = []
        
        while order.size > 0:
            i = order[0]
            keep.append(i)
            xx1 = np.maximum(x1[i], x1[order[1:]])
            yy1 = np.maximum(y1[i], y1[order[1:]])
            xx2 = np.minimum(x2[i], x2[order[1:]])
            yy2 = np.minimum(y2[i], y2[order[1:]])
            w = np.maximum(0.0, xx2 - xx1)
            h = np.maximum(0.0, yy2 - yy1)
            inter = w * h
            ovr = inter / (areas[i] + areas[order[1:]] - inter)
            inds = np.where(ovr <= iou_threshold)[0]
            order = order[inds + 1]
            
        return keep

    def _get_coco_classes(self) -> Dict[int, str]:
        return {
            0: "person", 1: "bicycle", 2: "car", 3: "motorcycle", 4: "airplane",
            5: "bus", 6: "train", 7: "truck", 8: "boat", 9: "traffic light",
            10: "fire hydrant", 11: "stop sign", 12: "parking meter", 13: "bench",
            14: "bird", 15: "cat", 16: "dog", 17: "horse", 18: "sheep", 19: "cow",
            20: "elephant", 21: "bear", 22: "zebra", 23: "giraffe", 24: "backpack",
            25: "umbrella", 26: "handbag", 27: "tie", 28: "suitcase", 29: "frisbee",
            30: "skis", 31: "snowboard", 32: "sports ball", 33: "kite", 34: "baseball bat",
            35: "baseball glove", 36: "skateboard", 37: "surfboard", 38: "tennis racket",
            39: "bottle", 40: "wine glass", 41: "cup", 42: "fork", 43: "knife",
            44: "spoon", 45: "bowl", 46: "banana", 47: "apple", 48: "sandwich",
            49: "orange", 50: "broccoli", 51: "carrot", 52: "hot dog", 53: "pizza",
            54: "donut", 55: "cake", 56: "chair", 57: "couch", 58: "potted plant",
            59: "bed", 60: "dining table", 61: "toilet", 62: "tv", 63: "laptop",
            64: "mouse", 65: "remote", 66: "keyboard", 67: "cell phone", 68: "microwave",
            69: "oven", 70: "toaster", 71: "sink", 72: "refrigerator", 73: "book",
            74: "clock", 75: "vase", 76: "scissors", 77: "teddy bear", 78: "hair drier",
            79: "toothbrush"
        }

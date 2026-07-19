import time
from typing import List, Dict, Any, Optional
import numpy as np
from models.base.Detector import Detector
from models.detectors.YoloDetector import YoloDetector

class DetectionService:
    def __init__(self):
        self.detector: Optional[Detector] = None
        self.stats = {
            "preprocess_time_ms": 0.0,
            "inference_time_ms": 0.0,
            "postprocess_time_ms": 0.0,
            "fps": 0.0
        }

    def load_detector(self, detector_type: str, model_path: str, device: str = "auto") -> bool:
        if detector_type == "yolo":
            self.detector = YoloDetector()
        else:
            raise ValueError(f"Unknown detector type: {detector_type}")
        
        return self.detector.load_model(model_path, device)

    def run_detection(self, frame: np.ndarray, conf: float = 0.25, iou: float = 0.45) -> List[Dict[str, Any]]:
        if self.detector is None:
            return []

        start_time = time.time()
        
        # In a real environment, we'd profile preprocess/inference/postprocess inside the detector.
        # Here we collect general statistics for telemetry.
        detections = self.detector.detect(frame, conf, iou)
        
        duration_ms = (time.time() - start_time) * 1000.0
        self.stats["inference_time_ms"] = round(duration_ms * 0.8, 1) # Mock breakdown for display
        self.stats["preprocess_time_ms"] = round(duration_ms * 0.1, 1)
        self.stats["postprocess_time_ms"] = round(duration_ms * 0.1, 1)

        return detections

    def get_stats(self) -> Dict[str, float]:
        return self.stats

    def unload(self) -> None:
        if self.detector:
            self.detector.unload()
            self.detector = None

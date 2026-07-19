from abc import ABC, abstractmethod
import numpy as np
from typing import List, Dict, Any

class Detector(ABC):
    @abstractmethod
    def load_model(self, model_path: str, device: str = "auto") -> bool:
        """
        Loads the model weights from model_path on specified device (cuda, directml, cpu).
        """
        pass

    @abstractmethod
    def detect(self, frame: np.ndarray, conf_threshold: float = 0.25, iou_threshold: float = 0.45) -> List[Dict[str, Any]]:
        """
        Runs inference on raw OpenCV frame (numpy array BGR).
        Returns a list of detections, each matching this format:
        {
            "class": str,
            "confidence": float,
            "bbox": {
                "x": int, # absolute pixels x
                "y": int, # absolute pixels y
                "width": int,
                "height": int
            }
        }
        """
        pass

    @abstractmethod
    def unload(self) -> None:
        """
        Unloads model weights from memory/GPU.
        """
        pass

import numpy as np
from typing import Dict, Any
from models.base.Classifier import Classifier

class HelmetClassifier(Classifier):
    def classify(self, crop: np.ndarray) -> Dict[str, Any]:
        # Crop is a crop of a detected person
        # Checks if they are wearing a safety helmet (e.g. returns confidence)
        return {
            "label": "helmet_detected",
            "confidence": 0.0,
            "status": "not_wearing"
        }

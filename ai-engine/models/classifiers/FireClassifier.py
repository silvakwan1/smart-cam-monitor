import numpy as np
from typing import Dict, Any
from models.base.Classifier import Classifier

class FireClassifier(Classifier):
    def classify(self, crop: np.ndarray) -> Dict[str, Any]:
        return {
            "label": "fire",
            "confidence": 0.0,
            "detected": False
        }

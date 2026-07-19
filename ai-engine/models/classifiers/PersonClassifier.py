import numpy as np
from typing import Dict, Any
from models.base.Classifier import Classifier

class PersonClassifier(Classifier):
    def classify(self, crop: np.ndarray) -> Dict[str, Any]:
        return {
            "gender": "unknown",
            "age": "unknown"
        }

from abc import ABC, abstractmethod
import numpy as np
from typing import List, Dict, Any

class Classifier(ABC):
    @abstractmethod
    def classify(self, crop: np.ndarray) -> Dict[str, Any]:
        """
        Runs secondary classification on a cropped bounding box (e.g. helmet, fire, face).
        """
        pass

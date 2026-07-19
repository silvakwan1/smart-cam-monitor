from abc import ABC, abstractmethod
import numpy as np
from typing import List, Dict, Any

class Segmenter(ABC):
    @abstractmethod
    def segment(self, frame: np.ndarray) -> List[Dict[str, Any]]:
        """
        Runs instance segmentation on the frame, returning polygons and masks.
        """
        pass

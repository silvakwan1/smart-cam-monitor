from abc import ABC, abstractmethod
import numpy as np
from typing import List, Dict, Any

class Tracker(ABC):
    @abstractmethod
    def update(self, detections: List[Dict[str, Any]], frame: np.ndarray) -> List[Dict[str, Any]]:
        """
        Receives current frame detections and links them across frames to assign unique persistent tracking IDs.
        Appends "id": int to each dictionary item in the detections list.
        """
        pass

    @abstractmethod
    def reset(self) -> None:
        """
        Clears existing tracker history/states.
        """
        pass

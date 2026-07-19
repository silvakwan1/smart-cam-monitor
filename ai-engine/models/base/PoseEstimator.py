from abc import ABC, abstractmethod
import numpy as np
from typing import List, Dict, Any

class PoseEstimator(ABC):
    @abstractmethod
    def estimate_pose(self, frame: np.ndarray) -> List[Dict[str, Any]]:
        """
        Runs pose estimation, returning skeletal keypoints.
        """
        pass

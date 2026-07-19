from typing import List, Dict, Any, Optional
import numpy as np
from models.base.Tracker import Tracker
from models.trackers.ByteTracker import ByteTracker

class TrackingService:
    def __init__(self):
        self.tracker: Optional[Tracker] = None

    def enable_tracker(self, tracker_type: str, max_age: int = 30) -> None:
        if tracker_type == "bytetrack":
            self.tracker = ByteTracker(max_age=max_age)
        else:
            raise ValueError(f"Unknown tracker type: {tracker_type}")

    def disable_tracker(self) -> None:
        self.tracker = None

    def track(self, detections: List[Dict[str, Any]], frame: np.ndarray) -> List[Dict[str, Any]]:
        if self.tracker is None:
            # If tracker disabled, return detections as they are (no ID)
            return detections
        return self.tracker.update(detections, frame)

    def reset(self) -> None:
        if self.tracker:
            self.tracker.reset()

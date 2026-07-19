import numpy as np
from typing import List, Dict, Any
from models.base.Tracker import Tracker

class ByteTracker(Tracker):
    def __init__(self, max_age: int = 30, min_iou: float = 0.3):
        self.max_age = max_age
        self.min_iou = min_iou
        self.tracks = {} # id -> track info
        self.next_id = 1

    def update(self, detections: List[Dict[str, Any]], frame: np.ndarray) -> List[Dict[str, Any]]:
        matched_detections = []
        
        # Format active tracks for comparison
        track_ids = list(self.tracks.keys())
        track_boxes = [self.tracks[tid]["bbox"] for tid in track_ids]

        # Convert bounding boxes to [x1, y1, w, h] format
        det_boxes = [d["bbox"] for d in detections]

        matched_indices = set()
        matched_track_ids = set()

        # Simple greedy IOU matching
        if len(track_boxes) > 0 and len(det_boxes) > 0:
            iou_matrix = np.zeros((len(det_boxes), len(track_boxes)))
            for i, det in enumerate(det_boxes):
                for j, trk in enumerate(track_boxes):
                    iou_matrix[i, j] = self._calculate_iou(det, trk)

            # Match detections to tracks
            # Find the best match recursively
            while True:
                max_idx = np.unravel_index(np.argmax(iou_matrix), iou_matrix.shape)
                max_val = iou_matrix[max_idx]
                
                if max_val < self.min_iou:
                    break

                d_idx, t_idx = max_idx
                t_id = track_ids[t_idx]

                # Assign ID
                detections[d_idx]["id"] = t_id
                detections[d_idx]["tracking"] = True
                
                # Update track coordinates & reset age
                self.tracks[t_id]["bbox"] = det_boxes[d_idx]
                self.tracks[t_id]["age"] = 0
                
                matched_indices.add(d_idx)
                matched_track_ids.add(t_id)

                # Set this row and column to 0 so we don't match them again
                iou_matrix[d_idx, :] = 0
                iou_matrix[:, t_idx] = 0

        # Increment age for all tracks and prune dead tracks
        for tid in list(self.tracks.keys()):
            if tid not in matched_track_ids:
                self.tracks[tid]["age"] += 1
                if self.tracks[tid]["age"] > self.max_age:
                    del self.tracks[tid]

        # Start new tracks for unmatched detections
        for i, det in enumerate(detections):
            if i not in matched_indices:
                t_id = self.next_id
                self.next_id += 1
                
                self.tracks[t_id] = {
                    "bbox": det_boxes[i],
                    "age": 0,
                    "class": det["class"]
                }
                
                det["id"] = t_id
                det["tracking"] = True

        return detections

    def reset(self) -> None:
        self.tracks = {}
        self.next_id = 1

    def _calculate_iou(self, box1: Dict[str, int], box2: Dict[str, int]) -> float:
        # box format: {"x": int, "y": int, "width": int, "height": int}
        x1_1, y1_1 = box1["x"], box1["y"]
        x2_1, y2_1 = x1_1 + box1["width"], y1_1 + box1["height"]

        x1_2, y1_2 = box2["x"], box2["y"]
        x2_2, y2_2 = x1_2 + box2["width"], y1_2 + box2["height"]

        # Intersection area
        x_left = max(x1_1, x1_2)
        y_top = max(y1_1, y1_2)
        x_right = min(x2_1, x2_2)
        y_bottom = min(y2_1, y2_2)

        if x_right < x_left or y_bottom < y_top:
            return 0.0

        intersection_area = (x_right - x_left) * (y_bottom - y_top)

        # Union Area
        box1_area = box1["width"] * box1["height"]
        box2_area = box2["width"] * box2["height"]
        union_area = float(box1_area + box2_area - intersection_area)

        if union_area == 0:
            return 0.0

        return intersection_area / union_area

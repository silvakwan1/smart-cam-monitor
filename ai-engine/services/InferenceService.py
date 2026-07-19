import cv2
import time
import os
import numpy as np
from typing import List, Dict, Any, Tuple

class InferenceService:
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.zones = config.get("zones", [])
        self.virtual_lines = config.get("virtual_lines", [])
        
        # Tracking history for virtual line crossing [track_id -> list of centroids]
        self.track_history = {}
        self.line_crossings = {line["name"]: {"in": 0, "out": 0} for line in self.virtual_lines}
        
        # Heatmap state
        cam_w = config.get("camera", {}).get("width", 1280)
        cam_h = config.get("camera", {}).get("height", 720)
        self.heatmap = np.zeros((cam_h, cam_w), dtype=np.float32)
        self.last_heatmap_save = time.time()
        self.heatmap_save_interval = 10.0 # seconds
        self.heatmap_output_dir = "recordings" # local recordings folder

    def process_frame(
        self, 
        frame: np.ndarray, 
        detections: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Applies zones, virtual lines crossing, and updates the heatmaps using current tracking results.
        """
        processed_objects = []
        
        # Update heatmap
        self._update_heatmap(frame, detections)
        
        for det in detections:
            bbox = det["bbox"]
            track_id = det.get("id")
            
            # 1. Compute Centroid (middle bottom of the bounding box is best for security cameras)
            cx = int(bbox["x"] + bbox["width"] / 2)
            cy = int(bbox["y"] + bbox["height"])
            centroid = (cx, cy)
            
            # 2. Evaluate Zone Detections (Polygons)
            zone_name = self._check_zones(centroid)
            det["zone"] = zone_name
            
            # 3. Evaluate Virtual Line Crossings
            if track_id is not None:
                if track_id not in self.track_history:
                    self.track_history[track_id] = []
                self.track_history[track_id].append(centroid)
                
                # Keep last 5 frames for direction stability
                if len(self.track_history[track_id]) > 5:
                    self.track_history[track_id].pop(0)

                # Check crossing
                self._check_line_crossings(track_id)
            
            processed_objects.append(det)

        # Save heatmap periodically
        self._save_heatmap_periodically()

        return processed_objects

    def get_line_crossing_counts(self) -> Dict[str, Dict[str, int]]:
        return self.line_crossings

    def _check_zones(self, centroid: Tuple[int, int]) -> str:
        """
        Checks if the centroid is inside any of the configured polygon zones.
        """
        for zone in self.zones:
            poly = np.array(zone["polygon"], dtype=np.int32)
            # cv2.pointPolygonTest returns:
            # +1 (inside), 0 (on edge), -1 (outside)
            dist = cv2.pointPolygonTest(poly, (float(centroid[0]), float(centroid[1])), False)
            if dist >= 0:
                return zone["name"]
        return "None"

    def _check_line_crossings(self, track_id: int) -> None:
        """
        Evaluates line crossing events using geometry segment intersection.
        """
        history = self.track_history[track_id]
        if len(history) < 2:
            return
            
        p1 = history[-2] # previous frame centroid
        p2 = history[-1] # current frame centroid
        
        for line in self.virtual_lines:
            l_start, l_end = line["line_coords"]
            
            # Determine if track segment P1P2 intersects line segment L_START L_END
            if self._segments_intersect(p1, p2, l_start, l_end):
                # Verify direction based on vector dot product or simple Y-coordinate comparison
                # If going downwards crossing Y limit
                direction_in = p2[1] > p1[1] 
                
                line_name = line["name"]
                if direction_in:
                    self.line_crossings[line_name]["in"] += 1
                    print(f"[InferenceService] ID {track_id} crossed virtual line {line_name} (IN)")
                else:
                    self.line_crossings[line_name]["out"] += 1
                    print(f"[InferenceService] ID {track_id} crossed virtual line {line_name} (OUT)")

    def _segments_intersect(self, A, B, C, D) -> bool:
        """
        Geometric check: Do segments AB and CD intersect in 2D space?
        """
        def ccw(p_a, p_b, p_c):
            return (p_c[1] - p_a[1]) * (p_b[0] - p_a[0]) > (p_b[1] - p_a[1]) * (p_c[0] - p_a[0])
            
        return ccw(A, C, D) != ccw(B, C, D) and ccw(A, B, C) != ccw(A, B, D)

    def _update_heatmap(self, frame: np.ndarray, detections: List[Dict[str, Any]]) -> None:
        """
        Accumulates heat at bounding boxes.
        """
        h, w = frame.shape[:2]
        
        # Apply slow decay to the entire heatmap so old heat fades out
        self.heatmap = self.heatmap * 0.99
        
        for det in detections:
            if det["class"] == "person": # Focus heatmap on people movement
                bbox = det["bbox"]
                x, y, bw, bh = bbox["x"], bbox["y"], bbox["width"], bbox["height"]
                
                # Clip coords
                x1 = max(0, x)
                y1 = max(0, y)
                x2 = min(w, x + bw)
                y2 = min(h, y + bh)
                
                # Add constant heat blob
                if x2 > x1 and y2 > y1:
                    self.heatmap[y1:y2, x1:x2] += 2.0

    def _save_heatmap_periodically(self) -> None:
        """
        Converts the float heatmap into a colored Jet image and saves it to disk.
        """
        now = time.time()
        if now - self.last_heatmap_save < self.heatmap_save_interval:
            return
            
        self.last_heatmap_save = now
        os.makedirs(self.heatmap_output_dir, exist_ok=True)
        
        # Normalize heatmap to [0, 255]
        max_val = np.max(self.heatmap)
        if max_val == 0:
            return
            
        normalized = np.clip((self.heatmap / max_val) * 255.0, 0, 255).astype(np.uint8)
        
        # Apply jet color map (dark blue for low heat, red for high heat)
        color_heatmap = cv2.applyColorMap(normalized, cv2.COLORMAP_JET)
        
        # Save as JPEG
        filepath = os.path.join(self.heatmap_output_dir, "heatmap_latest.jpg")
        cv2.imwrite(filepath, color_heatmap)

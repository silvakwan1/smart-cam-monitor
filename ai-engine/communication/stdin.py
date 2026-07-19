import sys
import json
import base64
import time
import cv2
import numpy as np
from typing import Callable, Dict, Any

class StdinHandler:
    def __init__(self, process_callback: Callable[[np.ndarray], Dict[str, Any]]):
        self.process_callback = process_callback
        self.running = False

    def start_loop(self):
        self.running = True
        print("[StdinHandler] Starting standard I/O communication loop...", file=sys.stderr)
        
        while self.running:
            try:
                line = sys.stdin.readline()
                if not line:
                    break # EOF
                
                # Input packet is expected to be a JSON: {"timestamp": int, "frame": "base64_jpeg_string"}
                packet = json.loads(line.strip())
                timestamp = packet.get("timestamp", int(time.time() * 1000))
                base64_frame = packet.get("frame", "")
                
                if not base64_frame:
                    continue

                # Decode Base64 image to OpenCV format
                img_data = base64.b64decode(base64_frame)
                np_arr = np.frombuffer(img_data, dtype=np.uint8)
                frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

                if frame is None:
                    error_resp = {
                        "timestamp": timestamp,
                        "error": "Failed to decode Base64 image frame"
                    }
                    print(json.dumps(error_resp), flush=True)
                    continue

                # Process frame using the provided callback (Detection + Tracking + Inference)
                start_time = time.time()
                result = self.process_callback(frame)
                latency_ms = int((time.time() - start_time) * 1000)

                # Format exact JSON structure
                result["timestamp"] = timestamp
                result["latency"] = latency_ms

                # Output JSON response to STDOUT
                print(json.dumps(result), flush=True)

            except Exception as e:
                print(f"[StdinHandler] Error processing stdin frame: {e}", file=sys.stderr)
                # Keep loop alive
                
    def stop(self):
        self.running = False
        print("[StdinHandler] Standard I/O loop stopped.", file=sys.stderr)

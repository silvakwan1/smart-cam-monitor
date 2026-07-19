import os
import sys
import yaml
import time
import argparse
import threading
import uvicorn
import numpy as np
from typing import Dict, Any

# Adjust paths to support root imports
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from services.DetectionService import DetectionService
from services.TrackingService import TrackingService
from services.TrainingService import TrainingService
from services.InferenceService import InferenceService

from communication.stdin import StdinHandler
from communication.ipc import IpcHandler
from communication.http import app_server, HttpHandler

class AIEngineOrchestrator:
    def __init__(self, config_path: str = "config/config.yaml"):
        self.config_path = config_path
        self.config = self._load_config()
        
        # Instantiate services
        self.detector_service = DetectionService()
        self.tracker_service = TrackingService()
        self.training_service = TrainingService()
        self.inference_service = InferenceService(self.config)
        
        # Frame processing telemetry stats
        self.fps_calculator = {
            "frame_count": 0,
            "last_time": time.time(),
            "current_fps": 30.0
        }

        # Initialize core services
        self._initialize_services()

    def _load_config(self) -> Dict[str, Any]:
        if not os.path.exists(self.config_path):
            print(f"[Engine] Config file not found at {self.config_path}. Loading stubs.")
            return {}
        with open(self.config_path, 'r') as f:
            return yaml.safe_load(f)

    def _initialize_services(self):
        # 1. Load Detector (ONNX YOLO)
        model_cfg = self.config.get("model", {})
        model_type = model_cfg.get("type", "yolo")
        weights_path = model_cfg.get("weights", "weights/yolo11n.onnx")
        device = model_cfg.get("device", "auto")
        
        print(f"[Engine] Loading model weights '{weights_path}' on device '{device}'...")
        self.detector_service.load_detector(model_type, weights_path, device)
        
        # 2. Configure Tracker
        tracker_cfg = self.config.get("tracker", {})
        if tracker_cfg.get("enabled", True):
            tracker_type = tracker_cfg.get("type", "bytetrack")
            max_age = tracker_cfg.get("max_age", 30)
            self.tracker_service.enable_tracker(tracker_type, max_age)

    def process_frame(self, frame: np.ndarray) -> Dict[str, Any]:
        """
        Core CV Pipeline: Preprocess -> Inference (YOLO) -> Postprocess (NMS) 
        -> Tracking (ByteTrack) -> Analytics (Zones, Lines, Heatmaps) -> Active Learning.
        """
        # A. Calculate FPS
        self.fps_calculator["frame_count"] += 1
        now = time.time()
        elapsed = now - self.fps_calculator["last_time"]
        if elapsed >= 1.0:
            self.fps_calculator["current_fps"] = round(self.fps_calculator["frame_count"] / elapsed, 1)
            self.fps_calculator["frame_count"] = 0
            self.fps_calculator["last_time"] = now

        # B. Run detection
        model_cfg = self.config.get("model", {})
        conf_thr = model_cfg.get("confidence", 0.50)
        iou_thr = model_cfg.get("iou", 0.45)
        
        detections = self.detector_service.run_detection(frame, conf_thr, iou_thr)
        
        # C. Run tracking
        tracked_detections = self.tracker_service.track(detections, frame)
        
        # D. Run spatial analysis (Zoning, Line crossings, Heatmap)
        final_objects = self.inference_service.process_frame(frame, tracked_detections)
        
        # E. Active learning: save low-confidence frames for future annotation
        self.training_service.check_active_learning(frame, final_objects, low_conf_threshold=0.45)
        
        # Format response objects
        response_objects = []
        for obj in final_objects:
            # Map absolute box dimensions
            bbox = obj["bbox"]
            response_objects.append({
                "id": obj.get("id", -1),
                "class": obj["class"],
                "confidence": obj["confidence"],
                "bbox": {
                    "x": bbox["x"],
                    "y": bbox["y"],
                    "width": bbox["width"],
                    "height": bbox["height"]
                },
                "zone": obj.get("zone", "None"),
                "tracking": obj.get("tracking", False)
            })

        return {
            "fps": self.fps_calculator["current_fps"],
            "objects": response_objects
        }

    def load_model(self, model_path: str, device: str = "auto") -> bool:
        """
        API callback to load new weights dynamically.
        """
        model_cfg = self.config.get("model", {})
        model_type = model_cfg.get("type", "yolo")
        success = self.detector_service.load_detector(model_type, model_path, device)
        if success:
            self.tracker_service.reset()
            # Update path in active memory
            self.config["model"]["weights"] = model_path
        return success

    def get_stats(self) -> Dict[str, Any]:
        """
        Collects profiling metrics.
        """
        detect_stats = self.detector_service.get_stats()
        
        # GPU detection usage (returns placeholder if not CUDA)
        gpu_percent = 0.0
        gpu_mem = 0.0
        if self.detector_service.detector and getattr(self.detector_service.detector, "device", "cpu") == "cuda":
            # Real implementation would call torch.cuda or GPUtil.
            # Using placeholder to keep setup simple.
            gpu_percent = 15.0
            gpu_mem = 512.0
            
        return {
            **detect_stats,
            "gpu_usage_percent": gpu_percent,
            "gpu_memory_used_mb": gpu_mem,
            "fps": self.fps_calculator["current_fps"]
        }

    def start(self):
        comm_cfg = self.config.get("communication", {})
        active_channels = comm_cfg.get("active_channels", ["stdin", "http", "websocket"])
        
        # 1. Start TCP Socket IPC Server
        if "ipc" in active_channels:
            ipc_port = comm_cfg.get("ipc_port", 8002)
            self.ipc_handler = IpcHandler(self.process_frame, port=ipc_port)
            self.ipc_handler.start()
            
        # 2. Start STDIN pipeline listener
        if "stdin" in active_channels:
            self.stdin_handler = StdinHandler(self.process_frame)
            threading.Thread(target=self.stdin_handler.start_loop, daemon=True).start()

        # 3. Start HTTP/WebSocket FastAPI Server (Main thread blocking)
        if "http" in active_channels or "websocket" in active_channels:
            host = comm_cfg.get("http_host", "127.0.0.1")
            port = comm_cfg.get("http_port", 8000)
            
            # Setup HTTP callbacks
            self.http_handler = HttpHandler(
                process_callback=self.process_frame,
                load_model_callback=self.load_model,
                get_stats_callback=self.get_stats,
                control_callbacks={
                    "start": lambda: print("[Engine] API Trigger: Start"),
                    "stop": lambda: print("[Engine] API Trigger: Stop"),
                    "reload": self._reload_config_action
                }
            )
            
            print(f"[Engine] Starting HTTP REST and WebSocket server on {host}:{port}...")
            uvicorn.run(app_server, host=host, port=port, log_level="warning")

    def _reload_config_action(self):
        print("[Engine] Reloading config file...")
        self.config = self._load_config()
        self.inference_service.zones = self.config.get("zones", [])
        self.inference_service.virtual_lines = self.config.get("virtual_lines", [])
        print("[Engine] Reload complete.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Boot SmartCam CV AI Engine Service")
    parser.add_argument("--config", type=str, default="config/config.yaml", help="Path to config.yaml")
    args = parser.parse_args()

    orchestrator = AIEngineOrchestrator(args.config)
    orchestrator.start()

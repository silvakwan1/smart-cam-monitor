import time
import base64
import cv2
import numpy as np
import psutil
from typing import Dict, Any, Callable
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from pydantic import BaseModel

app_server = FastAPI(
    title="SmartCam CV AI Engine",
    description="Microservice responsible for computer vision, detection, tracking, and training."
)

class ModelLoadRequest(BaseModel):
    model_path: str
    device: str = "auto"

class FrameRequest(BaseModel):
    frame: str # Base64 JPEG string
    timestamp: int = None

class HttpHandler:
    def __init__(
        self,
        process_callback: Callable[[np.ndarray], Dict[str, Any]],
        load_model_callback: Callable[[str, str], bool],
        get_stats_callback: Callable[[], Dict[str, Any]],
        control_callbacks: Dict[str, Callable[[], Any]]
    ):
        self.process_callback = process_callback
        self.load_model_callback = load_model_callback
        self.get_stats_callback = get_stats_callback
        self.control_callbacks = control_callbacks
        
        self._setup_routes()

    def _setup_routes(self):
        @app_server.get("/health")
        def health_check():
            return {
                "status": "healthy",
                "timestamp": int(time.time() * 1000),
                "engine": "YOLOv11 ONNX / PyTorch Python Service"
            }

        @app_server.get("/statistics")
        def get_statistics():
            # CPU and Memory using psutil
            cpu_usage = psutil.cpu_percent()
            memory = psutil.virtual_memory()
            memory_used = round(memory.used / (1024 * 1024), 1) # MB
            
            # Fetch engine statistics from inference services
            engine_stats = self.get_stats_callback()

            return {
                "cpu_usage_percent": cpu_usage,
                "memory_used_mb": memory_used,
                "memory_total_mb": round(memory.total / (1024 * 1024), 1),
                "gpu_usage_percent": engine_stats.get("gpu_usage_percent", 0.0),
                "gpu_memory_used_mb": engine_stats.get("gpu_memory_used_mb", 0.0),
                "fps": engine_stats.get("fps", 30.0),
                "preprocess_ms": engine_stats.get("preprocess_time_ms", 0.0),
                "inference_ms": engine_stats.get("inference_time_ms", 0.0),
                "postprocess_ms": engine_stats.get("postprocess_time_ms", 0.0)
            }

        @app_server.post("/load_model")
        def load_model(req: ModelLoadRequest):
            success = self.load_model_callback(req.model_path, req.device)
            if not success:
                raise HTTPException(status_code=400, detail="Failed to load requested model file.")
            return {"status": "success", "message": f"Model {req.model_path} loaded successfully."}

        @app_server.post("/detect")
        def detect_single_frame(req: FrameRequest):
            try:
                img_data = base64.b64decode(req.frame)
                np_arr = np.frombuffer(img_data, dtype=np.uint8)
                frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
                
                if frame is None:
                    raise HTTPException(status_code=400, detail="Could not decode frame image.")

                start = time.time()
                result = self.process_callback(frame)
                latency = int((time.time() - start) * 1000)

                result["timestamp"] = req.timestamp or int(time.time() * 1000)
                result["latency"] = latency
                return result
            except Exception as e:
                raise HTTPException(status_code=500, detail=str(e))

        @app_server.post("/start")
        def start_engine():
            if "start" in self.control_callbacks:
                self.control_callbacks["start"]()
            return {"status": "success", "message": "Engine starting..."}

        @app_server.post("/stop")
        def stop_engine():
            if "stop" in self.control_callbacks:
                self.control_callbacks["stop"]()
            return {"status": "success", "message": "Engine stopping..."}

        @app_server.post("/reload")
        def reload_engine():
            if "reload" in self.control_callbacks:
                self.control_callbacks["reload"]()
            return {"status": "success", "message": "Engine configuration reloaded."}

        @app_server.websocket("/ws")
        async def websocket_stream(websocket: WebSocket):
            await websocket.accept()
            print("[HttpHandler] New WebSocket streaming client connected!")
            
            try:
                while True:
                    # Receive Base64 text packet
                    data = await websocket.receive_text()
                    
                    try:
                        # Expects JSON string: {"timestamp": int, "frame": "base64_jpeg"}
                        import json
                        packet = json.loads(data)
                        timestamp = packet.get("timestamp", int(time.time() * 1000))
                        base64_frame = packet.get("frame", "")
                        
                        if not base64_frame:
                            continue
                            
                        # Decode
                        img_data = base64.b64decode(base64_frame)
                        np_arr = np.frombuffer(img_data, dtype=np.uint8)
                        frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
                        
                        if frame is None:
                            continue

                        # Process
                        start = time.time()
                        result = self.process_callback(frame)
                        latency = int((time.time() - start) * 1000)

                        result["timestamp"] = timestamp
                        result["latency"] = latency
                        
                        # Send JSON back
                        await websocket.send_json(result)
                    except Exception as e:
                        await websocket.send_json({"error": str(e)})
            except WebSocketDisconnect:
                print("[HttpHandler] WebSocket streaming client disconnected.")
            except Exception as e:
                print(f"[HttpHandler] WebSocket error: {e}")

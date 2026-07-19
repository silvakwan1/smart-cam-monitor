import socket
import json
import base64
import threading
import time
import cv2
import numpy as np
from typing import Callable, Dict, Any

class IpcHandler:
    def __init__(self, process_callback: Callable[[np.ndarray], Dict[str, Any]], host: str = "127.0.0.1", port: int = 8002):
        self.process_callback = process_callback
        self.host = host
        self.port = port
        self.server_socket = None
        self.running = False
        self.thread = None

    def start(self):
        self.running = True
        self.server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.server_socket.bind((self.host, self.port))
        self.server_socket.listen(5)
        
        self.thread = threading.Thread(target=self._listen_loop, daemon=True)
        self.thread.start()
        print(f"[IpcHandler] TCP socket IPC server listening on {self.host}:{self.port}...")

    def _listen_loop(self):
        while self.running:
            try:
                client_sock, addr = self.server_socket.accept()
                client_thread = threading.Thread(target=self._handle_client, args=(client_sock,), daemon=True)
                client_thread.start()
            except Exception:
                break

    def _handle_client(self, client_sock: socket.socket):
        buffer = ""
        while self.running:
            try:
                data = client_sock.recv(4096)
                if not data:
                    break
                
                buffer += data.decode('utf-8')
                
                # Split packets by newline delimiter (standard socket framing)
                while "\n" in buffer:
                    line, buffer = buffer.split("\n", 1)
                    if not line.strip():
                        continue
                        
                    packet = json.loads(line.strip())
                    timestamp = packet.get("timestamp", int(time.time() * 1000))
                    base64_frame = packet.get("frame", "")
                    
                    if not base64_frame:
                        continue
                        
                    # Decode frame
                    img_data = base64.b64decode(base64_frame)
                    np_arr = np.frombuffer(img_data, dtype=np.uint8)
                    frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
                    
                    if frame is None:
                        continue
                        
                    # Process frame
                    start = time.time()
                    result = self.process_callback(frame)
                    latency = int((time.time() - start) * 1000)
                    
                    result["timestamp"] = timestamp
                    result["latency"] = latency
                    
                    # Send response back with newline delimiter
                    resp_str = json.dumps(result) + "\n"
                    client_sock.sendall(resp_str.encode('utf-8'))
                    
            except Exception as e:
                print(f"[IpcHandler] Client socket error: {e}")
                break
        client_sock.close()

    def stop(self):
        self.running = False
        if self.server_socket:
            self.server_socket.close()
        print("[IpcHandler] IPC TCP server stopped.")

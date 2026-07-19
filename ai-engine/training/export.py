import argparse
import sys
import os

try:
    from ultralytics import YOLO
except ImportError:
    print("[Export] Error: 'ultralytics' library is required to export YOLO models.")
    sys.exit(1)

def main():
    parser = argparse.ArgumentParser(description="Export PyTorch model weights to ONNX/TorchScript format")
    parser.add_argument("--weights", type=str, required=True, help="Path to PyTorch weights file (e.g., best.pt)")
    parser.add_argument("--format", type=str, default="onnx", choices=["onnx", "torchscript", "engine"], help="Export format target")
    args = parser.parse_args()

    if not os.path.exists(args.weights):
        print(f"[Export] Error: Weights file not found at {args.weights}")
        sys.exit(1)

    print(f"[Export] Loading model weights from {args.weights}...")
    try:
        model = YOLO(args.weights)
        print(f"[Export] Exporting model to format: {args.format}...")
        
        # export() converts and saves model file in same folder
        exported_file = model.export(format=args.format)
        
        print(f"[Export] Export successful. Output path: {exported_file}")
    except Exception as e:
        print(f"[Export] Export failed: {e}")

if __name__ == "__main__":
    main()

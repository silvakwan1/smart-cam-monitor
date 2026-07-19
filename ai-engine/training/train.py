import argparse
import sys
import os

try:
    from ultralytics import YOLO
except ImportError:
    print("[Train] Error: 'ultralytics' library is required to run YOLO training.")
    print("Please install dependencies: pip install -r requirements.txt")
    sys.exit(1)

def main():
    parser = argparse.ArgumentParser(description="Train custom YOLOv8/YOLOv11 model using PyTorch")
    parser.add_argument("--config", type=str, default="datasets/dataset.yaml", help="Path to dataset.yaml config")
    parser.add_argument("--weights", type=str, default="weights/yolo11n.pt", help="Path to pre-trained weights to resume from")
    parser.add_argument("--epochs", type=int, default=50, help="Number of training epochs")
    parser.add_argument("--batch", type=int, default=16, help="Batch size")
    parser.add_argument("--imgsz", type=int, default=640, help="Inference resolution size")
    args = parser.parse_args()

    print(f"[Train] Initializing YOLO with weights: {args.weights}")
    if not os.path.exists(args.weights):
        print(f"[Train] Pre-trained weights file '{args.weights}' not found. Initializing a new model structure...")
        # Ultralytics will auto-download the weights if not found locally
    
    try:
        model = YOLO(args.weights)
        print(f"[Train] Kicking off training on {args.config} for {args.epochs} epochs...")
        model.train(
            data=args.config,
            epochs=args.epochs,
            batch=args.batch,
            imgsz=args.imgsz,
            device=0 # Default to first CUDA GPU. Fallback to CPU if not found.
        )
        print("[Train] Training session completed. Check 'runs/detect/train' for logs and best.pt model weights.")
    except Exception as e:
        print(f"[Train] Training failed: {e}")

if __name__ == "__main__":
    main()

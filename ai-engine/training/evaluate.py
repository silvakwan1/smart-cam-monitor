import argparse
import sys
import os

try:
    from ultralytics import YOLO
except ImportError:
    print("[Evaluate] Error: 'ultralytics' library is required to validate YOLO models.")
    sys.exit(1)

def main():
    parser = argparse.ArgumentParser(description="Evaluate YOLOv8/YOLOv11 model accuracy on a dataset validation split")
    parser.add_argument("--weights", type=str, required=True, help="Path to model weights file")
    parser.add_argument("--config", type=str, default="datasets/dataset.yaml", help="Path to dataset.yaml config")
    args = parser.parse_args()

    if not os.path.exists(args.weights):
        print(f"[Evaluate] Error: Weights file not found at {args.weights}")
        sys.exit(1)

    print(f"[Evaluate] Loading model weights from {args.weights}...")
    try:
        model = YOLO(args.weights)
        print(f"[Evaluate] Evaluating model on validation split defined in {args.config}...")
        
        metrics = model.val(data=args.config)
        
        print("\n=== Validation Results ===")
        print(f"mAP50-95: {metrics.box.map:.4f}")
        print(f"mAP50:    {metrics.box.map50:.4f}")
        print(f"Precision: {metrics.box.mp:.4f}")
        print(f"Recall:    {metrics.box.mr:.4f}")
        print("==========================\n")
        
    except Exception as e:
        print(f"[Evaluate] Evaluation session failed: {e}")

if __name__ == "__main__":
    main()

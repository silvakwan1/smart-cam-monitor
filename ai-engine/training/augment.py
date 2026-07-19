import cv2
import numpy as np
import os
import argparse
import random
from typing import List, Tuple

class DataAugmentor:
    @staticmethod
    def adjust_brightness_contrast(image: np.ndarray, alpha: float = 1.0, beta: int = 0) -> np.ndarray:
        """
        alpha: contrast multiplier (1.0-3.0)
        beta: brightness shift (-100 to 100)
        """
        adjusted = cv2.convertScaleAbs(image, alpha=alpha, beta=beta)
        return adjusted

    @staticmethod
    def apply_blur(image: np.ndarray, kernel_size: int = 5) -> np.ndarray:
        if kernel_size % 2 == 0:
            kernel_size += 1
        return cv2.GaussianBlur(image, (kernel_size, kernel_size), 0)

    @staticmethod
    def add_gaussian_noise(image: np.ndarray, mean: float = 0, sigma: float = 25) -> np.ndarray:
        h, w, c = image.shape
        gauss = np.random.normal(mean, sigma, (h, w, c)).astype(np.float32)
        noisy = image.astype(np.float32) + gauss
        return np.clip(noisy, 0, 255).astype(np.uint8)

    @staticmethod
    def horizontal_flip(image: np.ndarray, labels: List[List[float]]) -> Tuple[np.ndarray, List[List[float]]]:
        """
        Flips image horizontally. 
        In YOLO label format: [class_id, x_center, y_center, width, height] (all normalized 0-1)
        x_center becomes 1.0 - x_center
        """
        flipped_img = cv2.flip(image, 1)
        flipped_labels = []
        for lbl in labels:
            cid, xc, yc, w, h = lbl
            flipped_labels.append([cid, 1.0 - xc, yc, w, h])
        return flipped_img, flipped_labels

    @staticmethod
    def add_random_shadow(image: np.ndarray) -> np.ndarray:
        """
        Applies a random dark polygon polygon mask to simulate shadows.
        """
        h, w = image.shape[:2]
        x1, y1 = random.randint(0, w // 2), 0
        x2, y2 = random.randint(w // 2, w), 0
        x3, y3 = random.randint(w // 2, w), h
        x4, y4 = random.randint(0, w // 2), h
        
        mask = np.zeros_like(image, dtype=np.uint8)
        poly = np.array([[x1, y1], [x2, y2], [x3, y3], [x4, y4]], dtype=np.int32)
        cv2.fillPoly(mask, [poly], (255, 255, 255))
        
        # Dim shadow area
        shadowed = image.copy()
        shadow_intensity = random.uniform(0.4, 0.7)
        indices = np.where(mask == 255)
        shadowed[indices[0], indices[1], indices[2]] = (image[indices[0], indices[1], indices[2]] * shadow_intensity).astype(np.uint8)
        return shadowed

def load_yolo_labels(path: str) -> List[List[float]]:
    labels = []
    if not os.path.exists(path):
        return labels
    with open(path, 'r') as f:
        for line in f:
            parts = line.strip().split()
            if len(parts) == 5:
                labels.append([int(parts[0]), float(parts[1]), float(parts[2]), float(parts[3]), float(parts[4])])
    return labels

def save_yolo_labels(path: str, labels: List[List[float]]):
    with open(path, 'w') as f:
        for lbl in labels:
            cid, xc, yc, w, h = lbl
            f.write(f"{int(cid)} {xc:.6f} {yc:.6f} {w:.6f} {h:.6f}\n")

def main():
    parser = argparse.ArgumentParser(description="Apply offline data augmentation to YOLO dataset split")
    parser.add_argument("--image", type=str, required=True, help="Path to input image")
    parser.add_argument("--output_dir", type=str, default="datasets/augmented", help="Path to save augmented dataset")
    args = parser.parse_args()

    if not os.path.exists(args.image):
        print(f"[Augment] File not found: {args.image}")
        return

    os.makedirs(args.output_dir, exist_ok=True)
    img = cv2.imread(args.image)
    
    # Try finding matching labels file
    base, ext = os.path.splitext(args.image)
    label_path = base.replace("images", "labels") + ".txt"
    labels = load_yolo_labels(label_path)

    base_name = os.path.basename(base)
    print(f"[Augment] Applying transformations to {base_name}...")

    augmentor = DataAugmentor()

    # 1. Flip
    flipped_img, flipped_lbls = augmentor.horizontal_flip(img, labels)
    cv2.imwrite(os.path.join(args.output_dir, f"{base_name}_flipped.jpg"), flipped_img)
    if labels:
        save_yolo_labels(os.path.join(args.output_dir, f"{base_name}_flipped.txt"), flipped_lbls)

    # 2. Brightness/Contrast
    bright_img = augmentor.adjust_brightness_contrast(img, alpha=1.2, beta=35)
    cv2.imwrite(os.path.join(args.output_dir, f"{base_name}_bright.jpg"), bright_img)
    if labels:
        save_yolo_labels(os.path.join(args.output_dir, f"{base_name}_bright.txt"), labels)

    # 3. Blur
    blurred_img = augmentor.apply_blur(img, kernel_size=5)
    cv2.imwrite(os.path.join(args.output_dir, f"{base_name}_blurred.jpg"), blurred_img)
    if labels:
        save_yolo_labels(os.path.join(args.output_dir, f"{base_name}_blurred.txt"), labels)

    # 4. Shadow
    shadowed_img = augmentor.add_random_shadow(img)
    cv2.imwrite(os.path.join(args.output_dir, f"{base_name}_shadow.jpg"), shadowed_img)
    if labels:
        save_yolo_labels(os.path.join(args.output_dir, f"{base_name}_shadow.txt"), labels)

    print(f"[Augment] Augmentation complete. Files saved to {args.output_dir}")

if __name__ == "__main__":
    main()

from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1] / "datasets"
TEMP_DIR = ROOT / "temp"
TRAIN_IMG_DIR = ROOT / "images" / "train"
VALID_IMG_DIR = ROOT / "images" / "valid"
TRAIN_LABEL_DIR = ROOT / "labels" / "train"
VALID_LABEL_DIR = ROOT / "labels" / "valid"

for directory in [TRAIN_IMG_DIR, VALID_IMG_DIR, TRAIN_LABEL_DIR, VALID_LABEL_DIR]:
    directory.mkdir(parents=True, exist_ok=True)

image_exts = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
images = sorted([p for p in TEMP_DIR.iterdir() if p.is_file() and p.suffix.lower() in image_exts])

if not images:
    print("Nenhuma imagem encontrada em", TEMP_DIR)
    raise SystemExit(0)

split_index = max(1, len(images) // 10)
if split_index >= len(images):
    split_index = max(1, len(images) // 2)

moved = 0
for idx, src in enumerate(images):
    if idx < len(images) - split_index:
        target_img_dir = TRAIN_IMG_DIR
        target_label_dir = TRAIN_LABEL_DIR
    else:
        target_img_dir = VALID_IMG_DIR
        target_label_dir = VALID_LABEL_DIR

    dst_img = target_img_dir / src.name
    if dst_img.exists():
        dst_img = target_img_dir / f"{src.stem}_{idx}{src.suffix}"

    shutil.move(str(src), str(dst_img))

    label_path = target_label_dir / f"{dst_img.stem}.txt"
    if not label_path.exists():
        label_path.write_text("0 0.500000 0.500000 0.200000 0.200000\n", encoding="utf-8")

    moved += 1

print(f"Imagens processadas: {moved}")
print(f"Treino: {len(list(TRAIN_IMG_DIR.glob('*')))} imagens")
print(f"Validacao: {len(list(VALID_IMG_DIR.glob('*')))} imagens")

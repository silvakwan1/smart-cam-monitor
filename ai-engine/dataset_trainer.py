import argparse
import os
import shutil
import sys
from pathlib import Path

import yaml


SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_DATASET = SCRIPT_DIR / "datasets" / "dataset.yaml"
DEFAULT_WEIGHTS = SCRIPT_DIR / "weights" / "yolo11n.pt"
DEFAULT_OUTPUT = SCRIPT_DIR / "weights" / "custom_dataset.onnx"


def resolve_path(value: str | Path) -> Path:
    path = Path(value)
    return path if path.is_absolute() else SCRIPT_DIR / path


def fail(message: str) -> None:
    print(f"\n[DatasetTrainer] ERRO: {message}")
    input("\nPressione ENTER para sair...")
    sys.exit(1)


def load_dataset_config(dataset_yaml: Path) -> dict:
    if not dataset_yaml.exists():
        fail(f"dataset.yaml nao encontrado em: {dataset_yaml}")

    try:
        with dataset_yaml.open("r", encoding="utf-8") as file:
            data = yaml.safe_load(file) or {}
    except Exception as exc:
        fail(f"nao foi possivel ler o dataset.yaml: {exc}")

    return data


def validate_dataset(dataset_yaml: Path) -> None:
    data = load_dataset_config(dataset_yaml)
    dataset_root = resolve_path(data.get("path", dataset_yaml.parent))
    train_path = dataset_root / data.get("train", "images/train")
    val_path = dataset_root / data.get("val", "images/valid")
    names = data.get("names")

    print(f"[DatasetTrainer] Dataset: {dataset_yaml}")
    print(f"[DatasetTrainer] Imagens de treino: {train_path}")
    print(f"[DatasetTrainer] Imagens de validacao: {val_path}")

    if not train_path.exists():
        fail(f"pasta de treino nao encontrada: {train_path}")

    if not val_path.exists():
        fail(f"pasta de validacao nao encontrada: {val_path}")

    if not names:
        fail("nenhuma classe encontrada em dataset.yaml > names")

    train_images = [
        item for item in train_path.iterdir()
        if item.suffix.lower() in {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
    ]
    val_images = [
        item for item in val_path.iterdir()
        if item.suffix.lower() in {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
    ]

    if not train_images:
        fail(f"nenhuma imagem encontrada em: {train_path}")

    if not val_images:
        fail(f"nenhuma imagem encontrada em: {val_path}")

    print(f"[DatasetTrainer] Total treino: {len(train_images)} imagem(ns)")
    print(f"[DatasetTrainer] Total validacao: {len(val_images)} imagem(ns)")
    print(f"[DatasetTrainer] Classes: {names}")


def get_device(preferred_device: str):
    if preferred_device != "auto":
        return preferred_device

    try:
        import torch

        return 0 if torch.cuda.is_available() else "cpu"
    except Exception:
        return "cpu"


def train_model(args: argparse.Namespace) -> None:
    try:
        from ultralytics import YOLO
    except ImportError:
        fail("biblioteca ultralytics nao encontrada dentro do executavel/ambiente.")

    dataset_yaml = resolve_path(args.config)
    weights_path = resolve_path(args.weights)
    output_path = resolve_path(args.output)
    runs_dir = resolve_path(args.runs_dir)
    device = get_device(args.device)

    validate_dataset(dataset_yaml)

    if weights_path.exists():
        model_source = str(weights_path)
    else:
        model_source = args.weights
        print(f"[DatasetTrainer] Pesos locais nao encontrados: {weights_path}")
        print("[DatasetTrainer] O Ultralytics tentara resolver/baixar os pesos pelo nome informado.")

    print("\n" + "=" * 60)
    print(" SmartCam Monitor - Treinamento por Dataset")
    print("=" * 60)
    print(f"[DatasetTrainer] Modelo base: {model_source}")
    print(f"[DatasetTrainer] Epochs: {args.epochs}")
    print(f"[DatasetTrainer] Batch: {args.batch}")
    print(f"[DatasetTrainer] Imagem: {args.imgsz}")
    print(f"[DatasetTrainer] Device: {device}")
    print(f"[DatasetTrainer] Runs: {runs_dir}")

    model = YOLO(model_source)
    model.train(
        data=str(dataset_yaml),
        epochs=args.epochs,
        batch=args.batch,
        imgsz=args.imgsz,
        device=device,
        project=str(runs_dir),
        name=args.name,
        workers=args.workers,
        exist_ok=True,
    )

    print("\n[DatasetTrainer] Treinamento concluido. Exportando ONNX...")
    exported_path = Path(model.export(format="onnx", imgsz=args.imgsz))

    output_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy(exported_path, output_path)

    print(f"[DatasetTrainer] Modelo exportado: {output_path}")
    print("[DatasetTrainer] Finalizado com sucesso.")

    if not args.no_pause:
        input("\nPressione ENTER para sair...")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Treina YOLO usando as imagens em ai-engine/datasets.")
    parser.add_argument("--config", default=str(DEFAULT_DATASET), help="Caminho do dataset.yaml")
    parser.add_argument("--weights", default=str(DEFAULT_WEIGHTS), help="Pesos base .pt ou nome do modelo")
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT), help="Destino do modelo ONNX exportado")
    parser.add_argument("--runs-dir", default=str(SCRIPT_DIR.parent / "runs"), help="Pasta para logs/resultados")
    parser.add_argument("--name", default="dataset_train", help="Nome da execucao dentro da pasta runs")
    parser.add_argument("--epochs", type=int, default=50, help="Quantidade de epocas")
    parser.add_argument("--batch", type=int, default=8, help="Tamanho do batch")
    parser.add_argument("--imgsz", type=int, default=640, help="Tamanho da imagem")
    parser.add_argument("--workers", type=int, default=2, help="Workers do dataloader")
    parser.add_argument("--device", default="auto", help="auto, cpu, 0, 1, etc.")
    parser.add_argument("--no-pause", action="store_true", help="Nao pausar ao finalizar")
    return parser.parse_args()


if __name__ == "__main__":
    train_model(parse_args())

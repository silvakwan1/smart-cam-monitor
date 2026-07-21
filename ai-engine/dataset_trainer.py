import argparse
import os
import shutil
import sys
from pathlib import Path

import yaml


SCRIPT_DIR = Path(__file__).resolve().parent

def get_base_dir() -> Path:
    if getattr(sys, 'frozen', False):
        # 1. Try sys.executable
        exe_dir = Path(sys.executable).resolve().parent
        if (exe_dir / "datasets").exists() or (exe_dir.parent / "datasets").exists():
            if exe_dir.name == 'dist':
                return exe_dir.parent
            return exe_dir

        # 2. Try sys.argv[0]
        if sys.argv and sys.argv[0]:
            argv_dir = Path(sys.argv[0]).resolve().parent
            if (argv_dir / "datasets").exists() or (argv_dir.parent / "datasets").exists():
                if argv_dir.name == 'dist':
                    return argv_dir.parent
                return argv_dir

        # 3. Fallback to current working directory
        cwd_dir = Path.cwd()
        if (cwd_dir / "datasets").exists() or (cwd_dir.parent / "datasets").exists():
            if cwd_dir.name == 'dist':
                return cwd_dir.parent
            return cwd_dir

        # Default fallback
        if exe_dir.name == 'dist':
            return exe_dir.parent
        return exe_dir
    else:
        return SCRIPT_DIR

DEFAULT_DATASET = get_base_dir() / "datasets" / "dataset.yaml"
DEFAULT_WEIGHTS = get_base_dir() / "weights" / "yolo11n.pt"
DEFAULT_OUTPUT = get_base_dir() / "weights" / "custom_dataset.onnx"


def resolve_path(value: str | Path) -> Path:
    path = Path(value)
    return path if path.is_absolute() else get_base_dir() / path


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


def normalize_dataset_classes(yaml_path: Path) -> None:
    if not yaml_path.exists():
        return
        
    try:
        with yaml_path.open("r", encoding="utf-8") as file:
            data = yaml.safe_load(file) or {}
    except Exception as exc:
        print(f"[DatasetTrainer] Nao foi possivel ler o dataset.yaml para normalizacao: {exc}")
        return

    names = data.get("names")
    if not names:
        return

    # Check if names keys are already sequential integers from 0 to len(names)-1
    try:
        keys = sorted([int(k) for k in names.keys()])
        is_sequential = all(keys[i] == i for i in range(len(keys)))
    except Exception as exc:
        print(f"[DatasetTrainer] Erro ao analisar as chaves das classes: {exc}")
        return
    
    if is_sequential:
        print("[DatasetTrainer] Indices das classes ja estao sequenciais.")
        return

    print("[DatasetTrainer] Indices nao sequenciais detectados. Iniciando normalizacao...")
    # Create mapping: old_id -> new_id
    id_map = {old_id: new_id for new_id, old_id in enumerate(keys)}
    
    # Create new names dict
    new_names = {new_id: names[old_id] for old_id, new_id in id_map.items()}
    
    # Update yaml data
    data["names"] = new_names
    
    # Resolve paths
    dataset_root = yaml_path.parent
    if "path" in data:
        p = Path(data["path"])
        if p.is_absolute():
            dataset_root = p
        else:
            dataset_root = (yaml_path.parent / p).resolve()
            
    train_label_dir = dataset_root / "labels" / "train"
    val_label_dir = dataset_root / "labels" / "valid"
    
    # Helper to rewrite labels in a directory
    def update_labels_in_dir(label_dir: Path):
        if not label_dir.exists():
            return
        for txt_file in label_dir.glob("*.txt"):
            try:
                lines = txt_file.read_text(encoding="utf-8").splitlines()
                updated_lines = []
                changed = False
                for line in lines:
                    parts = line.strip().split()
                    if parts:
                        try:
                            old_cid = int(parts[0])
                            if old_cid in id_map:
                                new_cid = id_map[old_cid]
                                if old_cid != new_cid:
                                    parts[0] = str(new_cid)
                                    changed = True
                            updated_lines.append(" ".join(parts))
                        except ValueError:
                            updated_lines.append(line)
                    else:
                        updated_lines.append(line)
                if changed:
                    txt_file.write_text("\n".join(updated_lines) + "\n", encoding="utf-8")
            except Exception as e:
                print(f"[DatasetTrainer] Erro ao atualizar arquivo de label {txt_file.name}: {e}")

    # Update labels
    update_labels_in_dir(train_label_dir)
    update_labels_in_dir(val_label_dir)

    # Save updated yaml
    try:
        with yaml_path.open("w", encoding="utf-8") as file:
            yaml.safe_dump(data, file, default_flow_style=False)
        print(f"[DatasetTrainer] dataset.yaml e labels normalizados com sucesso. Novas classes: {new_names}")
    except Exception as e:
        print(f"[DatasetTrainer] Erro ao salvar dataset.yaml atualizado: {e}")


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
        # pyrefly: ignore [missing-import]
        import torch

        return 0 if torch.cuda.is_available() else "cpu"
    except Exception:
        return "cpu"


def train_model(args: argparse.Namespace) -> None:
    try:
        # pyrefly: ignore [missing-import]
        from ultralytics import YOLO
    except ImportError as e:
        import traceback
        traceback.print_exc()
        fail(f"biblioteca ultralytics nao encontrada dentro do executavel/ambiente. Detalhes: {e}")

    dataset_yaml = resolve_path(args.config)
    weights_path = resolve_path(args.weights)
    output_path = resolve_path(args.output)
    runs_dir = resolve_path(args.runs_dir)
    device = get_device(args.device)

    # Normalize dataset class IDs before training
    normalize_dataset_classes(dataset_yaml)

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
    parser.add_argument("--runs-dir", default=str(get_base_dir().parent / "runs"), help="Pasta para logs/resultados")
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

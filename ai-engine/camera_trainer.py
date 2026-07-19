import os
import sys
import cv2
import time
import json
import yaml
import shutil
import argparse
import threading

# Add current directory to path
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.append(SCRIPT_DIR)

HANDLE_SIZE = 12
MIN_BOX_FRAC = 0.05

def parse_camera_source(source):
    """OpenCV accepts either numeric indexes or stream URLs/paths."""
    source_text = str(source).strip()
    return int(source_text) if source_text.isdigit() else source_text

def clamp(value, minimum, maximum):
    return max(minimum, min(maximum, value))

def normalize_box(box):
    x = clamp(box['x'], 0.0, 1.0 - MIN_BOX_FRAC)
    y = clamp(box['y'], 0.0, 1.0 - MIN_BOX_FRAC)
    w = clamp(box['w'], MIN_BOX_FRAC, 1.0 - x)
    h = clamp(box['h'], MIN_BOX_FRAC, 1.0 - y)
    return {'x': x, 'y': y, 'w': w, 'h': h}

def box_to_pixels(box, width, height):
    x1 = int(box['x'] * width)
    y1 = int(box['y'] * height)
    x2 = int((box['x'] + box['w']) * width)
    y2 = int((box['y'] + box['h']) * height)
    return x1, y1, x2, y2

def yolo_label_from_box(class_id, box):
    x_center = box['x'] + box['w'] / 2
    y_center = box['y'] + box['h'] / 2
    return f"{class_id} {x_center:.6f} {y_center:.6f} {box['w']:.6f} {box['h']:.6f}\n"

def make_selection_state():
    return {
        'box': {'x': 0.3, 'y': 0.25, 'w': 0.4, 'h': 0.5},
        'drag_mode': None,
        'drag_anchor': None,
        'start_box': None,
        'frame_size': (640, 480)
    }

def get_drag_mode(px, py, box, width, height):
    x1, y1, x2, y2 = box_to_pixels(box, width, height)
    handles = {
        'nw': (x1, y1),
        'ne': (x2, y1),
        'sw': (x1, y2),
        'se': (x2, y2)
    }
    for mode, (hx, hy) in handles.items():
        if abs(px - hx) <= HANDLE_SIZE and abs(py - hy) <= HANDLE_SIZE:
            return mode
    if x1 <= px <= x2 and y1 <= py <= y2:
        return 'move'
    return None

def update_selection_from_drag(state, px, py):
    width, height = state['frame_size']
    anchor_x, anchor_y = state['drag_anchor']
    start_box = state['start_box']
    dx = (px - anchor_x) / width
    dy = (py - anchor_y) / height
    mode = state['drag_mode']

    new_box = dict(start_box)
    if mode == 'move':
        new_box['x'] = start_box['x'] + dx
        new_box['y'] = start_box['y'] + dy
    else:
        left = start_box['x']
        top = start_box['y']
        right = start_box['x'] + start_box['w']
        bottom = start_box['y'] + start_box['h']

        if 'w' in mode:
            left = clamp(start_box['x'] + dx, 0.0, right - MIN_BOX_FRAC)
        if 'e' in mode:
            right = clamp(right + dx, left + MIN_BOX_FRAC, 1.0)
        if 'n' in mode:
            top = clamp(start_box['y'] + dy, 0.0, bottom - MIN_BOX_FRAC)
        if 's' in mode:
            bottom = clamp(bottom + dy, top + MIN_BOX_FRAC, 1.0)

        new_box = {'x': left, 'y': top, 'w': right - left, 'h': bottom - top}

    state['box'] = normalize_box(new_box)

def make_mouse_callback(state):
    def on_mouse(event, x, y, flags, param):
        width, height = state['frame_size']
        if event == cv2.EVENT_LBUTTONDOWN:
            mode = get_drag_mode(x, y, state['box'], width, height)
            if mode:
                state['drag_mode'] = mode
                state['drag_anchor'] = (x, y)
                state['start_box'] = dict(state['box'])
        elif event == cv2.EVENT_MOUSEMOVE and state['drag_mode']:
            update_selection_from_drag(state, x, y)
        elif event == cv2.EVENT_LBUTTONUP:
            state['drag_mode'] = None
            state['drag_anchor'] = None
            state['start_box'] = None

    return on_mouse

def draw_selection(frame, box, class_name):
    H, W, _ = frame.shape
    x1, y1, x2, y2 = box_to_pixels(box, W, H)
    color = (196, 52, 163)
    fill = frame.copy()

    cv2.rectangle(fill, (x1, y1), (x2, y2), color, -1)
    cv2.addWeighted(fill, 0.14, frame, 0.86, 0, frame)
    cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)

    for hx, hy in [(x1, y1), (x2, y1), (x1, y2), (x2, y2)]:
        cv2.rectangle(
            frame,
            (hx - HANDLE_SIZE // 2, hy - HANDLE_SIZE // 2),
            (hx + HANDLE_SIZE // 2, hy + HANDLE_SIZE // 2),
            (255, 255, 255),
            -1
        )
        cv2.rectangle(
            frame,
            (hx - HANDLE_SIZE // 2, hy - HANDLE_SIZE // 2),
            (hx + HANDLE_SIZE // 2, hy + HANDLE_SIZE // 2),
            color,
            1
        )

    label_y = y1 - 10 if y1 - 10 > 16 else y2 + 22
    cv2.putText(frame, f"Alvo: {class_name.upper()}", (x1, label_y),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1, cv2.LINE_AA)

def load_settings():
    """Load settings from Electron's AppData path to know where to save the ONNX file."""
    app_data = os.getenv('APPDATA')
    if not app_data:
        return None
    settings_path = os.path.join(app_data, 'smart-cam-monitor', 'settings.json')
    if os.path.exists(settings_path):
        try:
            with open(settings_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"[Collector] Erro ao ler settings.json: {e}")
    return None

def update_dataset_yaml(yaml_path, class_name):
    """Updates dataset.yaml with the new class if it doesn't exist, and returns the class ID."""
    if not os.path.exists(yaml_path):
        # Create a default dataset.yaml if missing
        default_data = {
            'path': '../datasets',
            'train': 'images/train',
            'val': 'images/valid',
            'names': {0: 'person'}
        }
        with open(yaml_path, 'w', encoding='utf-8') as f:
            yaml.safe_dump(default_data, f, default_flow_style=False)
            
    with open(yaml_path, 'r', encoding='utf-8') as f:
        try:
            data = yaml.safe_load(f) or {}
        except Exception:
            data = {}

    if 'names' not in data or not data['names']:
        data['names'] = {}
        
    names = data['names']
    
    # Check if names is a list (rare but possible in yaml parsing)
    if isinstance(names, list):
        names_dict = {i: name for i, name in enumerate(names)}
        data['names'] = names_dict
        names = names_dict

    class_name_lower = class_name.lower().strip()
    class_id = None
    
    # Try to find class
    for cid, name in names.items():
        if str(name).lower().strip() == class_name_lower:
            class_id = int(cid)
            break
            
    if class_id is None:
        # Add new class index
        existing_ids = [int(k) for k in names.keys()]
        class_id = max(existing_ids) + 1 if existing_ids else 0
        names[class_id] = class_name_lower
        
        # Make sure train and val path definitions are absolute/correct
        data['path'] = os.path.join(SCRIPT_DIR, 'datasets').replace('\\', '/')
        data['train'] = 'images/train'
        data['val'] = 'images/valid'
        
        with open(yaml_path, 'w', encoding='utf-8') as f:
            yaml.safe_dump(data, f, default_flow_style=False)
        print(f"[Collector] Nova classe adicionada no dataset.yaml: '{class_name_lower}' com ID: {class_id}")
    else:
        print(f"[Collector] Classe existente selecionada: '{class_name_lower}' com ID: {class_id}")
        
    return class_id

def run_training(yaml_path, electron_onnx_dest):
    """Triggers the training run in a separate execution block."""
    try:
        from ultralytics import YOLO
        import torch
    except ImportError:
        print("\n[Erro] Bibliotecas 'ultralytics' ou 'torch' não encontradas!")
        print("Instale usando: pip install ultralytics torch")
        return

    print("\n" + "="*50)
    print("      INICIANDO TREINAMENTO CUSTOMIZADO YOLO")
    print("="*50)
    
    device = 0 if torch.cuda.is_available() else 'cpu'
    print(f"[*] Dispositivo de hardware selecionado: {device.upper() if isinstance(device, str) else 'GPU CUDA (0)'}")
    
    # Load base weights
    base_weights = os.path.join(SCRIPT_DIR, "weights", "yolo11n.pt")
    if not os.path.exists(base_weights):
        # Fallback to yolov8n if v11 not locally downloaded, or ultralytics downloads it
        print(f"[*] Pesos base não encontrados em {base_weights}. Ultralytics baixará automaticamente.")
        base_weights = "yolo11n.pt"
        
    try:
        model = YOLO(base_weights)
        print("[*] Iniciando fine-tuning por 15 epochs...")
        
        # Train
        results = model.train(
            data=yaml_path,
            epochs=15,
            batch=8,
            imgsz=640,
            device=device,
            workers=2 if device == 'cpu' else 4
        )
        
        print("\n[*] Treinamento Concluído com Sucesso!")
        print("[*] Exportando modelo customizado para formato ONNX...")
        
        # Export
        onnx_path = model.export(format="onnx", imgsz=640)
        print(f"[*] Modelo ONNX gerado em: {onnx_path}")
        
        if electron_onnx_dest:
            print(f"[*] Copiando modelo treinado para o diretório ativo do Electron: {electron_onnx_dest}")
            os.makedirs(os.path.dirname(electron_onnx_dest), exist_ok=True)
            shutil.copy(onnx_path, electron_onnx_dest)
            print("[*] Sucesso! Seu aplicativo Electron já está rodando a nova inteligência!")
            
    except Exception as e:
        print(f"\n[Erro] Falha durante o ciclo de treinamento: {e}")
        
    print("="*50 + "\n")

def main():
    parser = argparse.ArgumentParser(description="Coletor de Imagens e Treinador da Camera")
    parser.add_argument("--cam", default="0", help="Index da camera fisica, URL ou caminho de video (default: 0)")
    parser.add_argument("--class-name", default="", help="Nome da classe/objeto que deseja treinar")
    args = parser.parse_args()

    print("="*60)
    print("  SmartCam Monitor - Assistente de Captura e Treino da IA")
    print("="*60)
    
    # Create dataset directories
    datasets_base = os.path.join(SCRIPT_DIR, "datasets")
    train_images = os.path.join(datasets_base, "images", "train")
    valid_images = os.path.join(datasets_base, "images", "valid")
    train_labels = os.path.join(datasets_base, "labels", "train")
    valid_labels = os.path.join(datasets_base, "labels", "valid")
    
    for folder in [train_images, valid_images, train_labels, valid_labels]:
        os.makedirs(folder, exist_ok=True)

    # Ask user for class name
    class_name = args.class_name.strip()
    if not class_name:
        class_name = input("\nDigite o nome da classe/objeto que deseja treinar (Ex: rosto, caneta, copo): ").strip()
    if not class_name:
        print("[Erro] Nome da classe inválido!")
        return
        
    yaml_path = os.path.join(datasets_base, "dataset.yaml")
    class_id = update_dataset_yaml(yaml_path, class_name)
    
    # Load Electron settings to copy the model over after training
    settings = load_settings()
    electron_onnx_dest = settings.get('modelPath') if settings else None
    if electron_onnx_dest:
        print(f"[Collector] Destino automático do modelo configurado: {electron_onnx_dest}")
    else:
        print("[Collector] Destino do Electron não detectado. O modelo será salvo apenas no projeto.")

    # Open camera stream
    camera_source = parse_camera_source(args.cam)
    print(f"\n[*] Abrindo feed de video da camera {args.cam}...")
    cap = cv2.VideoCapture(camera_source)
    if not cap.isOpened():
        print(f"[Erro] Não foi possível abrir a câmera com origem {args.cam}.")
        print("Dica: tente mudar o index passando o argumento --cam (ex: python camera_trainer.py --cam 1)")
        return
        
    # Setup window properties
    window_name = "SmartCam Collector & Trainer"
    cv2.namedWindow(window_name, cv2.WINDOW_NORMAL)
    cv2.resizeWindow(window_name, 800, 600)
    selection = make_selection_state()
    cv2.setMouseCallback(window_name, make_mouse_callback(selection))
    
    capture_count = 0
    flash_frames = 0
    
    print("\nInstruções:")
    print("  - Arraste o retangulo roxo para selecionar onde esta o objeto.")
    print("  - Arraste os cantos brancos para redimensionar a area.")
    print("  - Pressione a tecla [R] para recentralizar o retangulo.")
    print("  - Pressione a tecla [C] ou [ESPAÇO] para capturar e rotular o frame.")
    print("  - Pressione a tecla [T] para fechar a câmera e iniciar o treinamento.")
    print("  - Pressione a tecla [Q] ou [ESC] para sair sem treinar.")
    
    while True:
        ret, frame = cap.read()
        if not ret:
            print("[Erro] Falha ao ler frame da câmera.")
            break
            
        clean_frame = frame.copy() # Make a clean copy before drawing!
        H, W, _ = frame.shape
        selection['frame_size'] = (W, H)
        selection['box'] = normalize_box(selection['box'])

        draw_selection(frame, selection['box'], class_name)
        
        # Overlay UI controls panel at bottom (transparent glassmorphism feel)
        overlay = frame.copy()
        cv2.rectangle(overlay, (0, H - 70), (W, H), (20, 20, 20), -1)
        cv2.addWeighted(overlay, 0.6, frame, 0.4, 0, frame)
        
        # Text instructions
        cv2.putText(frame, f"[C]/[Space]: Capturar ({capture_count} salvos) | [T]: Iniciar Treino | [Q]: Sair", 
                    (15, H - 40), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (240, 240, 240), 1, cv2.LINE_AA)
        cv2.putText(frame, "Arraste o retangulo ou seus cantos para ajustar a area do objeto", 
                    (15, H - 15), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (150, 150, 150), 1, cv2.LINE_AA)
        
        # Screen flash effect on capture
        if flash_frames > 0:
            flash_overlay = frame.copy()
            cv2.rectangle(flash_overlay, (0, 0), (W, H), (0, 255, 0), -1)
            cv2.addWeighted(flash_overlay, 0.35, frame, 0.65, 0, frame)
            cv2.putText(frame, "CAPTURADO!", (int(W/2) - 80, int(H/2)), 
                        cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 255, 0), 2, cv2.LINE_AA)
            flash_frames -= 1
            
        cv2.imshow(window_name, frame)
        
        key = cv2.waitKey(1) & 0xFF
        if key == ord('q') or key == 27: # 'q' or ESC
            print("[*] Coleta cancelada pelo usuário.")
            break
        elif key == ord('c') or key == ord(' '): # 'c' or SPACE
            # Capture
            timestamp = int(time.time() * 1000)
            img_name = f"captured_{class_name}_{timestamp}.jpg"
            lbl_name = f"captured_{class_name}_{timestamp}.txt"
            
            # YOLO label structure: <class_id> <x_center> <y_center> <width> <height>
            label_content = yolo_label_from_box(class_id, selection['box'])
            
            # Save to train
            cv2.imwrite(os.path.join(train_images, img_name), clean_frame) # save clean frame
            with open(os.path.join(train_labels, lbl_name), "w") as lf:
                lf.write(label_content)
                
            # Save to valid (validation set is required by YOLO. We copy 1-to-1 to keep it easy)
            cv2.imwrite(os.path.join(valid_images, img_name), clean_frame)
            with open(os.path.join(valid_labels, lbl_name), "w") as lf:
                lf.write(label_content)
                
            capture_count += 1
            flash_frames = 6
            print(f"[Collector] Capturado frame {capture_count} para a classe '{class_name}'")

        elif key == ord('r'): # reset selection
            selection['box'] = {'x': 0.3, 'y': 0.25, 'w': 0.4, 'h': 0.5}
            
        elif key == ord('t'): # 't' to train
            if capture_count < 5:
                print(f"[Aviso] Por favor, capture pelo menos 5 imagens antes de treinar (Atuais: {capture_count}).")
                continue
            
            print(f"\n[*] Finalizando captura. Total de imagens salvas: {capture_count}.")
            cap.release()
            cv2.destroyAllWindows()
            
            # Run training in main thread
            run_training(yaml_path, electron_onnx_dest)
            return

    cap.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    main()

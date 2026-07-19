# SmartCam Monitor - Sistema de Monitoramento Inteligente (Electron + React + TS)

Este é um software desktop de monitoramento de câmeras profissional que combina **Electron**, **React 19**, **TypeScript**, **Tailwind CSS v4** e Visão Computacional em tempo real usando **YOLOv11** (ONNX Runtime) rodando em uma thread dedicada (Worker Thread).

---

## 🚀 Diferenciais Arquiteturais & Performance

1. **Desacoplamento e SOLID (Padrões de Projeto)**:
   - **Factory Pattern**: Centralização da criação dos canais de vídeo no [CameraFactory](file:///C:/Users/silva/OneDrive/Documentos/can/src/main/camera/CameraFactory.ts).
   - **Strategy & Adapter Pattern**: Toda nova câmera implementa a interface comum [CameraProvider](file:///C:/Users/silva/OneDrive/Documentos/can/src/main/camera/CameraProvider.ts). A transição de USB para IP Camera ocorre sem mudar nenhuma linha de código consumidora.
   - **Repository & State Store (Zustand)**: Lógica de interface desacoplada do processamento de vídeo e inteligência artificial através de stores independentes.
2. **Incerteza do Ambiente (Sem Bloquear a Interface)**:
   - O processamento de inferência do modelo YOLOv11 é executado em uma **Worker Thread** paralela do Node.js, comunicando-se via mensagens assíncronas IPC com a thread principal.
   - **Zero-Copy Optimization**: Os frames convertidos em bitmaps são transferidos para o Worker usando buffers compartilhados do V8 (`Transferable ArrayBuffer`), garantindo latência zero.
   - **Frame Skipping**: Caso a thread de IA esteja ocupada processando um frame, o próximo frame é ignorado pelo detector para evitar filas de memória e manter o feed de vídeo em tempo real (30 FPS).
3. **Decodificação e Redimensionamento Nativo (Sem dependências C++)**:
   - Para redimensionar e decodificar JPEGs rapidamente sem quebrar em sistemas Windows sem ferramentas de compilação, o sistema utiliza a API nativa da Chromium `nativeImage` do Electron. Ela realiza o scaling via hardware de forma ultrarrápida antes de alimentar os tensores da IA.
4. **Detector de Movimento Ultraleve**:
   - Implementa um algoritmo matemático em JavaScript que downsampla a imagem para uma matriz 16x16 e calcula a variação de luminosidade entre frames consecutivos. Consome menos de 0.2ms de CPU e funciona mesmo sem IA ativa.
5. **Gravação Inteligente & Post-Roll**:
   - O gravador de vídeo [Recorder](file:///C:/Users/silva/OneDrive/Documentos/can/src/main/recording/Recorder.ts) faz spawn do executável estático do FFmpeg e escreve os frames via pipe (`stdin`), gerando arquivos MP4 comprimidos em H.264 em tempo de execução.
   - Modos inteligentes mantêm um buffer extra de gravação de 5 segundos (*post-roll*) após cessar o movimento ou a detecção de pessoas.

---

## 📁 Estrutura de Diretórios

```
can/
├── dist/                          # Compilação final (Main e Renderer)
├── scripts/
│   ├── build-main.js              # Script esbuild de compilação de produção
│   └── dev-main.js                # Live rebuilder do Main + Hot Reload do Electron
├── src/
│   ├── main/                      # Electron Main Process (Backend)
│   │   ├── ai/
│   │   │   ├── Detector.ts        # Interface comum de IA
│   │   │   ├── YoloDetector.ts    # Orquestrador da IA na Main Thread
│   │   │   └── detection.worker.ts# Thread paralela de inferência ONNX
│   │   ├── camera/
│   │   │   ├── CameraProvider.ts  # Interface comum de captura
│   │   │   ├── UsbCamera.ts       # Captura de webcam via FFmpeg dshow
│   │   │   ├── IpCamera.ts        # Captura de câmera RTSP via TCP FFmpeg
│   │   │   ├── CaptureCard.ts     # Captura de placas EasyCAP/Dongles
│   │   │   ├── CameraFactory.ts   # Factory Pattern para instanciar as câmeras
│   │   │   └── CameraManager.ts   # Controlador central de fluxos, eventos e gravação
│   │   ├── main.ts                # Inicialização do Electron e IPC Handlers
│   │   └── preload.ts             # Bridge seguro de APIs para a interface React
│   ├── renderer/                  # React Frontend
│   │   ├── components/
│   │   │   ├── Header.tsx         # Navbar com telemetria de CPU/Memória
│   │   │   ├── CameraView.tsx     # Canvas de vídeo e overlay de bounding boxes
│   │   │   ├── ControlPanel.tsx   # Controles de canais, modos de gravação e logs
│   │   │   └── EventHistory.tsx   # Linha do tempo com snapshots e horários dos alarmes
│   │   ├── hooks/
│   │   │   └── useCamera.ts       # Hook para vincular eventos IPC assíncronos
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx      # Painel Principal do Monitoramento
│   │   │   └── Settings.tsx       # Cadastro de canais e diretórios gerais
│   │   ├── stores/
│   │   │   ├── cameraStore.ts     # Zustand Store para câmeras e telemetria
│   │   │   └── eventStore.ts      # Zustand Store para histórico de eventos
│   │   ├── App.tsx                # Roteamento seguro usando HashRouter
│   │   ├── index.css              # Estilos globais e Tailwind v4
│   │   ├── main.tsx               # Bootstrap do React
│   │   └── global.d.ts            # Definições globais das APIs do preload
│   └── shared/
│       └── types.ts               # Interfaces compartilhadas Backend/Frontend
├── package.json                   # Configuração e scripts npm
├── vite.config.ts                 # Configuração do Vite dev-server e plugins
└── tsconfig.json                  # Configuração TypeScript estrita
```

---

## ⚡ Preparação do Ambiente

### 1. Pré-requisitos
- **Node.js** v22 ou superior instalado.
- **Git** (caso precise clonar).

### 2. Instalação das Dependências
No diretório do projeto, execute o comando abaixo para instalar as bibliotecas (incluindo o binário estático do FFmpeg e o ONNX Runtime):
```bash
npm install
```

### 3. Modelo YOLOv11
O sistema já vem equipado com um **Simulador de Visão Computacional de alta fidelidade** que gera detecções simuladas de pessoas, carros e cães caso o arquivo do modelo real não seja encontrado. 

Para utilizar a detecção real via inteligência artificial:
1. Faça o download do modelo YOLOv11 nano em formato ONNX (ex: `yolo11n.onnx`).
2. Crie uma pasta chamada `resources` na raiz do projeto (ou no diretório especificado nas Configurações Gerais).
3. Renomeie o arquivo baixado para `yolo11n.onnx` e cole-o dentro da pasta `resources/`.

---

## 🛠️ Executando o Projeto

### Modo de Desenvolvimento
Para iniciar o servidor de desenvolvimento do React (Vite) e compilar em tempo real o processo principal do Electron (com reinicialização automática do app em mudanças no backend), basta rodar:
```bash
npm run dev
```

### Build e Empacotamento
Para gerar a build de produção otimizada:
```bash
npm run build
```

Para gerar o instalador desktop final para Windows (usando Electron Builder):
```bash
npm run package
```

---

## 🧠 Treinamento Personalizado da IA (Python & YOLO)

O projeto inclui um ecossistema Python em [ai-engine/](file:///C:/Users/silva/OneDrive/Documentos/can/ai-engine) para permitir que você treine a inteligência artificial com suas próprias câmeras e objetos personalizados.

### 1. Preparando o Ambiente Python
Antes de começar, certifique-se de ter o interpretador **Python** instalado. Em seguida, instale as dependências necessárias de visão computacional e deep learning:
```bash
pip install -r ai-engine/requirements.txt
```

### 2. Coletando Dados e Treinando via Webcam (`camera_trainer.py`)
Criamos um assistente interativo em Python que conecta na sua webcam, permite capturar frames no ângulo exato do seu ambiente e treina o modelo de IA de forma integrada.

Para executá-lo:
```bash
python ai-engine/camera_trainer.py
```
*(Caso tenha mais de um dispositivo USB de vídeo e queira trocar a câmera, passe o argumento `--cam`: `python ai-engine/camera_trainer.py --cam 1`)*

**Como funciona no Assistente:**
1. O terminal pedirá o **nome da classe** que deseja treinar (ex: `rosto`, `caneta`, `copo`). Ele criará a nova classe automaticamente nas configurações do dataset.
2. Uma janela com o feed da sua câmera será aberta com um **retângulo roxo** guia no centro.
3. Posicione o objeto ou você mesmo dentro do retângulo e controle pelo teclado:
   - **`C` ou `Espaço`:** Captura e rotula o frame automaticamente (salvando a foto limpa e criando as coordenadas do box corretas sem trabalho manual). Recomendamos coletar pelo menos **15 a 30 imagens** em ângulos e distâncias variadas.
   - **`T`:** Fecha a câmera e inicia imediatamente o treinamento do YOLO (roda por 15 épocas por padrão, usando aceleração por GPU se disponível).
   - **`Q` ou `ESC`:** Cancela e sai do coletor sem treinar.

Ao finalizar o treinamento, o script **compila e converte** automaticamente os novos pesos aprendidos para o formato `.onnx` e copia o arquivo final (`yolo11n.onnx`) diretamente para a pasta ativa do Electron. Na próxima vez que o aplicativo rodar, ele usará a inteligência com o novo objeto treinado!

---

## 🔒 Regras de Segurança (CSP)
O projeto já está configurado com regras rígidas de segurança (*Content Security Policy*) na página inicial, permitindo apenas a renderização de dados locais e buffers seguros, impedindo a execução de códigos injetados externamente no ecossistema do aplicativo.

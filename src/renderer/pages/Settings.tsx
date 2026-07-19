import React, { useEffect, useState } from 'react';
import { useCameraStore } from '../stores/cameraStore';
import { CameraConfig, CameraType } from '../../shared/types';
import { Plus, Trash2, Edit, Save, ToggleLeft, ToggleRight, FolderOpen, RefreshCw, Server, Cpu } from 'lucide-react';

export const Settings: React.FC = () => {
  const cameras = useCameraStore((state) => state.cameras);
  const fetchCameras = useCameraStore((state) => state.fetchCameras);
  const saveCamera = useCameraStore((state) => state.saveCamera);
  const removeCamera = useCameraStore((state) => state.removeCamera);

  // App Settings State
  const [appSettings, setAppSettings] = useState({
    modelPath: '',
    recordingsFolder: '',
    snapshotsFolder: '',
    enableGpu: false
  });
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Camera Form State
  const [editingCameraId, setEditingCameraId] = useState<string | null>(null);
  const [camId, setCamId] = useState('');
  const [camName, setCamName] = useState('');
  const [camType, setCamType] = useState<CameraType>('usb');
  const [camSource, setCamSource] = useState('0');
  const [camWidth, setCamWidth] = useState(640);
  const [camHeight, setCamHeight] = useState(480);
  const [camFps, setCamFps] = useState(30);
  const [camCrossbarPin, setCamCrossbarPin] = useState<number>(0);

  // System physical video input devices list
  const [systemDevices, setSystemDevices] = useState<string[]>([]);
  const [isLoadingDevices, setIsLoadingDevices] = useState(false);

  const fetchSystemDevices = async () => {
    setIsLoadingDevices(true);
    try {
      const devices = await window.electronAPI.listSystemDevices();
      setSystemDevices(devices);
      // Auto-select first device if we are initiating form
      if (devices.length > 0 && (camSource === '0' || !camSource)) {
        setCamSource(devices[0]);
      }
    } catch (err) {
      console.error('Failed to list system multimedia devices:', err);
    } finally {
      setIsLoadingDevices(false);
    }
  };

  useEffect(() => {
    fetchCameras();
    fetchSystemDevices();
    // Load general settings from Electron main DB
    window.electronAPI.getSettings().then((settings) => {
      setAppSettings(settings);
    });
  }, [fetchCameras]);

  const resetForm = () => {
    setEditingCameraId(null);
    setCamId(`cam_${Date.now()}`);
    setCamName('');
    setCamType('usb');
    setCamSource(systemDevices.length > 0 ? systemDevices[0] : '0');
    setCamWidth(640);
    setCamHeight(480);
    setCamFps(30);
    setCamCrossbarPin(0);
  };

  const handleEdit = (cam: CameraConfig) => {
    setEditingCameraId(cam.id);
    setCamId(cam.id);
    setCamName(cam.name);
    setCamType(cam.type);
    setCamSource(cam.source);
    setCamWidth(cam.width);
    setCamHeight(cam.height);
    setCamFps(cam.fps);
    setCamCrossbarPin(cam.crossbarPin !== undefined ? cam.crossbarPin : 0);
  };

  const handleSaveCamera = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!camName || !camSource) return;

    const newConfig: CameraConfig = {
      id: camId,
      name: camName,
      type: camType,
      source: camSource,
      width: Number(camWidth),
      height: Number(camHeight),
      fps: Number(camFps),
      isActive: true,
      crossbarPin: (camType === 'capture_card' || camType === 'usb') ? Number(camCrossbarPin) : undefined
    };

    try {
      await saveCamera(newConfig);
      resetForm();
    } catch (err) {
      alert('Erro ao salvar câmera');
    }
  };

  const handleSaveAppSettings = async () => {
    setIsSavingSettings(true);
    try {
      const saved = await window.electronAPI.saveSettings(appSettings);
      setAppSettings(saved);
      alert('Configurações do sistema salvas com sucesso!');
    } catch (err) {
      console.error(err);
      alert('Falha ao gravar configurações');
    } finally {
      setIsSavingSettings(false);
    }
  };

  return (
    <div className="flex-1 p-6 space-y-6 overflow-y-auto">
      <div className="flex items-center space-x-2">
        <Cpu className="h-6 w-6 text-brand-primary" />
        <h2 className="text-xl font-bold tracking-tight">Painel de Configurações do Sistema</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Camera Listing */}
        <div className="lg:col-span-2 space-y-6">
          <div className="glass-panel rounded-2xl p-5 border border-slate-800 space-y-4 shadow-lg">
            <h3 className="text-sm font-semibold text-slate-200">
              Câmeras e Dispositivos de Captura
            </h3>

            {cameras.length === 0 ? (
              <div className="text-center py-8 bg-slate-900/30 border border-slate-800 rounded-xl">
                <p className="text-xs text-slate-500 font-medium">
                  Nenhum dispositivo registrado. Adicione um canal ao lado.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {cameras.map((cam) => (
                  <div
                    key={cam.id}
                    className="flex items-center justify-between p-4 bg-slate-900/60 border border-slate-800/80 rounded-xl hover:border-slate-700/80 transition-all"
                  >
                    <div className="flex flex-col space-y-1">
                      <span className="text-sm font-semibold text-slate-200">{cam.name}</span>
                      <div className="flex items-center space-x-2 text-xs font-mono text-slate-500">
                        <span className="uppercase text-brand-primary bg-brand-primary/10 px-1.5 py-0.5 rounded text-[10px] font-bold">
                          {cam.type}
                        </span>
                        <span>Source: {cam.source}</span>
                        <span>•</span>
                        <span>{cam.width}x{cam.height} @ {cam.fps} FPS</span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 shrink-0">
                      <button
                        onClick={() => handleEdit(cam)}
                        className="p-2 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white transition-all cursor-pointer"
                        title="Editar Configurações"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => removeCamera(cam.id)}
                        className="p-2 rounded-lg bg-rose-500/10 hover:bg-rose-550/20 text-rose-400 hover:text-rose-300 transition-all cursor-pointer"
                        title="Deletar Câmera"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* AI Settings Section */}
          <div className="glass-panel rounded-2xl p-5 border border-slate-800 space-y-5 shadow-lg">
            <h3 className="text-sm font-semibold text-slate-200">
              Módulo de Inteligência Artificial & Caminhos
            </h3>

            <div className="space-y-4">
              {/* Model File Input */}
              <div className="flex flex-col space-y-1.5">
                <label className="text-xs text-slate-400 font-medium">Caminho do Modelo YOLOv11 (.onnx)</label>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={appSettings.modelPath}
                    onChange={(e) => setAppSettings({ ...appSettings, modelPath: e.target.value })}
                    className="flex-1 bg-slate-900 border border-slate-850 rounded-xl px-3 py-2 text-xs font-mono text-slate-300 outline-none focus:border-brand-primary"
                    placeholder="Ex: C:\Users\user\models\yolo11n.onnx"
                  />
                </div>
                <p className="text-[10px] text-slate-500 font-medium">
                  Deixe o padrão caso o arquivo esteja na pasta base do app. O app entra em modo Simulação caso o arquivo não exista.
                </p>
              </div>

              {/* Recordings Folder Input */}
              <div className="flex flex-col space-y-1.5">
                <label className="text-xs text-slate-400 font-medium">Diretório de Gravações (MP4)</label>
                <input
                  type="text"
                  value={appSettings.recordingsFolder}
                  onChange={(e) => setAppSettings({ ...appSettings, recordingsFolder: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-850 rounded-xl px-3 py-2 text-xs font-mono text-slate-300 outline-none focus:border-brand-primary"
                />
              </div>

              {/* Snapshot Folder Input */}
              <div className="flex flex-col space-y-1.5">
                <label className="text-xs text-slate-400 font-medium">Diretório de Snapshots (JPEG)</label>
                <input
                  type="text"
                  value={appSettings.snapshotsFolder}
                  onChange={(e) => setAppSettings({ ...appSettings, snapshotsFolder: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-850 rounded-xl px-3 py-2 text-xs font-mono text-slate-300 outline-none focus:border-brand-primary"
                />
              </div>

              {/* GPU Toggle (Preparation for CUDA) */}
              <div className="flex items-center justify-between p-3.5 bg-slate-900/40 border border-slate-850 rounded-xl">
                <div className="flex flex-col space-y-0.5">
                  <span className="text-xs font-semibold text-slate-300">Aceleração por Hardware GPU (CUDA/ONNX)</span>
                  <span className="text-[10px] text-slate-500">Ativa a execução paralela em placas de vídeo compatíveis</span>
                </div>
                <button
                  type="button"
                  onClick={() => setAppSettings({ ...appSettings, enableGpu: !appSettings.enableGpu })}
                  className="text-slate-400 hover:text-white transition-all cursor-pointer"
                >
                  {appSettings.enableGpu ? (
                    <ToggleRight className="h-9 w-9 text-brand-primary" />
                  ) : (
                    <ToggleLeft className="h-9 w-9 text-slate-600" />
                  )}
                </button>
              </div>

              {/* Save General Settings Button */}
              <button
                onClick={handleSaveAppSettings}
                disabled={isSavingSettings}
                className="w-full flex items-center justify-center space-x-2 py-2.5 rounded-xl bg-gradient-to-r from-brand-primary to-brand-secondary hover:scale-[1.01] active:scale-[0.99] text-white text-xs font-semibold shadow-md transition-all cursor-pointer"
              >
                <Save className="h-4 w-4" />
                <span>Salvar Configurações Gerais</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Add/Edit Camera Form */}
        <div className="space-y-6">
          <div className="glass-panel rounded-2xl p-5 border border-slate-800 space-y-4 shadow-lg sticky top-6">
            <div className="flex justify-between items-center pb-2 border-b border-slate-800/80">
              <h3 className="text-sm font-semibold text-slate-200">
                {editingCameraId ? 'Editar Canal de Vídeo' : 'Registrar Novo Canal'}
              </h3>
              {editingCameraId && (
                <button
                  onClick={resetForm}
                  className="text-[10px] text-brand-primary hover:underline cursor-pointer"
                >
                  Resetar
                </button>
              )}
            </div>

            <form onSubmit={handleSaveCamera} className="space-y-4">
              {/* Camera Name */}
              <div className="flex flex-col space-y-1">
                <label className="text-xs text-slate-500 font-medium">Nome Identificador</label>
                <input
                  type="text"
                  required
                  value={camName}
                  onChange={(e) => setCamName(e.target.value)}
                  placeholder="Ex: Câmera Portaria"
                  className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 outline-none focus:border-brand-primary"
                />
              </div>

              {/* Camera Type */}
              <div className="flex flex-col space-y-1">
                <label className="text-xs text-slate-500 font-medium">Tipo do Dispositivo</label>
                <select
                  value={camType}
                  onChange={(e) => {
                    const type = e.target.value as CameraType;
                    setCamType(type);
                    // Autofill sources based on type choice
                    if (type === 'usb') {
                      setCamSource(systemDevices.length > 0 ? systemDevices[0] : '0');
                      setCamCrossbarPin(0);
                    } else if (type === 'ip') {
                      setCamSource('rtsp://192.168.1.100:554/stream1');
                    } else if (type === 'capture_card') {
                      setCamSource(systemDevices.length > 0 ? systemDevices[0] : 'OEM Device');
                      setCamCrossbarPin(0);
                    }
                  }}
                  className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-350 outline-none focus:border-brand-primary"
                >
                  <option value="usb">USB Webcam / Dispositivo USB</option>
                  <option value="ip">IP Camera (RTSP)</option>
                  <option value="capture_card">Placa de Captura Multi-Canal (Xtrad/EasyCAP)</option>
                </select>
              </div>

              {/* Source Path / Device Selector */}
              {camType !== 'ip' ? (
                <div className="flex flex-col space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-slate-500 font-medium">Dispositivo Físico Detectado</label>
                    <button
                      type="button"
                      onClick={fetchSystemDevices}
                      disabled={isLoadingDevices}
                      className="text-[10px] text-brand-primary flex items-center space-x-1 hover:underline cursor-pointer"
                    >
                      <RefreshCw className={`h-3 w-3 ${isLoadingDevices ? 'animate-spin' : ''}`} />
                      <span>Recarregar</span>
                    </button>
                  </div>
                  {systemDevices.length > 0 ? (
                    <select
                      value={camSource}
                      onChange={(e) => setCamSource(e.target.value)}
                      className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 outline-none focus:border-brand-primary"
                    >
                      {systemDevices.map((dev) => (
                        <option key={dev} value={dev}>
                          {dev}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="text-[11px] text-amber-500 font-medium py-1">
                      Nenhuma câmera física detectada pelo FFmpeg. Verifique conexões USB.
                    </div>
                  )}
                  {/* Manual entry fallback */}
                  <input
                    type="text"
                    required
                    value={camSource}
                    onChange={(e) => setCamSource(e.target.value)}
                    placeholder="Nome do dispositivo (Ex: Integrated Camera)"
                    className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-400 outline-none focus:border-brand-primary mt-1.5"
                  />
                </div>
              ) : (
                <div className="flex flex-col space-y-1">
                  <label className="text-xs text-slate-500 font-medium">Endereço da Câmera IP (RTSP)</label>
                  <input
                    type="text"
                    required
                    value={camSource}
                    onChange={(e) => setCamSource(e.target.value)}
                    placeholder="rtsp://usuario:senha@ip:porta/stream"
                    className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-300 outline-none focus:border-brand-primary"
                  />
                </div>
              )}

              {/* Crossbar Pin (RCA Channel selection for capture cards) */}
              {(camType === 'capture_card' || camType === 'usb') && (
                <div className="flex flex-col space-y-1 bg-slate-900/40 p-3.5 border border-slate-800/80 rounded-xl">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-slate-400 font-medium">Canal da Placa (Entrada RCA)</label>
                    <span className="text-[9px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-mono font-bold">XT2037 / EasyCAP</span>
                  </div>
                  <select
                    value={camCrossbarPin}
                    onChange={(e) => setCamCrossbarPin(Number(e.target.value))}
                    className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 outline-none focus:border-brand-primary mt-1.5"
                  >
                    <option value={0}>Canal 1 (Entrada RCA Amarela/Canal 1)</option>
                    <option value={1}>Canal 2 (Entrada RCA Canal 2)</option>
                    <option value={2}>Canal 3 (Entrada RCA Canal 3)</option>
                    <option value={3}>Canal 4 (Entrada RCA Canal 4)</option>
                  </select>
                  <p className="text-[9px] text-slate-500 mt-1 leading-tight">
                    Placas USB de 4 canais possuem uma única controladora de vídeo, mas roteiam canais diferentes por pinos de entrada cruzados (crossbar).
                  </p>
                </div>
              )}

              {/* Resolutions Selection */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col space-y-1">
                  <label className="text-xs text-slate-500 font-medium">Largura (W)</label>
                  <select
                    value={camWidth}
                    onChange={(e) => setCamWidth(Number(e.target.value))}
                    className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 outline-none focus:border-brand-primary"
                  >
                    <option value={640}>640 px</option>
                    <option value={1280}>1280 (720p)</option>
                    <option value={1920}>1920 (1080p)</option>
                  </select>
                </div>
                <div className="flex flex-col space-y-1">
                  <label className="text-xs text-slate-500 font-medium">Altura (H)</label>
                  <select
                    value={camHeight}
                    onChange={(e) => setCamHeight(Number(e.target.value))}
                    className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 outline-none focus:border-brand-primary"
                  >
                    <option value={480}>480 px</option>
                    <option value={720}>720 px</option>
                    <option value={1080}>1080 px</option>
                  </select>
                </div>
              </div>

              {/* Target FPS */}
              <div className="flex flex-col space-y-1">
                <label className="text-xs text-slate-500 font-medium">Framerate Alvo (FPS)</label>
                <select
                  value={camFps}
                  onChange={(e) => setCamFps(Number(e.target.value))}
                  className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 outline-none focus:border-brand-primary"
                >
                  <option value={15}>15 FPS (IP/Leve)</option>
                  <option value={30}>30 FPS (Webcam padrão)</option>
                  <option value={60}>60 FPS (Fidelidade)</option>
                </select>
              </div>

              {/* Form Buttons */}
              <button
                type="submit"
                className="w-full flex items-center justify-center space-x-2 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-700/80 hover:border-slate-600 text-brand-primary text-xs font-semibold shadow-sm transition-all cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                <span>{editingCameraId ? 'Atualizar Câmera' : 'Adicionar Câmera'}</span>
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import { NavLink } from 'react-router-dom';
import { Tv, Settings, Cpu, HardDrive, ShieldAlert, Video, Camera, BrainCircuit, X, Database } from 'lucide-react';
import { useCameraStore } from '../stores/cameraStore';

export const Header: React.FC = () => {
  const systemStats = useCameraStore((state) => state.systemStats);
  const activeCameraId = useCameraStore((state) => state.activeCameraId);
  const cameraStatus = useCameraStore((state) => state.cameraStatus);
  const isFullscreen = useCameraStore((state) => state.isFullscreen);
  const cameras = useCameraStore((state) => state.cameras);
  const fetchCameras = useCameraStore((state) => state.fetchCameras);

  // AI Trainer Modal states
  const [isTrainerModalOpen, setIsTrainerModalOpen] = React.useState(false);
  const [trainerClassName, setTrainerClassName] = React.useState('');
  const [selectedCamId, setSelectedCamId] = React.useState('');
  const [trainerStatus, setTrainerStatus] = React.useState('');
  const [isStartingTrainer, setIsStartingTrainer] = React.useState(false);

  // Fetch cameras list when trainer modal is opened
  React.useEffect(() => {
    if (isTrainerModalOpen) {
      fetchCameras();
    }
  }, [isTrainerModalOpen]);

  // Set default selected camera
  React.useEffect(() => {
    if (isTrainerModalOpen && cameras.length > 0 && !selectedCamId) {
      const defCam = cameras.find(c => c.id === 'cam_webcam') || cameras[0];
      setSelectedCamId(defCam.id);
    }
  }, [cameras, isTrainerModalOpen, selectedCamId]);

  const handleStartTrainer = async () => {
    const className = trainerClassName.trim();
    if (!className) {
      setTrainerStatus('Informe o objeto/classe antes de iniciar.');
      return;
    }

    setIsStartingTrainer(true);
    setTrainerStatus('');

    try {
      const selectedCam = cameras.find(c => c.id === selectedCamId);
      const result = await window.electronAPI.startTrainer(className, selectedCam?.source);
      setTrainerStatus(result.message || 'Treinador aberto. Use a janela da câmera para capturar.');
    } catch (err) {
      setTrainerStatus(err instanceof Error ? err.message : 'Não foi possível iniciar o treinador.');
    } finally {
      setIsStartingTrainer(false);
    }
  };

  if (isFullscreen) return null;

  const getStatusColor = () => {
    switch (cameraStatus) {
      case 'connected': return 'bg-emerald-500 shadow-emerald-500/50 animate-pulse';
      case 'connecting': return 'bg-cyan-500 shadow-cyan-500/50 animate-pulse-slow';
      case 'error': return 'bg-rose-500 shadow-rose-500/50 animate-ping';
      default: return 'bg-slate-600';
    }
  };

  return (
    <>
      <header className="glass-panel border-b border-slate-800 px-6 py-4 flex items-center justify-between shrink-0">
        {/* Brand Logo */}
        <div className="flex items-center space-x-3">
          <div className="relative">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-brand-secondary to-brand-primary flex items-center justify-center shadow-lg">
              <Tv className="h-5 w-5 text-white" />
            </div>
            {/* Status Dot */}
            <span className={`absolute -bottom-1 -right-1 flex h-4 w-4 rounded-full border-2 border-slate-950 ${getStatusColor()}`} />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
              SmartCam Monitor
            </h1>
            <p className="text-xs text-slate-500 font-mono">
              YOLOv11 ONNX Real-Time Engine
            </p>
          </div>
        </div>

        {/* Navigation Options */}
        <nav className="flex space-x-2 bg-slate-900/80 p-1 rounded-xl border border-slate-800">
          <NavLink
            to="/"
            className={({ isActive }) =>
              `flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-gradient-to-r from-brand-primary/20 to-brand-secondary/20 text-brand-primary border border-brand-primary/30 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
              }`
            }
          >
            <Tv className="h-4 w-4" />
            <span>Monitoramento</span>
          </NavLink>
          <NavLink
            to="/recordings"
            className={({ isActive }) =>
              `flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-gradient-to-r from-brand-primary/20 to-brand-secondary/20 text-brand-primary border border-brand-primary/30 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
              }`
            }
          >
            <Video className="h-4 w-4" />
            <span>Gravações</span>
          </NavLink>
          <NavLink
            to="/snapshots"
            className={({ isActive }) =>
              `flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-gradient-to-r from-brand-primary/20 to-brand-secondary/20 text-brand-primary border border-brand-primary/30 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
              }`
            }
          >
            <Camera className="h-4 w-4" />
            <span>Capturas</span>
          </NavLink>
          <NavLink
            to="/dataset"
            className={({ isActive }) =>
              `flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-gradient-to-r from-brand-primary/20 to-brand-secondary/20 text-brand-primary border border-brand-primary/30 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
              }`
            }
          >
            <Database className="h-4 w-4" />
            <span>Dataset IA</span>
          </NavLink>
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-gradient-to-r from-brand-primary/20 to-brand-secondary/20 text-brand-primary border border-brand-primary/30 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
              }`
            }
          >
            <Settings className="h-4 w-4" />
            <span>Configurações</span>
          </NavLink>

          {/* AI Trainer Button */}
          <button
            onClick={() => setIsTrainerModalOpen(true)}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
              isTrainerModalOpen
                ? 'bg-gradient-to-r from-brand-primary/20 to-brand-secondary/20 text-brand-primary border border-brand-primary/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
            }`}
          >
            <BrainCircuit className="h-4 w-4" />
            <span>Treinar IA</span>
          </button>
        </nav>

        {/* Live System Diagnostics */}
        <div className="flex items-center space-x-6 text-slate-400 text-xs font-mono">
          {/* CPU Stats */}
          <div className="flex items-center space-x-2">
            <Cpu className="h-4 w-4 text-brand-primary animate-pulse-slow" />
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-500 uppercase">CPU</span>
              <div className="flex items-center space-x-1.5">
                <span className="text-slate-200 font-semibold">
                  {systemStats ? `${systemStats.cpuUsage}%` : '--%'}
                </span>
                <div className="w-12 h-1.5 bg-slate-800 rounded-full overflow-hidden hidden sm:block">
                  <div
                    className="h-full bg-brand-primary transition-all duration-300"
                    style={{ width: `${systemStats?.cpuUsage || 0}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* RAM Stats */}
          <div className="flex items-center space-x-2">
            <HardDrive className="h-4 w-4 text-brand-secondary" />
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-500 uppercase">Memory</span>
              <span className="text-slate-200 font-semibold">
                {systemStats ? `${systemStats.memoryUsage} MB` : '--- MB'}
              </span>
            </div>
          </div>

          {/* Global Active Record Alert */}
          {activeCameraId && (
            <div className="flex items-center space-x-2 border-l border-slate-800 pl-6 hidden md:flex">
              <div className="flex flex-col items-end">
                <span className="text-[10px] text-slate-500 uppercase">Status</span>
                <span className="text-emerald-400 font-semibold uppercase text-[11px] tracking-wide flex items-center">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 mr-1.5 animate-ping" />
                  Live
                </span>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* AI Trainer Modal Overlay */}
      {isTrainerModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center animate-in fade-in duration-200 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl flex flex-col space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <BrainCircuit className="h-5 w-5 text-brand-primary animate-pulse" />
                <h2 className="text-md font-bold text-slate-100">Treinar IA (Detector de Objetos)</h2>
              </div>
              <button
                onClick={() => {
                  setIsTrainerModalOpen(false);
                  setTrainerStatus('');
                }}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-all cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-col space-y-1.5">
              <label className="text-xs text-slate-455 font-medium">Selecione a Câmera Origem</label>
              <select
                value={selectedCamId}
                onChange={(e) => setSelectedCamId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-brand-primary transition-all cursor-pointer"
              >
                <option value="" disabled>Selecione uma câmera...</option>
                {cameras.map((cam) => (
                  <option key={cam.id} value={cam.id}>
                    {cam.name} ({cam.source})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col space-y-1.5">
              <label className="text-xs text-slate-455 font-medium">Nome do Objeto ou Classe</label>
              <input
                value={trainerClassName}
                onChange={(e) => setTrainerClassName(e.target.value)}
                placeholder="Ex: capacete, copo, garrafa"
                className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-brand-primary transition-all placeholder:text-slate-600"
              />
            </div>

            <button
              onClick={handleStartTrainer}
              disabled={isStartingTrainer || !selectedCamId || !trainerClassName.trim()}
              className="w-full flex items-center justify-center space-x-2 px-3 py-3 rounded-xl bg-gradient-to-r from-brand-primary to-brand-secondary text-white font-semibold shadow-lg hover:brightness-110 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <BrainCircuit className="h-4 w-4" />
              <span>{isStartingTrainer ? 'Iniciando Treinador...' : 'Iniciar Treinador IA'}</span>
            </button>

            {trainerStatus && (
              <p className="text-xs text-slate-400 text-center leading-relaxed mt-2 p-2 bg-slate-950/50 border border-slate-850 rounded-lg">
                {trainerStatus}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
};

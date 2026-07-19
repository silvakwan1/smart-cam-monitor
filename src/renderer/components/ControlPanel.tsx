import React, { useState } from 'react';
import { useCameraStore } from '../stores/cameraStore';
import { Play, Square, Video, ShieldAlert, AlertTriangle, Eye } from 'lucide-react';
import { RecordingMode } from '../../shared/types';

export const ControlPanel: React.FC = () => {
  const cameras = useCameraStore((state) => state.cameras);
  const activeCameraId = useCameraStore((state) => state.activeCameraId);
  const cameraStatus = useCameraStore((state) => state.cameraStatus);
  const recordingMode = useCameraStore((state) => state.recordingMode);
  const latestDetections = useCameraStore((state) => state.latestDetections);
  
  const startStreaming = useCameraStore((state) => state.startStreaming);
  const stopStreaming = useCameraStore((state) => state.stopStreaming);
  const setRecordingMode = useCameraStore((state) => state.setRecordingMode);
  const takeSnapshot = useCameraStore((state) => state.takeSnapshot);

  const [selectedCamId, setSelectedCamId] = useState<string>('');

  // Auto-select first camera if available and none selected
  React.useEffect(() => {
    if (cameras.length > 0 && !selectedCamId) {
      // Prefer default webcam if present, otherwise first in list
      const defCam = cameras.find(c => c.id === 'cam_webcam') || cameras[0];
      setSelectedCamId(defCam.id);
    }
  }, [cameras, selectedCamId]);

  const handleStart = () => {
    if (!selectedCamId) return;
    startStreaming(selectedCamId, recordingMode);
  };

  const activeCamera = cameras.find(c => c.id === activeCameraId);
  const currentSelectedCamera = cameras.find(c => c.id === selectedCamId);

  return (
    <div className="w-80 shrink-0 flex flex-col space-y-4 overflow-y-auto max-h-full pr-1 bg-transparent">
      {/* 1. Stream Controls Section */}
      <div className="glass-panel rounded-2xl p-5 border border-slate-800 flex flex-col space-y-4 shadow-lg">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider font-mono">
          Controle do Feed
        </h3>

        {/* Camera Pick List */}
        <div className="flex flex-col space-y-1.5">
          <label className="text-xs text-slate-500 font-medium">Selecionar Câmera</label>
          <select
            value={selectedCamId}
            onChange={(e) => setSelectedCamId(e.target.value)}
            disabled={cameraStatus === 'connected' || cameraStatus === 'connecting'}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 outline-none focus:border-brand-primary transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {cameras.length === 0 ? (
              <option value="">Sem câmeras cadastradas</option>
            ) : (
              cameras.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.type.toUpperCase()})
                </option>
              ))
            )}
          </select>
        </div>

        {/* Action stream triggers */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={handleStart}
            disabled={cameraStatus === 'connected' || cameraStatus === 'connecting' || !selectedCamId}
            className="flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-brand-primary to-brand-secondary text-white font-medium text-sm transition-all hover:scale-[1.02] active:scale-[0.98] shadow-md disabled:opacity-50 disabled:scale-100 disabled:cursor-not-allowed cursor-pointer"
          >
            <Play className="h-4 w-4 fill-current" />
            <span>Iniciar</span>
          </button>
          <button
            onClick={stopStreaming}
            disabled={cameraStatus === 'disconnected'}
            className="flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 font-medium text-sm transition-all hover:bg-slate-700 hover:text-white hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:scale-100 disabled:cursor-not-allowed cursor-pointer"
          >
            <Square className="h-4 w-4 fill-current text-rose-500" />
            <span>Parar</span>
          </button>
        </div>
      </div>



      {/* 2. Intelligent Recording Settings */}
      <div className="glass-panel rounded-2xl p-5 border border-slate-800 flex flex-col space-y-4 shadow-lg">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider font-mono">
            Modo de Gravação
          </h3>
          <Video className={`h-4 w-4 ${recordingMode !== 'off' ? 'text-rose-500 animate-pulse' : 'text-slate-600'}`} />
        </div>

        <div className="flex flex-col space-y-2">
          {[
            { mode: 'off', label: 'Desativado', desc: 'Não gravar vídeo' },
            { mode: 'continuous', label: 'Contínuo', desc: 'Gravar sem interrupções' },
            { mode: 'detection', label: 'Detecção de Pessoas', desc: 'Gravar quando houver pessoas' },
            { mode: 'motion', label: 'Detecção de Movimento', desc: 'Gravar ao detectar movimentos' },
          ].map((item) => (
            <label
              key={item.mode}
              className={`flex items-start space-x-3 p-3 rounded-xl border transition-all cursor-pointer ${
                recordingMode === item.mode
                  ? 'bg-gradient-to-r from-brand-primary/10 to-brand-secondary/5 border-brand-primary/30 text-brand-primary'
                  : 'bg-slate-900/40 border-slate-800/80 text-slate-300 hover:bg-slate-900 hover:border-slate-700'
              }`}
            >
              <input
                type="radio"
                name="recordingMode"
                value={item.mode}
                checked={recordingMode === item.mode}
                onChange={() => setRecordingMode(item.mode as RecordingMode)}
                className="mt-1 accent-brand-primary"
              />
              <div className="flex flex-col">
                <span className="text-xs font-semibold">{item.label}</span>
                <span className="text-[10px] text-slate-500 leading-tight mt-0.5">{item.desc}</span>
              </div>
            </label>
          ))}
        </div>

        {cameraStatus === 'connected' && (
          <button
            onClick={takeSnapshot}
            className="w-full flex items-center justify-center space-x-2 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300 font-medium hover:bg-slate-800 hover:text-white transition-all active:scale-[0.98] cursor-pointer"
          >
            <Eye className="h-3.5 w-3.5" />
            <span>Criar Snapshot Manual</span>
          </button>
        )}
      </div>

      {/* 3. Live Intelligent Feed Readout */}
      <div className="glass-panel rounded-2xl p-5 border border-slate-800 flex-1 flex flex-col min-h-0 shadow-lg">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider font-mono mb-3 shrink-0">
          Metadados da Cena
        </h3>

        {cameraStatus !== 'connected' ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
            <ShieldAlert className="h-8 w-8 text-slate-700 mb-2" />
            <p className="text-xs text-slate-500 font-medium leading-relaxed">
              Inicie a transmissão para carregar o analisador de IA
            </p>
          </div>
        ) : latestDetections.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
            <AlertTriangle className="h-8 w-8 text-slate-600 mb-2 animate-pulse" />
            <p className="text-xs text-slate-400 font-medium">
              Sem anomalias detectadas
            </p>
            <p className="text-[10px] text-slate-500 font-mono mt-1">
              Varrendo 640x480...
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto pr-1 space-y-2">
            {latestDetections.map((det, index) => (
              <div
                key={index}
                className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3 flex items-center justify-between"
              >
                <div className="flex flex-col space-y-1">
                  <span className="text-xs font-semibold text-slate-200 capitalize">
                    {det.label}
                  </span>
                  <div className="flex items-center space-x-1.5">
                    <div className="w-24 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          det.label === 'person' ? 'bg-cyan-400' : 'bg-violet-400'
                        }`}
                        style={{ width: `${det.confidence * 100}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-semibold font-mono text-slate-400">
                      {(det.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
                <span className="text-[10px] bg-slate-800 text-slate-400 font-mono px-2 py-1 rounded">
                  x: {det.box.x.toFixed(2)}, y: {det.box.y.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

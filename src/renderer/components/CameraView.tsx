import React, { useRef, useEffect } from 'react';
import { useCameraStore } from '../stores/cameraStore';
import { AlertCircle, Aperture, Video, Shield, Maximize2, Minimize2 } from 'lucide-react';
import { CameraStatus } from '../../shared/types';

export const CameraView: React.FC = () => {
  const latestFrame = useCameraStore((state) => state.latestFrame);
  const latestDetections = useCameraStore((state) => state.latestDetections);
  const captureFps = useCameraStore((state) => state.captureFps);
  const inferenceFps = useCameraStore((state) => state.inferenceFps);
  const cameraStatus = useCameraStore((state) => state.cameraStatus);
  const activeCameraId = useCameraStore((state) => state.activeCameraId);
  const recordingMode = useCameraStore((state) => state.recordingMode);
  const cameras = useCameraStore((state) => state.cameras);
  const isFullscreen = useCameraStore((state) => state.isFullscreen);
  const toggleFullscreen = useCameraStore((state) => state.toggleFullscreen);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  // Initialize helper Image instance
  useEffect(() => {
    const img = new Image();
    imageRef.current = img;
  }, []);

  // Listen to Escape key globally to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        toggleFullscreen();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, toggleFullscreen]);

  // Class colors map
  const getClassStyle = (label: string) => {
    switch (label) {
      case 'person':
        return { stroke: 'rgba(6, 182, 212, 1)', fill: 'rgba(6, 182, 212, 0.15)', textBg: '#06b6d4' }; // Cyan
      case 'car':
      case 'truck':
      case 'motorcycle':
      case 'bicycle':
        return { stroke: 'rgba(139, 92, 246, 1)', fill: 'rgba(139, 92, 246, 0.12)', textBg: '#8b5cf6' }; // Violet
      case 'cat':
      case 'dog':
        return { stroke: 'rgba(245, 158, 11, 1)', fill: 'rgba(245, 158, 11, 0.12)', textBg: '#f59e0b' }; // Orange/Yellow
      default:
        return { stroke: 'rgba(16, 185, 129, 1)', fill: 'rgba(16, 185, 129, 0.12)', textBg: '#10b981' }; // Emerald
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 1. Draw Mesh/Off-State if no active feed is available
    if (cameraStatus === 'disconnected' || cameraStatus === 'error' || !latestFrame) {
      drawOffState(ctx, canvas.width, canvas.height, cameraStatus);
      return;
    }

    const img = imageRef.current;
    if (!img) return;

    img.onload = () => {
      // Clear previous frames
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // A. Draw video frame image
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // B. Draw YOLO Detection overlays
      latestDetections.forEach((det) => {
        const style = getClassStyle(det.label);

        // Convert 0.0-1.0 relative coordinates to absolute canvas pixel values
        const x = det.box.x * canvas.width;
        const y = det.box.y * canvas.height;
        const w = det.box.width * canvas.width;
        const h = det.box.height * canvas.height;

        // Draw bounding box border
        ctx.strokeStyle = style.stroke;
        ctx.lineWidth = 3;
        ctx.lineJoin = 'round';
        ctx.strokeRect(x, y, w, h);

        // Draw translucent body fill
        ctx.fillStyle = style.fill;
        ctx.fillRect(x, y, w, h);

        // Draw Label Tag block
        const labelText = `${det.label} ${(det.confidence * 100).toFixed(0)}%`;
        ctx.font = 'bold 12px sans-serif';
        const labelWidth = ctx.measureText(labelText).width + 12;

        ctx.fillStyle = style.textBg;
        ctx.fillRect(x, y - 20 >= 0 ? y - 20 : y, labelWidth, 20);

        ctx.fillStyle = '#ffffff';
        ctx.fillText(labelText, x + 6, y - 20 >= 0 ? y - 6 : y + 14);
      });

      // C. Draw Telemetry HUD overlays
      drawHUD(ctx, canvas.width, canvas.height);
    };

    // Trigger image source update
    img.src = `data:image/jpeg;base64,${latestFrame}`;

  }, [latestFrame, latestDetections, cameraStatus, captureFps, inferenceFps, recordingMode]);

  const drawHUD = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    // 1. Time / Date Overlay
    const now = new Date();
    const dateStr = now.toLocaleDateString('pt-BR');
    const timeStr = now.toLocaleTimeString('pt-BR');
    
    ctx.fillStyle = 'rgba(3, 7, 18, 0.7)';
    ctx.fillRect(16, 16, 200, 48);
    
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 13px font-mono, monospace';
    ctx.fillText(dateStr, 28, 34);
    ctx.font = '12px font-mono, monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(timeStr, 28, 52);

    // 2. Performance Frame Telemetry (top right)
    ctx.fillStyle = 'rgba(3, 7, 18, 0.7)';
    ctx.fillRect(width - 240, 16, 224, 48);
    
    ctx.font = '11px sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('CAPTURE FPS:', width - 228, 34);
    ctx.fillText('INFERENCE:', width - 228, 52);

    ctx.font = 'bold 12px font-mono, monospace';
    ctx.fillStyle = captureFps > 20 ? '#10b981' : '#f59e0b';
    ctx.fillText(`${captureFps} FPS`, width - 130, 34);
    
    ctx.fillStyle = inferenceFps > 10 ? '#06b6d4' : '#94a3b8';
    ctx.fillText(`${inferenceFps} FPS`, width - 130, 52);

    // 3. Counter Summary Box (bottom left)
    const peopleCount = latestDetections.filter(d => d.label === 'person').length;
    const objectsCount = latestDetections.length;
    
    ctx.fillStyle = 'rgba(3, 7, 18, 0.75)';
    ctx.fillRect(16, height - 76, 220, 60);

    ctx.font = 'bold 12px sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('OBJETOS NA CENA:', 28, height - 56);
    
    ctx.font = 'bold 14px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`Pessoas: ${peopleCount}`, 28, height - 32);

    if (objectsCount > peopleCount) {
      ctx.font = '12px sans-serif';
      ctx.fillStyle = '#a78bfa';
      ctx.fillText(`+ ${objectsCount - peopleCount} outros objetos`, 120, height - 32);
    }

    // 4. Recording Status Indicator (top left overlay below time)
    if (recordingMode !== 'off') {
      ctx.fillStyle = 'rgba(239, 68, 68, 0.2)';
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.8)';
      ctx.lineWidth = 1;
      ctx.fillRect(16, 74, 110, 26);
      ctx.strokeRect(16, 74, 110, 26);

      // Blinking red dot
      if (Math.floor(Date.now() / 500) % 2 === 0) {
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(28, 87, 5, 0, 2 * Math.PI);
        ctx.fill();
      }

      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(`REC - ${recordingMode.toUpperCase()}`, 40, 91);
    }
  };

  const drawOffState = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    status: CameraStatus
  ) => {
    // Fill deep dark background
    ctx.fillStyle = '#05070f';
    ctx.fillRect(0, 0, width, height);

    // Draw diagnostic grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
    ctx.lineWidth = 1;
    const gridCols = 8;
    const gridRows = 6;
    for (let i = 1; i < gridCols; i++) {
      ctx.beginPath();
      ctx.moveTo((width / gridCols) * i, 0);
      ctx.lineTo((width / gridCols) * i, height);
      ctx.stroke();
    }
    for (let i = 1; i < gridRows; i++) {
      ctx.beginPath();
      ctx.moveTo(0, (height / gridRows) * i);
      ctx.lineTo(width, (height / gridRows) * i);
      ctx.stroke();
    }

    // Draw target scope lines in center
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.15)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, 80, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(width / 2 - 120, height / 2);
    ctx.lineTo(width / 2 + 120, height / 2);
    ctx.moveTo(width / 2, height / 2 - 120);
    ctx.lineTo(width / 2, height / 2 + 120);
    ctx.stroke();

    // Display Status Message
    ctx.font = '16px monospace';
    ctx.textAlign = 'center';
    
    if (status === 'connecting') {
      ctx.fillStyle = '#06b6d4';
      ctx.fillText('CONECTANDO À FONTE DE VÍDEO...', width / 2, height / 2 + 150);
      // Spinning outer ring simulation
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 3;
      ctx.beginPath();
      const angle = (Date.now() / 200) % (2 * Math.PI);
      ctx.arc(width / 2, height / 2, 40, angle, angle + Math.PI * 1.5);
      ctx.stroke();
    } else if (status === 'error') {
      ctx.fillStyle = '#ef4444';
      ctx.fillText('ERRO DE CONEXÃO: CANAL SEM SINAL', width / 2, height / 2 + 150);
    } else {
      ctx.fillStyle = '#64748b';
      ctx.fillText('CAMERA STOPPED - AGUARDANDO INICIALIZAÇÃO', width / 2, height / 2 + 150);
    }
    
    // Reset text alignment for other draw operations
    ctx.textAlign = 'left';
  };

  const activeCamera = cameras.find(c => c.id === activeCameraId);

  return (
    <div className={`flex-1 flex flex-col min-w-0 bg-slate-900/40 relative overflow-hidden shadow-inner ${
      isFullscreen 
        ? 'fixed inset-0 z-50 bg-black rounded-none border-none' 
        : 'rounded-2xl border border-slate-800'
    }`}>
      {/* Title Bar - hidden in fullscreen */}
      {!isFullscreen && (
        <div className="px-5 py-3.5 bg-slate-900/60 border-b border-slate-800 flex justify-between items-center z-10 shrink-0">
          <div className="flex items-center space-x-2.5">
            <Aperture className={`h-4.5 w-4.5 ${cameraStatus === 'connected' ? 'text-brand-primary animate-spin-slow' : 'text-slate-500'}`} />
            <span className="text-sm font-semibold text-slate-200">
              {activeCamera ? activeCamera.name : 'Nenhum canal ativo'}
            </span>
            {activeCamera && (
              <span className="text-[10px] bg-slate-800 text-slate-400 font-mono px-2 py-0.5 rounded uppercase">
                {activeCamera.type}
              </span>
            )}
          </div>

          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-3">
              <span className={`h-2.5 w-2.5 rounded-full ${cameraStatus === 'connected' ? 'bg-emerald-500' : 'bg-slate-600'}`} />
              <span className="text-xs text-slate-400 font-medium">
                {cameraStatus === 'connected' ? 'Transmissão Estável' : cameraStatus === 'connecting' ? 'Preparando' : 'Offline'}
              </span>
            </div>
            
            {cameraStatus === 'connected' && (
              <button
                onClick={toggleFullscreen}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-750 transition-all cursor-pointer"
                title="Ver em Tela Cheia (Clique Duplo no vídeo)"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Floating Exit Button in Fullscreen */}
      {isFullscreen && (
        <button
          onClick={toggleFullscreen}
          className="absolute top-4 right-4 z-50 p-2.5 rounded-full bg-slate-950/80 hover:bg-slate-900 border border-slate-800/80 text-slate-400 hover:text-white shadow-lg transition-all cursor-pointer"
          title="Sair da Tela Cheia (ESC ou Clique Duplo)"
        >
          <Minimize2 className="h-4.5 w-4.5" />
        </button>
      )}

      {/* Screen Area */}
      <div className={`flex-1 flex items-center justify-center relative ${isFullscreen ? 'p-0 bg-black' : 'p-6'}`}>
        <div className={`relative flex items-center justify-center ${
          isFullscreen 
            ? 'w-full h-full border-none rounded-none' 
            : 'w-full max-w-4xl aspect-[4/3] bg-slate-950 rounded-xl overflow-hidden shadow-2xl border border-slate-800'
        }`}>
          <canvas
            ref={canvasRef}
            width={activeCamera ? activeCamera.width : 640}
            height={activeCamera ? activeCamera.height : 480}
            onDoubleClick={cameraStatus === 'connected' ? toggleFullscreen : undefined}
            className={`max-w-full max-h-full ${cameraStatus === 'connected' ? 'cursor-pointer' : ''}`}
          />
        </div>
      </div>
    </div>
  );
};

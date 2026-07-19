import React, { useEffect, useState, useRef } from 'react';
import { Video, Trash2, FolderOpen, Calendar, Play, ChevronRight, AlertTriangle, RefreshCw, CheckSquare, Square, Pause, RotateCcw, ZoomIn, ZoomOut, Scissors, Eye, Clock, Activity, User, ShieldAlert, HelpCircle } from 'lucide-react';
import { SystemEvent } from '../../shared/types';

interface RecordingFile {
  name: string;
  path: string;
  size: number;
  createdAt: number;
  url: string;
}

type SpeedOption = 0.25 | 0.5 | 1 | 1.5 | 2 | 4 | 8;

export const RecordingsPage: React.FC = () => {
  const [recordings, setRecordings] = useState<RecordingFile[]>([]);
  const [groupedRecordings, setGroupedRecordings] = useState<Record<string, RecordingFile[]>>({});
  const [selectedDay, setSelectedDay] = useState<string>('');
  const [activeVideo, setActiveVideo] = useState<RecordingFile | null>(null);
  const [allEvents, setAllEvents] = useState<SystemEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Bulk Selection state
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());

  // Custom Video Player States
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<SpeedOption>(1);

  // Toggle option to show bounding box on playback
  const [showDetections, setShowDetections] = useState(true);
  const [videoDetections, setVideoDetections] = useState<any[]>([]);
  
  // Zoom & Pan States
  const [zoomLevel, setZoomLevel] = useState(1); // 1x to 4x
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const panStartRef = useRef({ x: 0, y: 0 });

  // Video Trimming States
  const [isTrimming, setIsTrimming] = useState(false);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [isTrimmingInProcess, setIsTrimmingInProcess] = useState(false);

  const fetchRecordings = async () => {
    setIsLoading(true);
    try {
      const list = await window.electronAPI.getRecordings();
      setRecordings(list);
      
      const eventList = await window.electronAPI.getEvents();
      setAllEvents(eventList);

      // Group files by calendar date (e.g., DD/MM/YYYY)
      const grouped: Record<string, RecordingFile[]> = {};
      list.forEach((file) => {
        const dateObj = new Date(file.createdAt);
        const dateStr = dateObj.toLocaleDateString('pt-BR');
        if (!grouped[dateStr]) {
          grouped[dateStr] = [];
        }
        grouped[dateStr].push(file);
      });
      
      setGroupedRecordings(grouped);

      // Auto-select first day with videos if none selected or no longer valid
      const days = Object.keys(grouped);
      if (days.length > 0 && (!selectedDay || !grouped[selectedDay])) {
        setSelectedDay(days[0]);
      }
    } catch (err) {
      console.error('Failed to load recordings:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRecordings();
  }, []);

  // Fetch detections JSON when active video is loaded
  useEffect(() => {
    if (activeVideo) {
      window.electronAPI.getRecordingDetections(activeVideo.path)
        .then((data) => {
          setVideoDetections(data || []);
        })
        .catch((err) => {
          console.error('Failed to load detections tracking file:', err);
          setVideoDetections([]);
        });
    } else {
      setVideoDetections([]);
    }
  }, [activeVideo]);

  // Update playbackRate on video element
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate, activeVideo]);

  // Sync canvas dimensions and draw bounding box overlay relative to currentTime
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !videoRef.current) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear previous drawing
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!showDetections || videoDetections.length === 0) return;

    const video = videoRef.current;
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
    }

    // Find closest frame to the playhead (+/- 0.4 seconds window)
    const activeFrame = videoDetections.reduce((best, item) => {
      const diffItem = Math.abs(item.time - currentTime);
      const diffBest = best ? Math.abs(best.time - currentTime) : Infinity;
      return diffItem < diffBest ? item : best;
    }, null);

    if (!activeFrame || Math.abs(activeFrame.time - currentTime) > 0.4) {
      return;
    }

    activeFrame.detections.forEach((det: any) => {
      // Get colors based on class label
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

      const style = getClassStyle(det.label);

      // Clamp values strictly inside [0.0, 1.0] to prevent canvas overflow and system crashes
      const boxX = Math.max(0, Math.min(1, det.box.x));
      const boxY = Math.max(0, Math.min(1, det.box.y));
      const boxW = Math.max(0, Math.min(1, det.box.width));
      const boxH = Math.max(0, Math.min(1, det.box.height));

      const x = boxX * canvas.width;
      const y = boxY * canvas.height;
      const w = boxW * canvas.width;
      const h = boxH * canvas.height;

      // Draw box border
      ctx.strokeStyle = style.stroke;
      ctx.lineWidth = 4;
      ctx.lineJoin = 'round';
      ctx.strokeRect(x, y, w, h);

      // Draw box translucent body fill
      ctx.fillStyle = style.fill;
      ctx.fillRect(x, y, w, h);

      // Draw box label tag
      const labelText = `${det.label} ${(det.confidence * 100).toFixed(0)}%`;
      ctx.font = 'bold 14px sans-serif';
      const labelWidth = ctx.measureText(labelText).width + 12;

      ctx.fillStyle = style.textBg;
      ctx.fillRect(x, y - 24 >= 0 ? y - 24 : y, labelWidth, 24);

      ctx.fillStyle = '#ffffff';
      ctx.fillText(labelText, x + 6, y - 24 >= 0 ? y - 8 : y + 16);
    });
  }, [currentTime, videoDetections, showDetections]);

  // Keep track of current time progress
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const videoDuration = videoRef.current.duration || 0;
      setDuration(videoDuration);
      setTrimEnd(videoDuration);
      setTrimStart(0);
    }
  };

  const handlePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
        setIsPlaying(false);
      } else {
        videoRef.current.play().then(() => {
          setIsPlaying(true);
        }).catch(console.error);
      }
    }
  };

  const handleDelete = async (filePath: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Deseja realmente deletar esta gravação?')) return;

    try {
      await window.electronAPI.deleteRecording(filePath);
      if (activeVideo?.path === filePath) {
        setActiveVideo(null);
      }
      await fetchRecordings();
    } catch (err) {
      alert('Erro ao excluir o arquivo.');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedPaths.size === 0) return;
    if (!confirm(`Deseja realmente deletar as ${selectedPaths.size} gravações selecionadas?`)) return;

    setIsLoading(true);
    try {
      const paths = Array.from(selectedPaths);
      await window.electronAPI.deleteMultipleRecordings(paths);
      setSelectedPaths(new Set());
      setIsSelectMode(false);
      await fetchRecordings();
    } catch (err) {
      console.error(err);
      alert('Erro ao excluir as gravações selecionadas.');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSelectPath = (filePath: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) {
        next.delete(filePath);
      } else {
        next.add(filePath);
      }
      return next;
    });
  };

  const handleSelectAll = (filteredFiles: RecordingFile[]) => {
    setSelectedPaths((prev) => {
      const allPaths = filteredFiles.map((f) => f.path);
      const allSelected = allPaths.every((p) => prev.has(p));
      
      if (allSelected) {
        const next = new Set(prev);
        allPaths.forEach((p) => next.delete(p));
        return next;
      } else {
        const next = new Set(prev);
        allPaths.forEach((p) => next.add(p));
        return next;
      }
    });
  };

  const formatSize = (bytes: number) => {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Video timeline seek handler
  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current || !videoRef.current || isTrimming) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const progress = Math.max(0, Math.min(1, clickX / rect.width));
    videoRef.current.currentTime = progress * duration;
  };

  // Panning drag handlers when zoomed in
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoomLevel <= 1) return;
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    panStartRef.current = { x: panX, y: panY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || zoomLevel <= 1) return;
    const deltaX = e.clientX - dragStartRef.current.x;
    const deltaY = e.clientY - dragStartRef.current.y;
    
    // Scale movement based on zoom level for smooth feel
    setPanX(panStartRef.current.x + deltaX / zoomLevel);
    setPanY(panStartRef.current.y + deltaY / zoomLevel);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleResetZoom = () => {
    setZoomLevel(1);
    setPanX(0);
    setPanY(0);
  };

  // Extract camera ID and Start Timestamp from active video name
  const getVideoMetadata = () => {
    if (!activeVideo) return { cameraId: '', startTimeMs: 0 };
    const name = activeVideo.name;
    const match = name.match(/^recording_(.+)_(\d+)\.mp4$/);
    if (match) {
      return {
        cameraId: match[1],
        startTimeMs: parseInt(match[2], 10),
      };
    }
    return { cameraId: '', startTimeMs: activeVideo.createdAt };
  };

  const { cameraId, startTimeMs } = getVideoMetadata();

  // Get events that overlap with this video's timeline window
  const getOverlappingEvents = () => {
    if (!activeVideo || duration === 0 || !cameraId) return [];
    const endTimeMs = startTimeMs + duration * 1000;
    return allEvents.filter((evt) => {
      return evt.cameraId === cameraId && evt.timestamp >= startTimeMs && evt.timestamp <= endTimeMs;
    });
  };

  const overlappingEvents = getOverlappingEvents();

  // Custom seeking to event time
  const handleSeekToEvent = (eventTimestamp: number) => {
    if (!videoRef.current || startTimeMs === 0) return;
    const relativeSec = (eventTimestamp - startTimeMs) / 1000;
    videoRef.current.currentTime = Math.max(0, Math.min(duration, relativeSec));
    if (!isPlaying) {
      videoRef.current.play().then(() => setIsPlaying(true)).catch(console.error);
    }
  };

  // Trigger video trim operation in backend
  const handleConfirmTrim = async () => {
    if (!activeVideo) return;
    const cutDuration = trimEnd - trimStart;
    if (cutDuration <= 0) {
      alert('Duração do corte inválida.');
      return;
    }

    if (!confirm(`Deseja recortar o vídeo das posições ${formatDuration(trimStart)} até ${formatDuration(trimEnd)} (duração: ${formatDuration(cutDuration)})?`)) {
      return;
    }

    setIsTrimmingInProcess(true);
    try {
      const res = await window.electronAPI.trimRecording(activeVideo.path, trimStart, cutDuration);
      alert('Recorte de vídeo realizado com sucesso!');
      setIsTrimming(false);
      setActiveVideo(null);
      await fetchRecordings();
    } catch (err) {
      console.error(err);
      alert('Erro ao realizar o recorte do vídeo.');
    } finally {
      setIsTrimmingInProcess(false);
    }
  };

  const daysList = Object.keys(groupedRecordings);
  const activeDayVideos = selectedDay ? (groupedRecordings[selectedDay] || []) : [];

  return (
    <div className="flex-1 flex space-x-6 p-6 min-h-0 overflow-hidden relative">
      {/* Sidebar: Grouped days list */}
      <div className="w-64 shrink-0 flex flex-col space-y-4 min-h-0">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider font-mono">
            Gravações por Dia
          </h3>
          <div className="flex items-center space-x-1.5">
            <button
              onClick={fetchRecordings}
              className={`p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer ${isLoading ? 'animate-spin' : ''}`}
              title="Recarregar Gravações"
              disabled={isLoading}
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              onClick={handleOpenFolder}
              className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
              title="Abrir Pasta de Gravações"
            >
              <FolderOpen className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 bg-slate-900/30 border border-slate-850 rounded-2xl p-3 overflow-y-auto space-y-1.5 shadow-inner">
          {daysList.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-600 text-center py-6">
              <Calendar className="h-8 w-8 text-slate-800 mb-1.5" />
              <span className="text-[11px] font-medium leading-normal">Sem gravações gravadas</span>
            </div>
          ) : (
            daysList.map((day) => (
              <button
                key={day}
                onClick={() => {
                  setSelectedDay(day);
                  setActiveVideo(null);
                  setSelectedPaths(new Set());
                  setIsSelectMode(false);
                }}
                className={`w-full flex items-center justify-between p-3 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                  selectedDay === day
                    ? 'bg-gradient-to-r from-brand-primary/15 to-brand-secondary/5 border-brand-primary/30 text-brand-primary'
                    : 'bg-slate-900/40 border-slate-850/80 text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>{day}</span>
                </div>
                <div className="flex items-center space-x-1">
                  <span className="text-[10px] font-mono opacity-80">
                    ({groupedRecordings[day].length})
                  </span>
                  <ChevronRight className="h-3 w-3" />
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Main View: Videos Grid or Custom Advanced Video Player */}
      <div className="flex-1 flex flex-col min-h-0 bg-slate-950/40 border border-slate-850/70 rounded-2xl p-6 overflow-hidden relative">
        {activeVideo ? (
          /* Video Playback Mode (Custom Advanced Player) */
          <div className="flex-1 flex flex-col min-h-0">
            {/* Top Bar inside Player */}
            <div className="px-5 py-3 bg-slate-900/80 border border-slate-800 rounded-xl flex justify-between items-center shrink-0 mb-4">
              <div className="flex items-center space-x-2.5 min-w-0">
                <Video className="h-4.5 w-4.5 text-brand-primary animate-pulse" />
                <span className="text-xs font-semibold text-slate-200 truncate font-mono">
                  {activeVideo.name}
                </span>
                <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-mono shrink-0">
                  {formatSize(activeVideo.size)}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setIsTrimming(!isTrimming)}
                  className={`text-xs font-medium flex items-center space-x-1 px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
                    isTrimming
                      ? 'bg-brand-primary/20 border-brand-primary/50 text-brand-primary'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                  }`}
                  title="Recortar pedaço do vídeo"
                >
                  <Scissors className="h-4 w-4" />
                  <span>{isTrimming ? 'Cancelar Recorte' : 'Cortar Vídeo'}</span>
                </button>
                <button
                  onClick={() => {
                    setActiveVideo(null);
                    setIsTrimming(false);
                    handleResetZoom();
                  }}
                  className="text-xs font-medium text-slate-400 hover:text-slate-200 bg-slate-850 px-3 py-1.5 rounded-lg border border-slate-750 hover:bg-slate-750 transition-all cursor-pointer"
                >
                  Voltar à Galeria
                </button>
              </div>
            </div>

            {/* Video Player Main Canvas Container (Handles Panning drag & Zoom scale) */}
            <div 
              className={`flex-1 relative bg-black/90 rounded-2xl overflow-hidden border border-slate-850 flex items-center justify-center ${
                zoomLevel > 1 ? 'cursor-grab active:cursor-grabbing' : ''
              }`}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              {isTrimmingInProcess ? (
                <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm z-30 flex flex-col items-center justify-center space-y-4">
                  <RefreshCw className="h-10 w-10 text-brand-primary animate-spin" />
                  <span className="text-sm font-semibold text-slate-200">Trabalhando no corte do vídeo via FFmpeg...</span>
                </div>
              ) : null}

              {/* Wrapper to scale canvas overlay exactly alongside the video tag */}
              <div 
                className="relative max-h-full max-w-full flex items-center justify-center pointer-events-none select-none"
                style={{
                  transform: `scale(${zoomLevel}) translate(${panX}px, ${panY}px)`,
                }}
              >
                <video
                  ref={videoRef}
                  src={activeVideo.url}
                  autoPlay
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={handleLoadedMetadata}
                  className="max-h-full max-w-full object-contain pointer-events-none select-none"
                />
                
                {/* Detections Canvas Bounding Box Overlay */}
                <canvas
                  ref={canvasRef}
                  className="absolute inset-0 w-full h-full pointer-events-none"
                />
              </div>
              
              {/* Floating zoom overlay indicator */}
              {zoomLevel > 1 && (
                <div className="absolute top-4 right-4 bg-slate-950/80 backdrop-blur-md px-3 py-1.5 border border-slate-800 rounded-lg text-xs font-mono text-brand-primary flex items-center space-x-1.5 shadow-xl select-none z-10">
                  <ZoomIn className="h-4 w-4" />
                  <span>Zoom: {zoomLevel.toFixed(1)}x</span>
                  <button 
                    onClick={handleResetZoom}
                    className="ml-2 text-slate-500 hover:text-white transition-colors cursor-pointer text-[10px] font-bold uppercase font-sans border-l border-slate-800 pl-2"
                  >
                    Reset
                  </button>
                </div>
              )}
            </div>

            {/* Custom Video Editor Seek Timeline & Indicators */}
            <div className="mt-4 bg-slate-900/60 border border-slate-850 rounded-xl p-4 flex flex-col space-y-3 shrink-0">
              <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
                <span>{formatDuration(currentTime)}</span>
                <span className="font-semibold text-slate-300">Linha do Tempo (Eventos Indicados)</span>
                <span>{formatDuration(duration)}</span>
              </div>

              {/* Seekbar track container */}
              <div 
                ref={timelineRef}
                onClick={handleTimelineClick}
                className="h-4.5 bg-slate-950 border border-slate-850 rounded-lg relative cursor-pointer group flex items-center select-none"
              >
                {/* Visual playback progress */}
                <div 
                  className="h-full bg-gradient-to-r from-brand-secondary/40 to-brand-primary/50 absolute left-0 rounded-l-lg pointer-events-none"
                  style={{ width: `${(currentTime / duration) * 100}%` }}
                />

                {/* Event Markers Overlay */}
                {duration > 0 && overlappingEvents.map((evt) => {
                  const relativeProgress = (evt.timestamp - startTimeMs) / (duration * 1000);
                  if (relativeProgress < 0 || relativeProgress > 1) return null;
                  
                  // Color indicators: Cyan for motion_detected, purple/rose for person_detected
                  let colorClass = 'bg-brand-success shadow-brand-success/50';
                  if (evt.type === 'motion_detected') colorClass = 'bg-brand-primary shadow-brand-primary/50';
                  if (evt.type === 'person_detected') colorClass = 'bg-brand-secondary shadow-brand-secondary/50';

                  return (
                    <div
                      key={evt.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSeekToEvent(evt.timestamp);
                      }}
                      className={`absolute top-0 bottom-0 w-1.5 z-20 border-r border-l border-slate-950 shadow-md transform -translate-x-1/2 hover:scale-x-[2.5] hover:z-30 hover:brightness-110 transition-all ${colorClass}`}
                      title={`${evt.type === 'motion_detected' ? 'Movimento' : 'Pessoa'} - ${formatTime(evt.timestamp)}: ${evt.description}`}
                    />
                  );
                })}

                {/* Seek scrubber handle */}
                <div 
                  className="h-4 w-4 bg-white border-2 border-brand-primary rounded-full absolute -ml-2 top-0.5 shadow-md shadow-black/80 pointer-events-none"
                  style={{ left: `${(currentTime / duration) * 100}%` }}
                />

                {/* Custom Trimming Handles overlay */}
                {isTrimming && duration > 0 && (
                  <>
                    {/* Selected trim zone highlight */}
                    <div 
                      className="absolute top-0 bottom-0 bg-yellow-500/20 border-r border-l-2 border-yellow-400 z-10"
                      style={{ 
                        left: `${(trimStart / duration) * 100}%`,
                        width: `${((trimEnd - trimStart) / duration) * 100}%`
                      }}
                    />
                    
                    {/* Trim start slider */}
                    <input
                      type="range"
                      min={0}
                      max={duration}
                      step={0.1}
                      value={trimStart}
                      onChange={(e) => setTrimStart(Math.min(trimEnd - 0.5, parseFloat(e.target.value)))}
                      className="absolute top-0 bottom-0 left-0 right-0 w-full h-full opacity-0 cursor-ew-resize z-25"
                    />

                    {/* Trim end slider */}
                    <input
                      type="range"
                      min={0}
                      max={duration}
                      step={0.1}
                      value={trimEnd}
                      onChange={(e) => setTrimEnd(Math.max(trimStart + 0.5, parseFloat(e.target.value)))}
                      className="absolute top-0 bottom-0 left-0 right-0 w-full h-full opacity-0 cursor-ew-resize z-24"
                    />
                  </>
                )}
              </div>

              {/* Trimming actions display info */}
              {isTrimming && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between border-t border-slate-800/80 pt-3 gap-3 animate-in fade-in duration-200">
                  <div className="text-xs text-yellow-400 flex items-center space-x-1.5">
                    <Scissors className="h-4 w-4" />
                    <span>Trecho: {formatDuration(trimStart)} até {formatDuration(trimEnd)} (Duração: {formatDuration(trimEnd - trimStart)})</span>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => {
                        setTrimStart(0);
                        setTrimEnd(duration);
                      }}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-300 rounded-lg text-xs font-semibold cursor-pointer transition-all"
                    >
                      Redefinir
                    </button>
                    <button
                      onClick={handleConfirmTrim}
                      className="px-3 py-1.5 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg text-xs font-semibold cursor-pointer transition-all shadow-md"
                    >
                      Salvar Corte
                    </button>
                  </div>
                </div>
              )}

              {/* General Custom Player Controls (Speed, Zoom, Playback, Overlay mode) */}
              <div className="flex flex-col lg:flex-row items-center justify-between border-t border-slate-800/80 pt-3.5 gap-4">
                {/* Play, Pause, Jump controls */}
                <div className="flex items-center space-x-3.5">
                  <button 
                    onClick={handlePlayPause}
                    className="h-10 w-10 rounded-full bg-gradient-to-tr from-brand-secondary to-brand-primary text-white flex items-center justify-center shadow-lg hover:scale-105 transition-all cursor-pointer shrink-0"
                  >
                    {isPlaying ? <Pause className="h-4.5 w-4.5 fill-current" /> : <Play className="h-4.5 w-4.5 fill-current ml-0.5" />}
                  </button>

                  <button
                    onClick={() => { if (videoRef.current) videoRef.current.currentTime = 0; }}
                    className="p-2 rounded-lg bg-slate-850 border border-slate-750 text-slate-400 hover:text-white transition-colors cursor-pointer"
                    title="Reiniciar"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                </div>

                {/* Display Mode Toggle: Normal Video vs Active Detection overlay */}
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] text-slate-500 font-mono uppercase">Modo de Exibição:</span>
                  <div className="flex bg-slate-950 p-1 border border-slate-850 rounded-lg">
                    <button
                      onClick={() => setShowDetections(false)}
                      className={`text-[10px] font-sans font-bold px-3 py-1 rounded transition-all cursor-pointer ${
                        !showDetections
                          ? 'bg-slate-800 text-brand-primary border border-slate-750'
                          : 'text-slate-500 hover:text-slate-305'
                      }`}
                    >
                      Vídeo Normal
                    </button>
                    <button
                      onClick={() => setShowDetections(true)}
                      className={`text-[10px] font-sans font-bold px-3 py-1 rounded transition-all cursor-pointer ${
                        showDetections
                          ? 'bg-slate-800 text-brand-primary border border-slate-750'
                          : 'text-slate-500 hover:text-slate-305'
                      }`}
                    >
                      Com Detecção
                    </button>
                  </div>
                </div>

                {/* Speed Controls: Fast and Slow playback options */}
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] text-slate-500 font-mono uppercase">Velocidade:</span>
                  <div className="flex bg-slate-950 p-1 border border-slate-850 rounded-lg">
                    {([0.25, 0.5, 1, 2, 4] as SpeedOption[]).map((rate) => (
                      <button
                        key={rate}
                        onClick={() => setPlaybackRate(rate)}
                        className={`text-[10px] font-mono font-bold px-2.5 py-1 rounded transition-all cursor-pointer ${
                          playbackRate === rate
                            ? 'bg-slate-800 text-brand-primary border border-slate-750'
                            : 'text-slate-500 hover:text-slate-350'
                        }`}
                      >
                        {rate}x
                      </button>
                    ))}
                  </div>
                </div>

                {/* Interactive Zoom controls */}
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] text-slate-500 font-mono uppercase">Zoom:</span>
                  <div className="flex items-center bg-slate-950 p-1 border border-slate-850 rounded-lg space-x-1">
                    <button
                      onClick={() => setZoomLevel((z) => Math.max(1, z - 0.5))}
                      className="p-1 rounded text-slate-500 hover:text-white cursor-pointer hover:bg-slate-800 transition-all"
                      disabled={zoomLevel <= 1}
                    >
                      <ZoomOut className="h-3.5 w-3.5" />
                    </button>
                    <span className="text-[10px] font-mono font-bold text-slate-300 w-12 text-center select-none">
                      {zoomLevel.toFixed(1)}x
                    </span>
                    <button
                      onClick={() => setZoomLevel((z) => Math.min(4, z + 0.5))}
                      className="p-1 rounded text-slate-500 hover:text-white cursor-pointer hover:bg-slate-800 transition-all"
                      disabled={zoomLevel >= 4}
                    >
                      <ZoomIn className="h-3.5 w-3.5" />
                    </button>
                    {zoomLevel > 1 && (
                      <button
                        onClick={handleResetZoom}
                        className="text-[9px] font-sans font-bold px-1.5 py-0.5 bg-slate-800 text-slate-400 hover:text-white rounded border border-slate-700 cursor-pointer"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
            
            {/* Markers Legend Info */}
            <div className="mt-4 flex flex-wrap gap-4 items-center justify-center text-[10px] text-slate-500 font-mono select-none">
              <span className="flex items-center space-x-1.5">
                <span className="h-2 w-2 rounded-full bg-brand-primary shadow shadow-brand-primary" />
                <span>Movimento</span>
              </span>
              <span className="flex items-center space-x-1.5">
                <span className="h-2 w-2 rounded-full bg-brand-secondary shadow shadow-brand-secondary" />
                <span>Detecção de Pessoa</span>
              </span>
              <span className="flex items-center space-x-1.5">
                <span className="h-2 w-2 rounded-full bg-brand-success shadow shadow-brand-success" />
                <span>Outros Objetos</span>
              </span>
            </div>
          </div>
        ) : (
          /* Video Grid Gallery Mode */
          <div className="flex-1 flex flex-col min-h-0">
            <div className="px-5 py-3.5 bg-slate-900/60 border-b border-slate-850 flex justify-between items-center shrink-0">
              <h4 className="text-sm font-semibold text-slate-200">
                {selectedDay ? `Gravações salvos no dia ${selectedDay}` : 'Selecione um dia'}
              </h4>

              {selectedDay && activeDayVideos.length > 0 && (
                <div className="flex items-center space-x-2 shrink-0">
                  {isSelectMode && (
                    <button
                      onClick={() => handleSelectAll(activeDayVideos)}
                      className="text-xs bg-slate-950 border border-slate-800 text-slate-300 hover:text-white px-3 py-1.5 rounded-lg cursor-pointer transition-all"
                    >
                      {activeDayVideos.every(v => selectedPaths.has(v.path)) ? 'Desmarcar Todos' : 'Marcar Todos'}
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setIsSelectMode(!isSelectMode);
                      setSelectedPaths(new Set());
                    }}
                    className={`text-xs flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
                      isSelectMode
                        ? 'bg-brand-primary/20 border-brand-primary/50 text-brand-primary'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <CheckSquare className="h-4 w-4" />
                    <span>{isSelectMode ? 'Cancelar Seleção' : 'Seleção Múltipla'}</span>
                  </button>
                </div>
              )}
            </div>

            <div className="flex-1 p-6 overflow-y-auto min-h-0 pb-16">
              {!selectedDay || activeDayVideos.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-600 text-center">
                  <Video className="h-10 w-10 text-slate-800 mb-2 animate-pulse-slow" />
                  <p className="text-xs font-medium">Nenhuma gravação selecionada</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {activeDayVideos.map((video) => {
                    const isSelected = selectedPaths.has(video.path);
                    return (
                      <div
                        key={video.path}
                        onClick={(e) => {
                          if (isSelectMode) {
                            toggleSelectPath(video.path, e);
                          } else {
                            setActiveVideo(video);
                            setPlaybackRate(1);
                            handleResetZoom();
                          }
                        }}
                        className={`group bg-slate-900/60 hover:bg-slate-900 border ${
                          isSelected 
                            ? 'border-brand-primary shadow-brand-primary/10 shadow-md scale-[1.01]' 
                            : 'border-slate-850 hover:border-slate-700/80'
                        } rounded-xl p-4 flex flex-col space-y-3 shadow-md hover:shadow-xl transition-all cursor-pointer relative`}
                      >
                        {/* Thumbnail block with overlay */}
                        <div className="aspect-video bg-slate-950 rounded-lg flex items-center justify-center border border-slate-850 group-hover:border-slate-700 relative overflow-hidden shrink-0">
                          <div className="absolute inset-0 bg-gradient-to-tr from-brand-secondary/10 to-brand-primary/10 opacity-30 group-hover:opacity-50 transition-opacity" />
                          <Play className="h-8 w-8 text-brand-primary opacity-60 group-hover:opacity-100 group-hover:scale-110 transition-all duration-300 pointer-events-none" />
                          
                          {/* Selection indicator check overlay */}
                          {isSelectMode && (
                            <div className="absolute top-2 right-2 z-20">
                              {isSelected ? (
                                <CheckSquare className="h-5 w-5 text-brand-primary drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] fill-slate-900" />
                              ) : (
                                <Square className="h-5 w-5 text-slate-400 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] fill-slate-900/40 hover:text-white" />
                              )}
                            </div>
                          )}

                          <span className="absolute bottom-2 right-2 bg-black/75 px-1.5 py-0.5 rounded text-[9px] font-mono text-slate-300">
                            {formatTime(video.createdAt)}
                          </span>
                        </div>

                        {/* File Details */}
                        <div className="flex flex-col space-y-1 min-w-0">
                          <span className="text-[11px] font-semibold text-slate-200 truncate font-mono">
                            {video.name}
                          </span>
                          <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                            <span>{formatSize(video.size)}</span>
                            <span>{formatTime(video.createdAt)}</span>
                          </div>
                        </div>

                        {/* Delete absolute button */}
                        {!isSelectMode && (
                          <button
                            onClick={(e) => handleDelete(video.path, e)}
                            className="absolute top-2 right-2 p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-550/20 text-rose-400 hover:text-rose-300 opacity-0 group-hover:opacity-100 transition-opacity duration-200 cursor-pointer"
                            title="Excluir Gravação"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Floating Bulk actions bar in Recordings gallery */}
            {isSelectMode && selectedPaths.size > 0 && (
              <div className="absolute bottom-6 left-6 right-6 glass-panel border border-brand-primary/30 p-4 rounded-xl flex items-center justify-between shadow-2xl animate-in slide-in-from-bottom-5 duration-300 z-30">
                <div className="flex items-center space-x-2">
                  <CheckSquare className="h-5 w-5 text-brand-primary animate-pulse" />
                  <span className="text-sm font-semibold text-slate-200">
                    {selectedPaths.size} {selectedPaths.size === 1 ? 'gravação selecionada' : 'gravações selecionadas'}
                  </span>
                </div>
                <div className="flex space-x-2.5">
                  <button
                    onClick={() => {
                      setIsSelectMode(false);
                      setSelectedPaths(new Set());
                    }}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white rounded-lg text-xs font-semibold cursor-pointer transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleBulkDelete}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold cursor-pointer flex items-center space-x-1.5 shadow-lg shadow-rose-950/20 hover:shadow-rose-600/10 transition-all"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span>Excluir Selecionados</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

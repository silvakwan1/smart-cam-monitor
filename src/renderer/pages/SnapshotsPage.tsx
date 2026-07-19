import React, { useEffect, useState } from 'react';
import { Camera, Trash2, FolderOpen, Calendar, ChevronRight, Eye, RefreshCw, AlertTriangle, ShieldAlert, Activity, User, HelpCircle, ArrowLeft, ArrowRight, CheckSquare, Square, XCircle } from 'lucide-react';
import { SystemEvent } from '../../shared/types';

interface SnapshotFile {
  name: string;
  path: string;
  size: number;
  createdAt: number;
  url: string;
}

type FilterType = 'all' | 'person' | 'motion' | 'manual';

export const SnapshotsPage: React.FC = () => {
  const [snapshots, setSnapshots] = useState<SnapshotFile[]>([]);
  const [events, setEvents] = useState<SystemEvent[]>([]);
  const [groupedSnapshots, setGroupedSnapshots] = useState<Record<string, SnapshotFile[]>>({});
  const [selectedDay, setSelectedDay] = useState<string>('');
  const [activeSnapshot, setActiveSnapshot] = useState<SnapshotFile | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Filter state
  const [filterType, setFilterType] = useState<FilterType>('all');

  // Bulk Selection state
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // 1. Get snapshot files from local directory
      const list = await window.electronAPI.getSnapshots();
      setSnapshots(list);

      // 2. Get events to correlate with snapshots
      const eventList = await window.electronAPI.getEvents();
      setEvents(eventList);
      
      // Group files by calendar date (e.g., DD/MM/YYYY)
      const grouped: Record<string, SnapshotFile[]> = {};
      list.forEach((file) => {
        const dateObj = new Date(file.createdAt);
        const dateStr = dateObj.toLocaleDateString('pt-BR');
        if (!grouped[dateStr]) {
          grouped[dateStr] = [];
        }
        grouped[dateStr].push(file);
      });
      
      setGroupedSnapshots(grouped);

      // Auto-select first day with snapshots if none selected or no longer valid
      const days = Object.keys(grouped);
      if (days.length > 0 && (!selectedDay || !grouped[selectedDay])) {
        setSelectedDay(days[0]);
      }
    } catch (err) {
      console.error('Failed to load snapshots and events:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenFolder = async () => {
    await window.electronAPI.openSnapshotsFolder();
  };

  const handleDelete = async (filePath: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!confirm('Deseja realmente deletar esta captura?')) return;

    try {
      await window.electronAPI.deleteSnapshot(filePath);
      
      if (activeSnapshot?.path === filePath) {
        handleNavigateLightbox('next');
        setActiveSnapshot((current) => current?.path === filePath ? null : current);
      }
      
      await fetchData();
    } catch (err) {
      alert('Erro ao excluir a captura.');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedPaths.size === 0) return;
    if (!confirm(`Deseja realmente deletar as ${selectedPaths.size} capturas selecionadas?`)) return;

    setIsLoading(true);
    try {
      const paths = Array.from(selectedPaths);
      await window.electronAPI.deleteMultipleSnapshots(paths);
      setSelectedPaths(new Set());
      setIsSelectMode(false);
      await fetchData();
    } catch (err) {
      console.error(err);
      alert('Erro ao excluir as capturas selecionadas.');
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

  const handleSelectAll = (filteredFiles: SnapshotFile[]) => {
    setSelectedPaths((prev) => {
      const allPaths = filteredFiles.map((f) => f.path);
      const allSelected = allPaths.every((p) => prev.has(p));
      
      if (allSelected) {
        // Deselect all filtered
        const next = new Set(prev);
        allPaths.forEach((p) => next.delete(p));
        return next;
      } else {
        // Select all filtered
        const next = new Set(prev);
        allPaths.forEach((p) => next.add(p));
        return next;
      }
    });
  };

  const formatSize = (bytes: number) => {
    const kb = bytes / 1024;
    if (kb > 1024) {
      return `${(kb / 1024).toFixed(1)} MB`;
    }
    return `${kb.toFixed(0)} KB`;
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const getCorrelatedEvent = (filename: string): SystemEvent | undefined => {
    const match = filename.match(/(evt_\d+_[a-z0-9]+)/i);
    if (!match) return undefined;
    const eventId = match[0];
    return events.find((evt) => evt.id === eventId);
  };

  const renderEventBadge = (event?: SystemEvent) => {
    if (!event) {
      return (
        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-slate-800/80 border border-slate-700 text-slate-300 text-[10px] font-medium font-sans">
          <Camera className="h-3 w-3" />
          <span>Captura Manual</span>
        </span>
      );
    }

    switch (event.type) {
      case 'person_detected':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-brand-primary/15 border border-brand-primary/45 text-brand-primary text-[10px] font-medium font-sans">
            <User className="h-3 w-3" />
            <span>Pessoa Detectada</span>
          </span>
        );
      case 'motion_detected':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-brand-secondary/15 border border-brand-secondary/45 text-brand-secondary text-[10px] font-medium font-sans">
            <Activity className="h-3 w-3" />
            <span>Movimento</span>
          </span>
        );
      case 'object_detected':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-brand-success/15 border border-brand-success/45 text-brand-success text-[10px] font-medium font-sans">
            <ShieldAlert className="h-3 w-3" />
            <span>Objeto: {event.label}</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-slate-850 border border-slate-700 text-slate-300 text-[10px] font-medium font-sans">
            <HelpCircle className="h-3 w-3" />
            <span>Alerta</span>
          </span>
        );
    }
  };

  const handleNavigateLightbox = (direction: 'prev' | 'next') => {
    if (!selectedDay || !activeSnapshot) return;
    const currentDaySnapshots = getFilteredSnapshots();
    const currentIndex = currentDaySnapshots.findIndex((s) => s.path === activeSnapshot.path);
    if (currentIndex === -1) return;

    let newIndex = currentIndex;
    if (direction === 'prev') {
      newIndex = currentIndex - 1 >= 0 ? currentIndex - 1 : currentDaySnapshots.length - 1;
    } else {
      newIndex = currentIndex + 1 < currentDaySnapshots.length ? currentIndex + 1 : 0;
    }

    setActiveSnapshot(currentDaySnapshots[newIndex]);
  };

  const activeDaySnapshots = selectedDay ? (groupedSnapshots[selectedDay] || []) : [];

  // Filter helper logic
  const getFilteredSnapshots = () => {
    return activeDaySnapshots.filter((file) => {
      const correlatedEvent = getCorrelatedEvent(file.name);
      if (filterType === 'all') return true;
      if (filterType === 'person') return correlatedEvent?.type === 'person_detected';
      if (filterType === 'motion') return correlatedEvent?.type === 'motion_detected';
      if (filterType === 'manual') return !correlatedEvent;
      return true;
    });
  };

  const filteredSnapshots = getFilteredSnapshots();
  const daysList = Object.keys(groupedSnapshots);

  return (
    <div className="flex-1 flex space-x-6 p-6 min-h-0 overflow-hidden relative">
      {/* Sidebar: Grouped days list */}
      <div className="w-64 shrink-0 flex flex-col space-y-4 min-h-0">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider font-mono">
            Capturas por Dia
          </h3>
          <div className="flex items-center space-x-1.5">
            <button
              onClick={fetchData}
              className={`p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer ${isLoading ? 'animate-spin' : ''}`}
              title="Recarregar Capturas"
              disabled={isLoading}
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              onClick={handleOpenFolder}
              className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
              title="Abrir Pasta de Capturas"
            >
              <FolderOpen className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 bg-slate-900/30 border border-slate-850 rounded-2xl p-3 overflow-y-auto space-y-1.5 shadow-inner">
          {daysList.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-600 text-center py-6">
              <Calendar className="h-8 w-8 text-slate-800 mb-1.5" />
              <span className="text-[11px] font-medium leading-normal">Sem prints arquivados</span>
            </div>
          ) : (
            daysList.map((day) => (
              <button
                key={day}
                onClick={() => {
                  setSelectedDay(day);
                  setActiveSnapshot(null);
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
                    ({groupedSnapshots[day].length})
                  </span>
                  <ChevronRight className="h-3 w-3" />
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Main Snapshots View Area */}
      <div className="flex-1 flex flex-col min-h-0 bg-slate-950/40 border border-slate-850/70 rounded-2xl p-6 overflow-hidden relative">
        {selectedDay ? (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Header statistics info */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-900 pb-4 mb-4 gap-4">
              <div>
                <h2 className="text-sm font-bold text-slate-100 flex items-center space-x-2">
                  <span>Capturas de {selectedDay}</span>
                  <span className="px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-slate-400 font-mono text-[10px] font-normal">
                    {filteredSnapshots.length} de {activeDaySnapshots.length} arquivos
                  </span>
                </h2>
                <p className="text-xs text-slate-500 font-sans mt-0.5">
                  Imagens estáticas geradas a partir de detecção de eventos e capturas manuais.
                </p>
              </div>

              {/* Selection and open folder controls */}
              <div className="flex items-center space-x-2 shrink-0">
                {isSelectMode && (
                  <button
                    onClick={() => handleSelectAll(filteredSnapshots)}
                    className="text-xs bg-slate-900 border border-slate-800 text-slate-300 hover:text-white px-3 py-1.5 rounded-lg cursor-pointer transition-all"
                  >
                    {filteredSnapshots.every(f => selectedPaths.has(f.path)) ? 'Desmarcar Todos' : 'Marcar Todos'}
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
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <CheckSquare className="h-4 w-4" />
                  <span>{isSelectMode ? 'Cancelar Seleção' : 'Seleção Múltipla'}</span>
                </button>
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center space-x-2 mb-4 bg-slate-900/60 p-1 border border-slate-850 rounded-xl max-w-md shrink-0">
              {(['all', 'person', 'motion', 'manual'] as FilterType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={`flex-1 text-[11px] font-semibold py-1.5 rounded-lg transition-all cursor-pointer ${
                    filterType === type
                      ? 'bg-slate-800 text-brand-primary shadow-inner border border-slate-750'
                      : 'text-slate-400 hover:text-slate-200 border border-transparent'
                  }`}
                >
                  {type === 'all' && 'Todos'}
                  {type === 'person' && 'Pessoas'}
                  {type === 'motion' && 'Movimento'}
                  {type === 'manual' && 'Manual'}
                </button>
              ))}
            </div>

            {/* Grid of Snapshots */}
            <div className="flex-1 overflow-y-auto pr-1 pb-16">
              {filteredSnapshots.length === 0 ? (
                <div className="h-48 flex flex-col items-center justify-center text-slate-600 text-center">
                  <AlertTriangle className="h-8 w-8 text-slate-800 mb-1.5" />
                  <span className="text-xs font-semibold">Nenhuma captura nesta categoria</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                  {filteredSnapshots.map((file) => {
                    const correlatedEvent = getCorrelatedEvent(file.name);
                    const isSelected = selectedPaths.has(file.path);
                    return (
                      <div
                        key={file.path}
                        onClick={(e) => {
                          if (isSelectMode) {
                            toggleSelectPath(file.path, e);
                          } else {
                            setActiveSnapshot(file);
                          }
                        }}
                        className={`group glass-panel rounded-xl overflow-hidden cursor-pointer border ${
                          isSelected
                            ? 'border-brand-primary shadow-brand-primary/10 shadow-md scale-[1.01]'
                            : 'border-slate-800/80 hover:border-brand-primary/30 hover:scale-[1.02]'
                        } transition-all duration-300 flex flex-col relative`}
                      >
                        {/* Image container */}
                        <div className="relative aspect-video bg-slate-900 overflow-hidden shrink-0">
                          <img
                            src={file.url}
                            alt={file.name}
                            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                            loading="lazy"
                          />
                          {!isSelectMode && (
                            <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center space-x-2">
                              <div className="p-2 rounded-lg bg-slate-900/90 border border-slate-700/80 text-brand-primary shadow-lg transform scale-90 group-hover:scale-100 transition-transform duration-300">
                                <Eye className="h-4.5 w-4.5" />
                              </div>
                              <button
                                onClick={(e) => handleDelete(file.path, e)}
                                className="p-2 rounded-lg bg-slate-900/90 border border-slate-700/80 text-rose-400 hover:text-rose-300 hover:bg-rose-950/20 shadow-lg transform scale-90 group-hover:scale-100 transition-transform duration-300 cursor-pointer"
                                title="Deletar captura"
                              >
                                <Trash2 className="h-4.5 w-4.5" />
                              </button>
                            </div>
                          )}

                          {/* Multi selection checkbox overlay */}
                          {isSelectMode && (
                            <div className="absolute top-2 right-2 z-20">
                              {isSelected ? (
                                <CheckSquare className="h-5 w-5 text-brand-primary drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] fill-slate-900" />
                              ) : (
                                <Square className="h-5 w-5 text-slate-400 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] fill-slate-900/40 hover:text-white" />
                              )}
                            </div>
                          )}
                          
                          {/* Event type tag on top left */}
                          <div className="absolute top-2 left-2 z-10">
                            {renderEventBadge(correlatedEvent)}
                          </div>

                          {/* Event timestamp on bottom right */}
                          <div className="absolute bottom-2 right-2 bg-slate-950/80 backdrop-blur-md px-1.5 py-0.5 rounded border border-slate-800/50 text-[10px] text-slate-300 font-mono">
                            {formatTime(file.createdAt)}
                          </div>
                        </div>

                        {/* File Details footer */}
                        <div className="p-3 bg-slate-900/50 flex-1 flex flex-col justify-between">
                          <div className="min-w-0">
                            <span className="text-[11px] font-semibold text-slate-200 truncate block">
                              {correlatedEvent?.cameraName || 'Câmera Local'}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono block truncate mt-0.5">
                              {correlatedEvent ? correlatedEvent.description : file.name}
                            </span>
                          </div>
                          <div className="flex items-center justify-between border-t border-slate-850/50 pt-2 mt-2 text-[10px] text-slate-400 font-mono">
                            <span>{formatSize(file.size)}</span>
                            {correlatedEvent?.confidence && (
                              <span className="text-brand-primary font-semibold">
                                IA: {(correlatedEvent.confidence * 100).toFixed(0)}%
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Floating bulk action bar at bottom of the main grid */}
            {isSelectMode && selectedPaths.size > 0 && (
              <div className="absolute bottom-6 left-6 right-6 glass-panel border border-brand-primary/30 p-4 rounded-xl flex items-center justify-between shadow-2xl animate-in slide-in-from-bottom-5 duration-300 z-30">
                <div className="flex items-center space-x-2">
                  <CheckSquare className="h-5 w-5 text-brand-primary animate-pulse" />
                  <span className="text-sm font-semibold text-slate-200">
                    {selectedPaths.size} {selectedPaths.size === 1 ? 'captura selecionada' : 'capturas selecionadas'}
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
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500 py-12">
            <Camera className="h-14 w-14 text-slate-800 mb-3 animate-pulse-slow" />
            <h3 className="text-sm font-semibold text-slate-400">Nenhuma Captura Disponível</h3>
            <p className="text-xs text-slate-600 mt-1 max-w-sm text-center">
              Selecione um dia no menu lateral para visualizar as imagens capturadas pelo sistema.
            </p>
          </div>
        )}
      </div>

      {/* Lightbox / Fullscreen Modal Overlay */}
      {activeSnapshot && (
        <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-4">
          <div className="absolute inset-0 cursor-pointer" onClick={() => setActiveSnapshot(null)} />
          
          <div className="relative glass-panel rounded-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col md:flex-row shadow-2xl border border-slate-850/80 animate-in fade-in zoom-in-95 duration-200">
            {/* Visualizer Area */}
            <div className="flex-1 bg-slate-950 flex items-center justify-center relative min-w-0 p-4">
              <img
                src={activeSnapshot.url}
                alt={activeSnapshot.name}
                className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-md"
              />

              {/* Close Button */}
              <button
                onClick={() => setActiveSnapshot(null)}
                className="absolute top-4 left-4 p-2 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer shadow-lg z-10"
                title="Fechar (Esc)"
              >
                <ArrowLeft className="h-4.5 w-4.5" />
              </button>

              {/* Navigation Left */}
              <button
                onClick={() => handleNavigateLightbox('prev')}
                className="absolute left-4 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-slate-900/80 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer shadow-lg z-10"
                title="Captura Anterior"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>

              {/* Navigation Right */}
              <button
                onClick={() => handleNavigateLightbox('next')}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-slate-900/80 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer shadow-lg z-10"
                title="Próxima Captura"
              >
                <ArrowRight className="h-5 w-5" />
              </button>
            </div>

            {/* Sidebar metadata details inside Lightbox */}
            <div className="w-full md:w-80 shrink-0 bg-slate-900/80 backdrop-blur-xl border-t md:border-t-0 md:border-l border-slate-800 p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest font-mono">
                    Detalhes do Print
                  </h4>
                  {renderEventBadge(getCorrelatedEvent(activeSnapshot.name))}
                </div>

                <div className="space-y-4">
                  {/* Event Name description */}
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-mono block">Câmera de Origem</span>
                    <span className="text-sm font-semibold text-slate-200 mt-0.5 block">
                      {getCorrelatedEvent(activeSnapshot.name)?.cameraName || 'Câmera Local (Manual)'}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-mono block">Descrição do Evento</span>
                    <span className="text-xs text-slate-300 mt-0.5 block leading-relaxed">
                      {getCorrelatedEvent(activeSnapshot.name)?.description || 'Nenhum evento gravado. Captura manual de tela.'}
                    </span>
                  </div>

                  {getCorrelatedEvent(activeSnapshot.name)?.confidence && (
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase font-mono block">Confiança do Detector IA</span>
                      <span className="text-xs font-semibold text-brand-primary mt-0.5 block font-mono">
                        {(getCorrelatedEvent(activeSnapshot.name)!.confidence! * 100).toFixed(1)}%
                      </span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4 border-t border-slate-800/80 pt-4">
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase font-mono block">Data</span>
                      <span className="text-xs text-slate-300 font-semibold mt-0.5 block">
                        {new Date(activeSnapshot.createdAt).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase font-mono block">Horário</span>
                      <span className="text-xs text-slate-300 font-semibold mt-0.5 block font-mono">
                        {formatTime(activeSnapshot.createdAt)}
                      </span>
                    </div>
                  </div>

                  <div className="border-t border-slate-800/80 pt-4 space-y-2">
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase font-mono block">Nome do Arquivo</span>
                      <span className="text-[10px] text-slate-400 block truncate mt-0.5 font-mono" title={activeSnapshot.name}>
                        {activeSnapshot.name}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase font-mono block">Tamanho</span>
                      <span className="text-xs text-slate-300 mt-0.5 block font-mono">
                        {formatSize(activeSnapshot.size)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom control buttons inside Lightbox */}
              <div className="space-y-2 mt-6">
                <button
                  onClick={() => handleDelete(activeSnapshot.path)}
                  className="w-full flex items-center justify-center space-x-2 py-2.5 px-4 rounded-xl border border-rose-900/30 bg-rose-950/20 text-rose-400 hover:text-white hover:bg-rose-600 hover:border-transparent transition-all cursor-pointer text-xs font-medium"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>Excluir Captura</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React from 'react';
import { useEventStore } from '../stores/eventStore';
import { Clock, Eye, Trash2, ShieldAlert, AlertTriangle, ShieldCheck, Image as ImageIcon } from 'lucide-react';

export const EventHistory: React.FC = () => {
  const events = useEventStore((state) => state.events);
  const filterType = useEventStore((state) => state.filterType);
  const setFilterType = useEventStore((state) => state.setFilterType);
  const clearEvents = useEventStore((state) => state.clearEvents);

  const [height, setHeight] = React.useState(() => {
    const saved = localStorage.getItem('event-history-height');
    return saved ? parseInt(saved, 10) : 176;
  });

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = height;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = startY - moveEvent.clientY;
      const newHeight = Math.max(56, Math.min(500, startHeight + deltaY));
      setHeight(newHeight);
      localStorage.setItem('event-history-height', newHeight.toString());
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'person_detected':
        return <ShieldCheck className="h-4 w-4 text-emerald-400" />;
      case 'person_left':
        return <Clock className="h-4 w-4 text-slate-500" />;
      case 'object_detected':
        return <Eye className="h-4 w-4 text-brand-secondary" />;
      case 'motion_detected':
        return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case 'camera_error':
        return <ShieldAlert className="h-4 w-4 text-rose-500" />;
      default:
        return <Clock className="h-4 w-4 text-slate-400" />;
    }
  };

  const getEventBadgeClass = (type: string) => {
    switch (type) {
      case 'person_detected':
        return 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400';
      case 'camera_error':
        return 'bg-rose-500/10 border-rose-500/25 text-rose-400';
      case 'motion_detected':
        return 'bg-amber-500/10 border-amber-500/25 text-amber-400';
      default:
        return 'bg-slate-800 border-slate-700 text-slate-300';
    }
  };

  // Filter list
  const filteredEvents = events.filter((evt) => {
    if (filterType === 'all') return true;
    if (filterType === 'person' && (evt.type === 'person_detected' || evt.label === 'person')) return true;
    if (filterType === 'motion' && evt.type === 'motion_detected') return true;
    if (filterType === 'vehicle' && (evt.label === 'car' || evt.label === 'truck' || evt.label === 'motorcycle' || evt.label === 'bicycle')) return true;
    if (filterType === 'error' && evt.type === 'camera_error') return true;
    return false;
  });

  return (
    <div 
      style={{ height: `${height}px` }}
      className={`glass-panel rounded-2xl border border-slate-800 flex flex-col shrink-0 shadow-lg relative select-none transition-all duration-75 ${
        height <= 70 ? 'p-3 pt-3.5 pb-2 overflow-hidden' : 'p-4.5 pt-6'
      }`}
    >
      {/* Resize Handle */}
      <div
        onMouseDown={handleMouseDown}
        className="absolute top-0 left-0 right-0 h-2.5 cursor-ns-resize flex items-center justify-center hover:bg-brand-primary/10 transition-all rounded-t-2xl group z-30"
      >
        <div className="w-12 h-1 bg-slate-800 group-hover:bg-brand-primary/60 rounded transition-colors" />
      </div>

      {/* Header and Controls */}
      <div className={`flex items-center justify-between shrink-0 ${height > 70 ? 'pb-3.5 border-b border-slate-800/80' : ''}`}>
        <div className="flex items-center space-x-3">
          <h3 className="text-sm font-semibold text-slate-200">
            Registro de Eventos Recentes
          </h3>
          <span className="bg-slate-800 text-slate-400 font-mono text-[10px] px-2 py-0.5 rounded-full font-bold">
            {filteredEvents.length} logs
          </span>
        </div>

        <div className="flex items-center space-x-4">
          {/* Quick Filters */}
          <div className="flex items-center space-x-1.5 bg-slate-900/60 p-0.5 rounded-lg border border-slate-800 text-[11px] font-medium">
            {[
              { id: 'all', label: 'Todos' },
              { id: 'person', label: 'Pessoas' },
              { id: 'motion', label: 'Movimento' },
              { id: 'vehicle', label: 'Veículos' },
              { id: 'error', label: 'Erros' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilterType(tab.id)}
                className={`px-3 py-1 rounded transition-all cursor-pointer ${
                  filterType === tab.id
                    ? 'bg-slate-800 text-brand-primary font-semibold shadow-sm'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {events.length > 0 && (
            <button
              onClick={clearEvents}
              className="flex items-center space-x-1 text-xs text-rose-400 hover:text-rose-300 transition-all font-medium cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Limpar</span>
            </button>
          )}
        </div>
      </div>

      {/* Events Timeline Container */}
      {height > 70 && (
        <div className="flex-1 overflow-x-auto overflow-y-hidden mt-4 event-scrollbar">
          {filteredEvents.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-600 text-center py-6">
              <Clock className="h-8 w-8 text-slate-700 mb-1.5" />
              <p className="text-xs font-medium">Histórico limpo</p>
              <p className="text-[10px] text-slate-500">Nenhum evento registrado sob o filtro selecionado</p>
            </div>
          ) : (
            <div className="flex space-x-4 pb-2 h-full">
              {filteredEvents.map((evt) => {
                const formattedTime = new Date(evt.timestamp).toLocaleTimeString('pt-BR');
                
                return (
                  <div
                    key={evt.id}
                    className="w-80 shrink-0 bg-slate-900/60 border border-slate-800/80 rounded-xl p-3.5 flex space-x-3.5 hover:border-slate-700/80 hover:bg-slate-900 transition-all duration-200 group"
                  >
                    {/* Event Thumbnail Snapshot */}
                    <div className="w-20 h-20 rounded-lg overflow-hidden bg-slate-950 border border-slate-800/60 shrink-0 relative flex items-center justify-center group-hover:border-slate-700">
                      {evt.snapshotData ? (
                        <img
                          src={`data:image/jpeg;base64,${evt.snapshotData}`}
                          alt="Snapshot"
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                        />
                      ) : (
                        <ImageIcon className="h-6 w-6 text-slate-800" />
                      )}
                      <span className="absolute bottom-1 right-1 bg-black/70 px-1 py-0.5 rounded text-[8px] font-mono text-slate-300 font-bold">
                        {formattedTime}
                      </span>
                    </div>

                    {/* Event Metadata */}
                    <div className="flex-1 flex flex-col justify-between py-0.5 min-w-0">
                      <div className="flex flex-col space-y-1">
                        <div className="flex items-center space-x-1.5">
                          {getEventIcon(evt.type)}
                          <span className={`text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-md border ${getEventBadgeClass(evt.type)}`}>
                            {evt.type.replace('_', ' ')}
                          </span>
                        </div>
                        
                        <p className="text-xs font-semibold text-slate-200 truncate mt-1">
                          {evt.label ? `${evt.label.toUpperCase()} (${(evt.confidence! * 100).toFixed(0)}%)` : evt.cameraName}
                        </p>
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono pt-1">
                        <span className="truncate max-w-[120px]">{evt.cameraName}</span>
                        <span className="text-slate-400 font-semibold">{formattedTime}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

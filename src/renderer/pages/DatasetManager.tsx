import React, { useEffect, useState } from 'react';
import { 
  BrainCircuit, Trash2, FolderOpen, AlertTriangle, Play, RefreshCw, 
  CheckCircle2, X, Image as ImageIcon, Cpu, Sparkles, Database, Plus, Eye
} from 'lucide-react';

interface DatasetImage {
  name: string;
  path: string;
  url: string;
  classId: number;
  className: string;
  size: number;
  createdAt: number;
}

interface DatasetClass {
  id: number;
  name: string;
  count: number;
}

export const DatasetManager: React.FC = () => {
  const [classes, setClasses] = useState<DatasetClass[]>([]);
  const [images, setImages] = useState<DatasetImage[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null); // null means "All"
  
  const [isLoading, setIsLoading] = useState(false);
  const [trainingStatus, setTrainingStatus] = useState<string>('');
  const [isTraining, setIsTraining] = useState(false);
  
  // Training parameters state
  const [epochs, setEpochs] = useState<number>(50);
  const [batchSize, setBatchSize] = useState<number>(8);
  const [device, setDevice] = useState<string>('auto');

  // Modal / Lightbox states
  const [activeImage, setActiveImage] = useState<DatasetImage | null>(null);
  const [deleteConfirmImage, setDeleteConfirmImage] = useState<DatasetImage | null>(null);
  const [deleteConfirmClass, setDeleteConfirmClass] = useState<DatasetClass | null>(null);

  const fetchDataset = async () => {
    setIsLoading(true);
    try {
      const data = await window.electronAPI.getDatasetData();
      setClasses(data.classes);
      setImages(data.images);
    } catch (err) {
      console.error('Failed to load dataset details:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDataset();
  }, []);

  const handleDeleteImage = async (image: DatasetImage) => {
    try {
      await window.electronAPI.deleteDatasetImage(image.path);
      setDeleteConfirmImage(null);
      await fetchDataset();
    } catch (err) {
      console.error('Failed to delete image:', err);
      alert('Erro ao deletar imagem.');
    }
  };

  const handleDeleteClass = async (cls: DatasetClass) => {
    try {
      await window.electronAPI.deleteDatasetClass(cls.id, cls.name);
      setDeleteConfirmClass(null);
      if (selectedClassId === cls.id) {
        setSelectedClassId(null);
      }
      await fetchDataset();
    } catch (err) {
      console.error('Failed to delete class:', err);
      alert('Erro ao excluir a classe.');
    }
  };

  const handleStartTraining = async () => {
    // Basic verification
    const totalImages = images.length;
    if (totalImages < 10) {
      setTrainingStatus('Aviso: Recomenda-se pelo menos 10 imagens no dataset antes do treinamento.');
    }

    setIsTraining(true);
    setTrainingStatus('Preparando ambiente e iniciando treinamento...');

    try {
      const result = await window.electronAPI.startDatasetTrainer({
        epochs,
        batch: batchSize,
        device
      });

      if (result.success) {
        setTrainingStatus('Treinador iniciado! Acompanhe o progresso na janela do terminal que foi aberta.');
      } else {
        setTrainingStatus(result.message || 'Falha ao iniciar o treinamento.');
      }
    } catch (err) {
      setTrainingStatus(err instanceof Error ? err.message : 'Não foi possível iniciar o treinamento.');
    } finally {
      setIsTraining(false);
    }
  };

  // Filtered images based on selection
  const filteredImages = selectedClassId !== null
    ? images.filter(img => img.classId === selectedClassId)
    : images;

  // Format file size
  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden p-6 space-y-6 bg-slate-950 text-slate-100">
      {/* Top Header Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
        <div>
          <h2 className="text-xl font-bold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent flex items-center gap-2">
            <Database className="h-5 w-5 text-brand-primary" />
            Base de Treino & Dataset Manager
          </h2>
          <p className="text-xs text-slate-500 font-mono mt-0.5">
            Gerencie classes, revise amostras e treine seu modelo YOLOv11 localmente.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchDataset}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer flex items-center gap-2 text-xs"
            title="Atualizar dados do dataset"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Sincronizar
          </button>
        </div>
      </div>

      {/* Dataset Statistics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
        <div className="glass-panel p-4 rounded-2xl border border-slate-800 flex items-center space-x-4 bg-slate-900/40">
          <div className="p-3 bg-brand-primary/10 text-brand-primary rounded-xl">
            <Database className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Total de Imagens</p>
            <h3 className="text-lg font-bold font-mono text-slate-200">{images.length}</h3>
          </div>
        </div>
        <div className="glass-panel p-4 rounded-2xl border border-slate-800 flex items-center space-x-4 bg-slate-900/40">
          <div className="p-3 bg-brand-secondary/10 text-brand-secondary rounded-xl">
            <BrainCircuit className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Classes Mapeadas</p>
            <h3 className="text-lg font-bold font-mono text-slate-200">{classes.length}</h3>
          </div>
        </div>
        <div className="glass-panel p-4 rounded-2xl border border-slate-800 flex items-center space-x-4 bg-slate-900/40">
          <div className="p-3 bg-cyan-500/10 text-cyan-400 rounded-xl">
            <ImageIcon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Treino (Imagens)</p>
            <h3 className="text-lg font-bold font-mono text-slate-200">
              {images.length}
            </h3>
          </div>
        </div>
        <div className="glass-panel p-4 rounded-2xl border border-slate-800 flex items-center space-x-4 bg-slate-900/40">
          <div className="p-3 bg-purple-500/10 text-purple-400 rounded-xl">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Qualidade do Dataset</p>
            <h3 className="text-xs font-bold text-slate-300">
              {images.length < 50 
                ? 'Baixo (Colete mais)' 
                : images.length < 200 
                  ? 'Médio (Bom)' 
                  : 'Excelente'}
            </h3>
          </div>
        </div>
      </div>

      {/* Main Workspace split */}
      <div className="flex-1 flex flex-col lg:flex-row gap-6 min-h-0">
        
        {/* Left Side: Classes & Training Panel */}
        <div className="w-full lg:w-80 flex flex-col gap-4 shrink-0 min-h-0">
          
          {/* Class List Panel */}
          <div className="glass-panel p-4 rounded-2xl border border-slate-800 bg-slate-900/30 flex flex-col min-h-[250px] lg:flex-1">
            <div className="flex items-center justify-between mb-3 border-b border-slate-850 pb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Classes Mapeadas</span>
              <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono">
                YAML
              </span>
            </div>
            
            {/* Scrollable list */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-1.5 event-scrollbar">
              {/* "All Classes" Selector */}
              <button
                onClick={() => setSelectedClassId(null)}
                className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-between transition-all cursor-pointer ${
                  selectedClassId === null
                    ? 'bg-gradient-to-r from-brand-primary/20 to-brand-secondary/20 text-brand-primary border border-brand-primary/30 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Database className="h-3.5 w-3.5" />
                  <span>Todas as Classes</span>
                </div>
                <span className="font-mono bg-slate-950 px-2 py-0.5 rounded border border-slate-800/50 text-[10px] text-slate-300">
                  {images.length}
                </span>
              </button>

              {classes.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-xs font-mono">
                  Nenhuma classe registrada no dataset.yaml
                </div>
              ) : (
                classes.map((cls) => (
                  <div
                    key={cls.id}
                    className={`group w-full rounded-xl border flex items-center justify-between transition-all ${
                      selectedClassId === cls.id
                        ? 'bg-gradient-to-r from-brand-primary/20 to-brand-secondary/20 text-brand-primary border-brand-primary/30'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 border-transparent'
                    }`}
                  >
                    <button
                      onClick={() => setSelectedClassId(cls.id)}
                      className="flex-1 text-left px-3 py-2.5 text-xs font-semibold flex items-center gap-2 cursor-pointer"
                    >
                      <span className="font-mono bg-slate-950/65 px-1.5 py-0.5 rounded border border-slate-800 text-[10px] text-slate-400">
                        {cls.id}
                      </span>
                      <span className="capitalize">{cls.name}</span>
                    </button>
                    
                    <div className="flex items-center pr-2.5 gap-2 shrink-0">
                      <span className="font-mono bg-slate-950 px-2 py-0.5 rounded text-[10px] text-slate-400">
                        {cls.count}
                      </span>
                      
                      {/* Delete Class Button */}
                      {cls.name !== 'person' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirmClass(cls);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:text-rose-400 hover:bg-slate-850 rounded transition-all cursor-pointer"
                          title="Excluir classe e todas as suas imagens"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Offline Training Controls Panel */}
          <div className="glass-panel p-4 rounded-2xl border border-slate-800 bg-slate-900/30 flex flex-col space-y-4">
            <div className="border-b border-slate-850 pb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <BrainCircuit className="h-4 w-4 text-brand-secondary animate-pulse" />
                Treinamento YOLOv11
              </span>
            </div>

            {/* Epochs Selection */}
            <div className="flex flex-col space-y-1.5" title="O número de épocas define quantas vezes o algoritmo de treino passará por todo o dataset. Valores maiores podem levar a uma precisão melhor, mas aumentam o tempo de treino.">
              <div className="flex justify-between items-center text-xs">
                <div className="flex flex-col">
                  <label className="text-slate-400 font-medium cursor-help">Épocas (Epochs)</label>
                  <span className="text-[9px] text-slate-500">Ciclos de treino da rede</span>
                </div>
                <input
                  type="number"
                  min={1}
                  max={2000}
                  value={epochs}
                  onChange={(e) => setEpochs(Math.max(1, Math.min(2000, Number(e.target.value))))}
                  className="w-16 bg-slate-950 border border-slate-850 rounded-lg px-2 py-0.5 text-right font-mono text-xs text-brand-secondary outline-none focus:border-brand-primary"
                />
              </div>
              <input 
                type="range" 
                min={5} 
                max={500} 
                step={5}
                value={Math.min(500, epochs)}
                onChange={(e) => setEpochs(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-850 rounded-lg appearance-none cursor-pointer accent-brand-secondary"
              />
              <span className="text-[10px] text-slate-500 leading-tight">
                Número de vezes que a IA varrerá a base de imagens completa.
              </span>
            </div>

            {/* Batch Size Selector */}
            <div className="flex flex-col space-y-1.5" title="Tamanho do lote (Batch Size) processado em cada iteração. Lotes maiores aceleram o treino e dão mais estabilidade, mas consomem muito mais memória de vídeo (VRAM). Se ocorrer erro de falta de memória (CUDA out of memory), reduza para 4 ou 8.">
              <label className="text-xs text-slate-400 font-medium cursor-help">Tamanho do Batch</label>
              <select
                value={batchSize}
                onChange={(e) => setBatchSize(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3 py-2 text-xs text-slate-200 outline-none focus:border-brand-primary transition-all cursor-pointer"
              >
                <option value={4}>4 (Mínimo - Menos VRAM)</option>
                <option value={8}>8 (Padrão Recomendado)</option>
                <option value={16}>16 (Médio - Mais VRAM)</option>
                <option value={32}>32 (Alto - Máxima VRAM)</option>
              </select>
              <span className="text-[10px] text-slate-500 leading-tight">
                Quantidade de imagens processadas juntas por lote.
              </span>
            </div>

            {/* Hardware Selection */}
            <div className="flex flex-col space-y-1.5" title="Dispositivo para executar o treino. GPU utiliza aceleração de hardware (NVIDIA CUDA) e é até 50x mais rápida que a CPU. A CPU é o método de compatibilidade global, mas muito lenta.">
              <label className="text-xs text-slate-400 font-medium cursor-help">Dispositivo de Hardware</label>
              <select
                value={device}
                onChange={(e) => setDevice(e.target.value)}
                className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3 py-2 text-xs text-slate-200 outline-none focus:border-brand-primary transition-all cursor-pointer"
              >
                <option value="auto">Auto-Detectar GPU/CPU (Recomendado)</option>
                <option value="0">GPU NVIDIA CUDA (Device 0)</option>
                <option value="cpu">Somente CPU (Lento)</option>
              </select>
              <span className="text-[10px] text-slate-500 leading-tight">
                Processador de hardware que executará os cálculos de treino.
              </span>
            </div>

            {/* Action Button */}
            <button
              onClick={handleStartTraining}
              disabled={isTraining || images.length === 0}
              className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border shadow-lg cursor-pointer ${
                isTraining || images.length === 0
                  ? 'bg-slate-850 border-slate-800 text-slate-500 cursor-not-allowed shadow-none'
                  : 'bg-gradient-to-r from-brand-primary to-brand-secondary hover:from-brand-primary/90 hover:to-brand-secondary/90 text-white border-brand-primary/30 hover:scale-[1.01] active:scale-[0.99]'
              }`}
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              {isTraining ? 'Iniciando...' : 'Iniciar Treinamento'}
            </button>

            {/* Training Status message */}
            {trainingStatus && (
              <div className="text-[10px] bg-slate-950 border border-slate-850 rounded-xl p-2.5 font-mono text-slate-400 leading-relaxed flex items-start gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-brand-primary shrink-0 mt-0.5" />
                <span>{trainingStatus}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Image Grid Workspace */}
        <div className="flex-1 glass-panel p-4 rounded-2xl border border-slate-800 bg-slate-900/30 flex flex-col min-h-0">
          <div className="flex items-center justify-between border-b border-slate-850 pb-2 mb-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Amostras de Imagens
              </span>
              <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-mono">
                {selectedClassId !== null 
                  ? classes.find(c => c.id === selectedClassId)?.name || 'Classe'
                  : 'Todas'}
              </span>
            </div>
            <span className="text-[10px] text-slate-500 font-mono">
              Mostrando {filteredImages.length} de {images.length} itens
            </span>
          </div>

          {filteredImages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500 space-y-3">
              <ImageIcon className="h-8 w-8 text-slate-700 animate-pulse" />
              <p className="text-xs font-mono text-center max-w-xs">
                Nenhuma imagem encontrada para esta classe. Capture imagens na câmera usando "Treinar IA" no cabeçalho.
              </p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto pr-1 grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-3 event-scrollbar content-start">
              {filteredImages.map((img) => (
                <div
                  key={img.path}
                  className="group relative w-20 h-28 bg-slate-950/80 border border-slate-850 rounded-xl overflow-hidden shadow-md hover:border-slate-700 transition-all duration-200 flex flex-col shrink-0"
                >
                  {/* Thumbnail (Square 80x80) */}
                  <div 
                    onClick={() => setActiveImage(img)}
                    className="w-20 h-20 bg-slate-900 flex items-center justify-center overflow-hidden cursor-pointer relative border-b border-slate-850 shrink-0"
                  >
                    <img
                      src={img.url}
                      alt={img.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-all duration-300"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all">
                      <Eye className="h-4 w-4 text-white drop-shadow" />
                    </div>
                  </div>

                  {/* Metadata & Actions (Compact Footer) */}
                  <div className="p-1 flex items-center justify-between bg-slate-900/40 flex-1 min-h-0">
                    <span className="text-[9px] text-slate-400 capitalize truncate max-w-[45px] font-semibold pl-0.5" title={img.className}>
                      {img.className}
                    </span>
                    <button
                      onClick={() => setDeleteConfirmImage(img)}
                      className="p-0.5 rounded text-slate-500 hover:text-rose-450 hover:bg-slate-950 transition-all cursor-pointer flex items-center justify-center"
                      title="Deletar amostra de imagem"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Lightbox / Zoom Dialog Modal */}
      {activeImage && (
        <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-md z-50 flex items-center justify-center animate-in fade-in duration-200 p-4">
          <div className="relative max-w-4xl w-full flex flex-col items-center gap-4">
            <button
              onClick={() => setActiveImage(null)}
              className="absolute -top-12 right-0 p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-all cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="w-full bg-slate-900 border border-slate-850 rounded-2xl overflow-hidden shadow-2xl relative aspect-video flex items-center justify-center">
              <img
                src={activeImage.url}
                alt={activeImage.name}
                className="max-w-full max-h-full object-contain"
              />
            </div>
            <div className="text-center">
              <h4 className="text-sm font-bold text-slate-100 capitalize">
                Classe: {activeImage.className} (ID: {activeImage.classId})
              </h4>
              <p className="text-xs text-slate-500 font-mono mt-1">
                {activeImage.name} | {formatSize(activeImage.size)} | {new Date(activeImage.createdAt).toLocaleString('pt-BR')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Delete Image Confirmation Dialog Modal */}
      {deleteConfirmImage && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center animate-in fade-in duration-200 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl flex flex-col space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center space-x-3 text-rose-500">
              <AlertTriangle className="h-6 w-6" />
              <h3 className="text-md font-bold text-slate-100">Excluir Amostra do Dataset</h3>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Você deseja remover permanentemente a amostra <span className="font-mono text-slate-200">{deleteConfirmImage.name}</span>?
              <br />
              Isso apagará o arquivo de imagem e sua anotação YOLO correspondente de ambas as pastas de <strong>Treino</strong> e <strong>Validação</strong>.
            </p>
            <div className="flex justify-end space-x-2 pt-2">
              <button
                onClick={() => setDeleteConfirmImage(null)}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDeleteImage(deleteConfirmImage)}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-500 text-white transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Confirmar Exclusão
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Class Confirmation Dialog Modal */}
      {deleteConfirmClass && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center animate-in fade-in duration-200 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl flex flex-col space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center space-x-3 text-rose-500">
              <AlertTriangle className="h-6 w-6 animate-bounce" />
              <h3 className="text-md font-bold text-slate-100">Excluir Classe do Dataset</h3>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              ATENÇÃO! Você tem certeza que deseja excluir a classe <strong className="text-slate-100 capitalize">{deleteConfirmClass.name}</strong> (ID: {deleteConfirmClass.id})?
              <br /><br />
              Esta ação irá:
              <ul className="list-disc pl-4 mt-1.5 space-y-1 font-mono text-[11px] text-rose-300">
                <li>Apagar TODAS as imagens coletadas desta classe.</li>
                <li>Apagar TODAS as anotações do YOLO vinculadas.</li>
                <li>Remover a classe do arquivo de configuração <span className="text-slate-200">dataset.yaml</span>.</li>
              </ul>
            </p>
            <div className="flex justify-end space-x-2 pt-2">
              <button
                onClick={() => setDeleteConfirmClass(null)}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDeleteClass(deleteConfirmClass)}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-500 text-white transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Excluir Tudo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

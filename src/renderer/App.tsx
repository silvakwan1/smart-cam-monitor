import React, { useEffect, useState } from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import { Header } from './components/Header';
import { Dashboard } from './pages/Dashboard';
import { Settings } from './pages/Settings';
import { RecordingsPage } from './pages/RecordingsPage';
import { SnapshotsPage } from './pages/SnapshotsPage';
import { DatasetManager } from './pages/DatasetManager';
import { FolderOpen, Settings as SettingsIcon, Video, BrainCircuit } from 'lucide-react';

const App: React.FC = () => {
  const [showSetup, setShowSetup] = useState(false);
  const [settings, setSettings] = useState({
    modelPath: '',
    recordingsFolder: '',
    snapshotsFolder: '',
    datasetsFolder: '',
    enableGpu: false,
    needsConfiguration: false
  });

  useEffect(() => {
    window.electronAPI.getSettings().then((res) => {
      setSettings(res);
      if (res.needsConfiguration) {
        setShowSetup(true);
      }
    });
  }, []);

  const handleSelectFolder = async (key: 'recordingsFolder' | 'snapshotsFolder' | 'datasetsFolder') => {
    try {
      const selected = await window.electronAPI.selectDirectory(settings[key]);
      if (selected) {
        setSettings((prev) => ({ ...prev, [key]: selected }));
      }
    } catch (err) {
      console.error('Failed to select directory:', err);
    }
  };

  const handleSaveSetup = async () => {
    try {
      const updated = await window.electronAPI.saveSettings({
        ...settings,
        needsConfiguration: false
      });
      setSettings(updated);
      setShowSetup(false);
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar as configurações.');
    }
  };

  return (
    <Router>
      <div className="h-full flex flex-col bg-dark-bg text-slate-100 select-none overflow-hidden font-sans relative">
        {/* Main Application Navigation Header */}
        <Header />
        
        {/* Workspace views content routing */}
        <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/recordings" element={<RecordingsPage />} />
            <Route path="/snapshots" element={<SnapshotsPage />} />
            <Route path="/dataset" element={<DatasetManager />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>

        {showSetup && (
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-xl z-50 flex items-center justify-center p-6 select-none animate-in fade-in duration-300">
            <div className="w-full max-w-xl glass-panel border border-slate-800 rounded-3xl p-8 shadow-2xl flex flex-col space-y-6 max-h-full overflow-y-auto">
              <div className="flex items-center space-x-3.5">
                <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-brand-secondary/35 to-brand-primary/35 flex items-center justify-center shadow-xl">
                  <BrainCircuit className="h-6 w-6 text-brand-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-100 tracking-tight font-mono">Configuração Inicial</h2>
                  <p className="text-xs text-slate-400 font-medium">Configure onde armazenar seus arquivos de dados e mídia</p>
                </div>
              </div>

              <div className="bg-slate-900/40 border border-slate-850 rounded-2xl p-4.5 space-y-2.5">
                <h3 className="text-xs font-semibold text-slate-250 uppercase tracking-wider font-mono">Boas-vindas ao SmartCam Monitor</h3>
                <p className="text-xs text-slate-400 leading-relaxed font-medium">
                  Para começar, precisamos definir onde serão armazenados seus dados. Sugerimos usar as pastas padrões do seu sistema operacional abaixo para manter os arquivos organizados e evitar erros de permissão.
                </p>
              </div>

              <div className="space-y-4">
                {/* Recordings Folder */}
                <div className="flex flex-col space-y-1.5">
                  <div className="flex items-center space-x-2">
                    <Video className="h-4 w-4 text-brand-primary" />
                    <label className="text-xs font-bold text-slate-300">Diretório de Gravações de Vídeo (MP4)</label>
                  </div>
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={settings.recordingsFolder}
                      onChange={(e) => setSettings({ ...settings, recordingsFolder: e.target.value })}
                      className="flex-1 bg-slate-900 border border-slate-850 rounded-xl px-3.5 py-2.5 text-xs font-mono text-slate-300 outline-none focus:border-brand-primary"
                      placeholder="Ex: C:\Users\user\Videos\SmartCamRecordings"
                    />
                    <button
                      type="button"
                      onClick={() => handleSelectFolder('recordingsFolder')}
                      className="px-4.5 rounded-xl bg-slate-800 border border-slate-750 hover:bg-slate-750 text-slate-300 hover:text-white transition-all cursor-pointer flex items-center justify-center"
                    >
                      <FolderOpen className="h-4 w-4" />
                    </button>
                  </div>
                  <span className="text-[10px] text-slate-500 font-medium pl-1">Exemplo sugerido: Pasta padrão "Vídeos" do Windows</span>
                </div>

                {/* Snapshots Folder */}
                <div className="flex flex-col space-y-1.5">
                  <div className="flex items-center space-x-2">
                    <FolderOpen className="h-4 w-4 text-brand-secondary" />
                    <label className="text-xs font-bold text-slate-300">Diretório de Snapshots e Capturas (JPEG)</label>
                  </div>
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={settings.snapshotsFolder}
                      onChange={(e) => setSettings({ ...settings, snapshotsFolder: e.target.value })}
                      className="flex-1 bg-slate-900 border border-slate-850 rounded-xl px-3.5 py-2.5 text-xs font-mono text-slate-300 outline-none focus:border-brand-primary"
                      placeholder="Ex: C:\Users\user\Pictures\SmartCamSnapshots"
                    />
                    <button
                      type="button"
                      onClick={() => handleSelectFolder('snapshotsFolder')}
                      className="px-4.5 rounded-xl bg-slate-800 border border-slate-750 hover:bg-slate-750 text-slate-300 hover:text-white transition-all cursor-pointer flex items-center justify-center"
                    >
                      <FolderOpen className="h-4 w-4" />
                    </button>
                  </div>
                  <span className="text-[10px] text-slate-500 font-medium pl-1">Exemplo sugerido: Pasta padrão "Imagens" do Windows</span>
                </div>

                {/* Datasets Folder */}
                <div className="flex flex-col space-y-1.5">
                  <div className="flex items-center space-x-2">
                    <SettingsIcon className="h-4 w-4 text-brand-success" />
                    <label className="text-xs font-bold text-slate-300">Diretório de Datasets (Treinamento IA)</label>
                  </div>
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={settings.datasetsFolder}
                      onChange={(e) => setSettings({ ...settings, datasetsFolder: e.target.value })}
                      className="flex-1 bg-slate-900 border border-slate-850 rounded-xl px-3.5 py-2.5 text-xs font-mono text-slate-300 outline-none focus:border-brand-primary"
                      placeholder="Ex: C:\Users\user\Documents\SmartCamDatasets"
                    />
                    <button
                      type="button"
                      onClick={() => handleSelectFolder('datasetsFolder')}
                      className="px-4.5 rounded-xl bg-slate-800 border border-slate-750 hover:bg-slate-750 text-slate-300 hover:text-white transition-all cursor-pointer flex items-center justify-center"
                    >
                      <FolderOpen className="h-4 w-4" />
                    </button>
                  </div>
                  <span className="text-[10px] text-slate-500 font-medium pl-1">Exemplo sugerido: Pasta padrão "Documentos" do Windows</span>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-850 flex justify-end">
                <button
                  type="button"
                  onClick={handleSaveSetup}
                  className="px-6 py-3 rounded-xl bg-gradient-to-r from-brand-primary to-brand-secondary hover:scale-[1.02] active:scale-[0.98] text-white text-xs font-bold shadow-lg transition-all cursor-pointer flex items-center space-x-2"
                >
                  <span>Salvar e Iniciar</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Router>
  );
};

export default App;

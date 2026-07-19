import React from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import { Header } from './components/Header';
import { Dashboard } from './pages/Dashboard';
import { Settings } from './pages/Settings';
import { RecordingsPage } from './pages/RecordingsPage';
import { SnapshotsPage } from './pages/SnapshotsPage';
import { DatasetManager } from './pages/DatasetManager';

const App: React.FC = () => {
  return (
    <Router>
      <div className="h-full flex flex-col bg-dark-bg text-slate-100 select-none overflow-hidden font-sans">
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
      </div>
    </Router>
  );
};

export default App;

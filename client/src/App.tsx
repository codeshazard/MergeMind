import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Header } from './components/Header';
import { ScanPage } from './pages/ScanPage';
import { ResultPage } from './pages/ResultPage';
import { HistoryPage } from './pages/HistoryPage';
import { AnalyticsPage } from './pages/AnalyticsPage';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col bg-zinc-950 text-zinc-100 font-sans selection:bg-zinc-800 selection:text-zinc-100">
        <Header />
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<ScanPage />} />
            <Route path="/analysis/:id" element={<ResultPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <footer className="border-t border-zinc-800/60 py-6 text-center text-xs text-zinc-500 font-mono">
          MergeMind &mdash; AI-Powered Dual-Mode Git Conflict &amp; Semantic Integration Engine
        </footer>
      </div>
    </BrowserRouter>
  );
};

export default App;

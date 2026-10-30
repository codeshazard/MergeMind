import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { GitPullRequest, History, BarChart3, Radio } from 'lucide-react';
import { api } from '../lib/api';

export const Header: React.FC = () => {
  const [dbStatus, setDbStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');

  useEffect(() => {
    let isMounted = true;
    api.getHealth()
      .then((res) => {
        if (isMounted) {
          setDbStatus(res.database === 'connected' ? 'connected' : 'disconnected');
        }
      })
      .catch(() => {
        if (isMounted) setDbStatus('disconnected');
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-colors focus-ring ${
      isActive
        ? 'bg-zinc-800 text-zinc-100 shadow-xs'
        : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
    }`;

  return (
    <header className="border-b border-zinc-800/80 bg-zinc-950/90 sticky top-0 z-40 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <NavLink
            to="/"
            className="flex items-center gap-2.5 text-zinc-100 font-semibold tracking-tight text-sm focus-ring rounded"
          >
            <div className="w-7 h-7 rounded bg-zinc-900 border border-zinc-700/80 flex items-center justify-center text-zinc-200">
              <GitPullRequest className="w-4 h-4 text-emerald-400" aria-hidden="true" />
            </div>
            <span>MergeMind</span>
            <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 border border-zinc-800 px-1.5 py-0.5 rounded">
              v1.0
            </span>
          </NavLink>

          <nav className="flex items-center gap-1" aria-label="Main navigation">
            <NavLink to="/" end className={navLinkClass}>
              <GitPullRequest className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Scan</span>
            </NavLink>
            <NavLink to="/history" className={navLinkClass}>
              <History className="w-3.5 h-3.5" aria-hidden="true" />
              <span>History</span>
            </NavLink>
            <NavLink to="/analytics" className={navLinkClass}>
              <BarChart3 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Analytics</span>
            </NavLink>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono bg-zinc-900/80 border border-zinc-800"
            title={`Database: ${dbStatus}`}
          >
            <Radio
              className={`w-3 h-3 ${
                dbStatus === 'connected'
                  ? 'text-emerald-400'
                  : dbStatus === 'checking'
                  ? 'text-amber-400'
                  : 'text-rose-400'
              }`}
              aria-hidden="true"
            />
            <span className="text-zinc-400 text-[11px]">
              {dbStatus === 'connected' ? 'DB Active' : dbStatus === 'checking' ? 'Connecting' : 'DB Offline'}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};

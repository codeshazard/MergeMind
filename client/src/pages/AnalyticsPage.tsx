import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  BarChart3,
  ShieldAlert,
  AlertTriangle,
  GitPullRequest,
  ArrowRight,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import { api } from '../lib/api';
import type { DashboardStats } from '../lib/types';

export const AnalyticsPage: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    api.getStats()
      .then((data) => {
        if (isMounted) {
          setStats(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to load analytics.');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const CONFLICT_COLORS: Record<string, string> = {
    Textual: '#f43f5e',
    Semantic: '#f59e0b',
    None: '#10b981',
  };

  const RISK_COLORS: Record<string, string> = {
    High: '#f43f5e',
    Medium: '#f59e0b',
    Low: '#10b981',
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
          Repository Health & Conflict Metrics
        </h1>
        <p className="text-xs text-zinc-400 mt-1">
          Historical overview of conflict modes, risk severity, and semantic regressions caught before landing.
        </p>
      </div>

      {loading ? (
        <div className="p-20 text-center text-xs font-mono text-zinc-500">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-zinc-400" aria-hidden="true" />
          <span>Compiling repository telemetry...</span>
        </div>
      ) : error ? (
        <div className="p-4 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs text-center">
          {error}
        </div>
      ) : !stats || stats.total_monitored === 0 ? (
        <div className="p-16 rounded-xl border border-dashed border-zinc-800 text-center space-y-3">
          <BarChart3 className="w-8 h-8 text-zinc-600 mx-auto" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-zinc-300">No Analytics Available</h2>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto">
            Scan your first pull request to begin tracking repository conflict distributions and pass rates.
          </p>
          <div className="pt-2">
            <Link
              to="/"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors focus-ring"
            >
              <span>Scan a PR Now</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Headline Numbers */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-900/60 shadow-xs">
              <div className="flex items-center justify-between text-zinc-400 mb-2">
                <span className="text-xs font-medium uppercase tracking-wider">Total PRs Inspected</span>
                <GitPullRequest className="w-4 h-4 text-zinc-500" aria-hidden="true" />
              </div>
              <div className="text-3xl font-bold font-mono text-zinc-100">
                {stats.total_monitored}
              </div>
              <p className="text-[11px] text-zinc-500 mt-1">Across all connected repositories</p>
            </div>

            <div className="p-5 rounded-xl border border-amber-500/30 bg-amber-500/5 shadow-xs">
              <div className="flex items-center justify-between text-amber-400 mb-2">
                <span className="text-xs font-medium uppercase tracking-wider">Semantic Drift Caught</span>
                <AlertTriangle className="w-4 h-4 text-amber-400" aria-hidden="true" />
              </div>
              <div className="text-3xl font-bold font-mono text-amber-300">
                {stats.semantic_caught}
              </div>
              <p className="text-[11px] text-zinc-400 mt-1">
                {stats.total_monitored > 0
                  ? `${Math.round((stats.semantic_caught / stats.total_monitored) * 100)}% of PRs had silent contract drift`
                  : '0% of inspected PRs'}
              </p>
            </div>

            <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-900/60 shadow-xs">
              <div className="flex items-center justify-between text-zinc-400 mb-2">
                <span className="text-xs font-medium uppercase tracking-wider">High Risk PRs</span>
                <ShieldAlert className="w-4 h-4 text-rose-400" aria-hidden="true" />
              </div>
              <div className="text-3xl font-bold font-mono text-rose-400">
                {stats.risk_breakdown.find((r) => r.name === 'High')?.value || 0}
              </div>
              <p className="text-[11px] text-zinc-500 mt-1">Required multi-file caller repairs</p>
            </div>

            <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-900/60 shadow-xs">
              <div className="flex items-center justify-between text-zinc-400 mb-2">
                <span className="text-xs font-medium uppercase tracking-wider">Clean / Auto-Merge</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" aria-hidden="true" />
              </div>
              <div className="text-3xl font-bold font-mono text-emerald-400">
                {stats.conflict_breakdown.find((c) => c.name === 'None')?.value || 0}
              </div>
              <p className="text-[11px] text-zinc-500 mt-1">Directly compatible with zero risk</p>
            </div>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Donut Chart: Conflict Breakdown */}
            <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-900/50 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-zinc-200">
                    Conflict Distribution
                  </h2>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Proportion of Textual, Semantic, and Clean integrations
                  </p>
                </div>
              </div>

              <div className="h-64 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart aria-label="Conflict breakdown donut chart">
                    <Pie
                      data={stats.conflict_breakdown}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={65}
                      outerRadius={95}
                      stroke="#09090b"
                      strokeWidth={3}
                    >
                      {stats.conflict_breakdown.map((entry) => (
                        <Cell
                          key={entry.name}
                          fill={CONFLICT_COLORS[entry.name] || '#71717a'}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#18181b',
                        borderColor: '#27272a',
                        borderRadius: '8px',
                        color: '#f4f4f5',
                        fontSize: '12px',
                        fontFamily: 'ui-monospace, monospace',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Accessible Legend & Table */}
              <div className="border-t border-zinc-800/80 pt-3">
                <div className="grid grid-cols-3 gap-2 text-center">
                  {stats.conflict_breakdown.map((item) => (
                    <div key={item.name} className="p-2 rounded bg-zinc-950 border border-zinc-800/80">
                      <div className="flex items-center justify-center gap-1.5 mb-1">
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: CONFLICT_COLORS[item.name] || '#71717a' }}
                          aria-hidden="true"
                        ></span>
                        <span className="text-xs text-zinc-300 font-medium">{item.name}</span>
                      </div>
                      <span className="font-mono text-sm font-bold text-zinc-100">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Bar Chart: Risk Severity Breakdown */}
            <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-900/50 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-zinc-200">
                    Risk Severity Breakdown
                  </h2>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Count of PRs categorized by potential blast radius
                  </p>
                </div>
              </div>

              <div className="h-64 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={stats.risk_breakdown}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                    aria-label="Risk score bar chart"
                  >
                    <XAxis
                      dataKey="name"
                      stroke="#71717a"
                      fontSize={12}
                      tickLine={false}
                      axisLine={{ stroke: '#27272a' }}
                    />
                    <YAxis
                      stroke="#71717a"
                      fontSize={12}
                      tickLine={false}
                      axisLine={{ stroke: '#27272a' }}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#18181b',
                        borderColor: '#27272a',
                        borderRadius: '8px',
                        color: '#f4f4f5',
                        fontSize: '12px',
                        fontFamily: 'ui-monospace, monospace',
                      }}
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {stats.risk_breakdown.map((entry) => (
                        <Cell
                          key={entry.name}
                          fill={RISK_COLORS[entry.name] || '#71717a'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Accessible Legend & Table */}
              <div className="border-t border-zinc-800/80 pt-3">
                <div className="grid grid-cols-3 gap-2 text-center">
                  {stats.risk_breakdown.map((item) => (
                    <div key={item.name} className="p-2 rounded bg-zinc-950 border border-zinc-800/80">
                      <div className="flex items-center justify-center gap-1.5 mb-1">
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: RISK_COLORS[item.name] || '#71717a' }}
                          aria-hidden="true"
                        ></span>
                        <span className="text-xs text-zinc-300 font-medium">{item.name}</span>
                      </div>
                      <span className="font-mono text-sm font-bold text-zinc-100">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

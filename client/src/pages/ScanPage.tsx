import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Search,
  Loader2,
  ArrowRight,
  AlertCircle,
  RefreshCw,
  GitPullRequest,
  Calendar,
  Copy,
  Check,
  Sparkles,
} from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { getAnalysisId, type Analysis } from '../lib/types';
import { parsePrInput } from '../lib/parsePr';
import { DEMO_PR_PRESETS, type DemoPrPreset } from '../lib/constants';
import { ConflictBadge, RiskBadge } from '../components/Badge';

export const ScanPage: React.FC = () => {
  const navigate = useNavigate();
  const [inputVal, setInputVal] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [progressStep, setProgressStep] = useState<string>('');
  const [recentScans, setRecentScans] = useState<Analysis[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [copiedPresetId, setCopiedPresetId] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    let isMounted = true;
    api.getHistory(5)
      .then((scans) => {
        if (isMounted) {
          setRecentScans(scans);
          setRecentLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) setRecentLoading(false);
      });

    return () => {
      isMounted = false;
      timerRef.current.forEach(clearTimeout);
    };
  }, []);

  const handleCopyUrl = (preset: DemoPrPreset, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(preset.url);
    setCopiedPresetId(preset.id);
    setTimeout(() => {
      setCopiedPresetId(null);
    }, 2000);
  };

  const handleSelectPreset = (url: string) => {
    setInputVal(url);
    setError(null);
  };

  const handleScan = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    setError(null);
    const parsed = parsePrInput(inputVal);
    if (!parsed) {
      setError('Please provide a valid GitHub PR URL (e.g. https://github.com/owner/repo/pull/1) or shorthand owner/repo#1.');
      return;
    }

    setLoading(true);
    setProgressStep('Fetching Pull Request metadata...');

    // Clear previous timers
    timerRef.current.forEach(clearTimeout);
    timerRef.current = [];

    // Stage progression feedback
    const t1 = setTimeout(() => {
      setProgressStep('Traversing repository tree & finding callers...');
    }, 2000);

    const t2 = setTimeout(() => {
      setProgressStep('Evaluating semantic drift with Google Gemini...');
    }, 4500);

    timerRef.current = [t1, t2];

    try {
      const result = await api.scan(parsed.repo_url, parsed.pr_number);
      const targetId = getAnalysisId(result);
      if (targetId) {
        navigate(`/analysis/${targetId}`);
      } else {
        throw new Error('Analysis completed but did not return a valid identifier.');
      }
    } catch (err) {
      timerRef.current.forEach(clearTimeout);
      setLoading(false);
      setProgressStep('');
      if (err instanceof ApiError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred during scan.');
      }
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
      {/* Title block */}
      <div className="text-center mb-10">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-100">
          Autonomous PR Conflict Intelligence
        </h1>
        <p className="mt-3 text-sm sm:text-base text-zinc-400 max-w-xl mx-auto leading-relaxed">
          Inspect Pull Requests on demand. Detect raw line collisions and subtle semantic signature drift,
          with indicative test integrity assertions and one-click integration branches.
        </p>
      </div>

      {/* Hero Scan Input */}
      <form onSubmit={handleScan} className="space-y-3">
        <div className="relative flex flex-col sm:flex-row items-stretch gap-2.5 p-2 rounded-xl bg-zinc-900/90 border border-zinc-800 shadow-xl focus-within:border-zinc-700 transition-colors">
          <div className="relative flex-1 flex items-center min-w-0">
            <Search className="absolute left-3.5 w-4 h-4 text-zinc-500 pointer-events-none" aria-hidden="true" />
            <input
              type="text"
              value={inputVal}
              onChange={(e) => {
                setInputVal(e.target.value);
                if (error) setError(null);
              }}
              disabled={loading}
              placeholder="https://github.com/owner/repo/pull/123 or owner/repo#123"
              className="w-full bg-transparent pl-10 pr-4 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 rounded-lg focus-ring disabled:opacity-50 disabled:cursor-not-allowed font-mono"
              aria-label="GitHub Pull Request URL or identifier"
              aria-invalid={error ? 'true' : 'false'}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !inputVal.trim()}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-zinc-100 text-zinc-950 hover:bg-white active:bg-zinc-200 text-xs font-semibold rounded-lg transition-colors focus-ring disabled:opacity-40 disabled:pointer-events-none shrink-0 cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-950" aria-hidden="true" />
                <span>Scanning...</span>
              </>
            ) : (
              <>
                <span>Scan for Conflicts</span>
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </>
            )}
          </button>
        </div>

        {/* Inline Error Message */}
        {error && (
          <div
            role="alert"
            className="p-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs flex items-start gap-2.5 animate-in fade-in duration-200"
          >
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" aria-hidden="true" />
            <div className="flex-1">
              <span className="font-semibold">Scan Error: </span>
              {error}
            </div>
            <button
              type="button"
              onClick={() => handleScan()}
              className="text-xs font-medium text-rose-200 hover:text-white underline inline-flex items-center gap-1 shrink-0 focus-ring rounded cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" aria-hidden="true" />
              <span>Retry</span>
            </button>
          </div>
        )}

        {/* Aria-live Progress Feedback */}
        <div aria-live="polite" className="h-6 flex items-center justify-center">
          {loading && (
            <p className="text-xs font-mono text-zinc-400 inline-flex items-center gap-2 animate-pulse">
              <span className="w-2 h-2 rounded-full bg-emerald-400" aria-hidden="true"></span>
              {progressStep}
            </p>
          )}
        </div>
      </form>

      {/* Preset Demo PRs Shortcut List */}
      <div className="mt-4 p-4 rounded-xl border border-zinc-800/80 bg-zinc-900/40 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
            <span>Preset Demo PR Shortcuts</span>
          </span>
          <span className="text-[11px] text-zinc-500">Click to load or copy URL</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {DEMO_PR_PRESETS.map((preset) => {
            const isCopied = copiedPresetId === preset.id;
            return (
              <div
                key={preset.id}
                onClick={() => handleSelectPreset(preset.url)}
                className="group relative p-3 rounded-lg border border-zinc-800/80 bg-zinc-950/60 hover:bg-zinc-900 hover:border-zinc-700 transition-all cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="text-xs font-semibold text-zinc-200 font-mono group-hover:text-white truncate">
                      {preset.label}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => handleCopyUrl(preset, e)}
                      title="Copy PR URL"
                      className="p-1 rounded bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100 transition-colors shrink-0 focus-ring cursor-pointer"
                      aria-label={`Copy ${preset.label} URL`}
                    >
                      {isCopied ? (
                        <Check className="w-3 h-3 text-emerald-400" aria-hidden="true" />
                      ) : (
                        <Copy className="w-3 h-3" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                  <div className="text-[11px] text-zinc-400 leading-snug line-clamp-2">
                    {preset.description}
                  </div>
                </div>

                <div className="mt-2.5 flex items-center justify-between text-[10px]">
                  <span className="px-1.5 py-0.5 rounded border border-zinc-700/60 bg-zinc-800/60 text-zinc-300 font-mono">
                    {preset.badge}
                  </span>
                  <span className="text-zinc-500 group-hover:text-zinc-300 transition-colors flex items-center gap-0.5">
                    {isCopied ? 'Copied!' : 'Use PR \u2192'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent Scans Section */}
      <section className="mt-12 border-t border-zinc-800/80 pt-8" aria-labelledby="recent-heading">
        <div className="flex items-center justify-between mb-4">
          <h2 id="recent-heading" className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Recent Inspections
          </h2>
          <Link
            to="/history"
            className="text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors focus-ring rounded"
          >
            View all history &rarr;
          </Link>
        </div>

        {recentLoading ? (
          <div className="py-8 text-center text-xs text-zinc-500 font-mono">
            Loading recent analyses...
          </div>
        ) : recentScans.length === 0 ? (
          <div className="p-6 rounded-lg border border-dashed border-zinc-800 text-center">
            <p className="text-xs text-zinc-500">
              No PR scans performed yet. Enter a GitHub PR above or try a demo shortcut to start.
            </p>
          </div>
        ) : (
          <div className="border border-zinc-800/80 rounded-lg overflow-hidden divide-y divide-zinc-800/60 bg-zinc-900/40">
            {recentScans.map((scan, idx) => {
              const scanId = getAnalysisId(scan);
              const formattedDate = scan.created_at
                ? new Date(scan.created_at).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : 'Recent';

              const content = (
                <>
                  <div className="flex items-start sm:items-center gap-3 min-w-0">
                    <div className="p-1.5 rounded bg-zinc-800/80 text-zinc-300 shrink-0">
                      <GitPullRequest className="w-3.5 h-3.5 text-zinc-400" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-zinc-400">
                          {scan.repo_owner}/{scan.repo_name}#{scan.pr_number}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-zinc-200 truncate group-hover:text-white transition-colors">
                        {scan.pr_title}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-auto">
                    <ConflictBadge type={scan.conflict_type} size="sm" />
                    <RiskBadge score={scan.risk_score} size="sm" />
                    <span className="text-[11px] font-mono text-zinc-500 flex items-center gap-1 pl-1">
                      <Calendar className="w-3 h-3 text-zinc-600" aria-hidden="true" />
                      {formattedDate}
                    </span>
                  </div>
                </>
              );

              if (!scanId) {
                return (
                  <div
                    key={`scan-${idx}`}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 bg-zinc-900/40 text-zinc-400 gap-3"
                  >
                    {content}
                  </div>
                );
              }

              return (
                <Link
                  key={scanId}
                  to={`/analysis/${scanId}`}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 hover:bg-zinc-900/90 transition-colors gap-3 group focus-ring"
                >
                  {content}
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import ReactDiffViewer from 'react-diff-viewer-continued';

// Interop helper to resolve ReactDiffViewer whether bundled as ESM default or CJS module.exports.default
const DiffViewer: React.ComponentType<any> =
  typeof (ReactDiffViewer as any)?.default === 'function'
    ? (ReactDiffViewer as any).default
    : typeof ReactDiffViewer === 'function'
    ? (ReactDiffViewer as any)
    : (ReactDiffViewer as any)?.default?.default || (ReactDiffViewer as any)?.default || ReactDiffViewer;
import {
  GitPullRequest,
  GitBranch,
  ArrowLeft,
  FileCode,
  ShieldCheck,
  CheckCircle,
  XCircle,
  ExternalLink,
  Copy,
  Check,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Loader2,
  FileQuestion,
  History,
  RotateCcw,
  AlertCircle,
  Info,
  HelpCircle,
} from 'lucide-react';
import { api, ApiError } from '../lib/api';
import type { Analysis, IntegrateResponse } from '../lib/types';
import { ConflictBadge, RiskBadge, IntegrationBadge } from '../components/Badge';

export const ResultPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isNotFound, setIsNotFound] = useState(false);
  const [notFoundMessage, setNotFoundMessage] = useState<string | null>(null);

  // Diff viewer file tab
  const [activeFileIndex, setActiveFileIndex] = useState(0);

  // Integration state
  const [showConfirm, setShowConfirm] = useState(false);
  const [integrating, setIntegrating] = useState(false);
  const [integrationResult, setIntegrationResult] = useState<IntegrateResponse | null>(null);
  const [copiedSha, setCopiedSha] = useState(false);

  const isValidObjectId = (val?: string): boolean => {
    return Boolean(val && /^[0-9a-fA-F]{24}$/.test(val.trim()));
  };

  const loadAnalysis = useCallback(() => {
    if (!id || !isValidObjectId(id)) {
      setIsNotFound(true);
      setNotFoundMessage('Invalid analysis ID format. Inspection IDs must be 24-character hexadecimal strings.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setIsNotFound(false);
    setNotFoundMessage(null);

    api.getAnalysis(id.trim())
      .then((data) => {
        setAnalysis(data);
        setLoading(false);
        // If already branch created, populate result view
        if (data.integration_status === 'BRANCH_CREATED' && data.integration_branch) {
          const files = (data.resolved_files ?? []).map((f) => f.filename);
          setIntegrationResult({
            success: true,
            branch: data.integration_branch,
            commit_sha: 'HEAD',
            files_committed: files,
          });
        }
      })
      .catch((err) => {
        setLoading(false);
        if (err instanceof ApiError && (err.status === 400 || err.status === 404)) {
          setIsNotFound(true);
          setNotFoundMessage(err.message || 'The requested analysis record was not found.');
        } else {
          setError(err instanceof Error ? err.message : 'Failed to load analysis details.');
        }
      });
  }, [id]);

  useEffect(() => {
    loadAnalysis();
  }, [loadAnalysis]);

  const handleIntegrate = async () => {
    if (!analysis || !id) return;
    setIntegrating(true);
    setError(null);

    const resolved = analysis.resolved_files ?? [];

    try {
      const res = await api.integrate(id.trim());
      setIntegrationResult(res);
      setAnalysis({
        ...analysis,
        integration_status: 'BRANCH_CREATED',
        integration_branch: res.branch,
      });
      setShowConfirm(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Already created; extract branch from message or state
        const branchName = analysis.integration_branch || `mergemind/patch-pr-${analysis.pr_number}`;
        setIntegrationResult({
          success: true,
          branch: branchName,
          commit_sha: 'EXISTING',
          files_committed: resolved.map((f) => f.filename),
        });
        setAnalysis({
          ...analysis,
          integration_status: 'BRANCH_CREATED',
          integration_branch: branchName,
        });
        setShowConfirm(false);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to create integration branch.');
      }
    } finally {
      setIntegrating(false);
    }
  };

  const copySha = (sha: string) => {
    navigator.clipboard.writeText(sha);
    setCopiedSha(true);
    setTimeout(() => setCopiedSha(false), 2000);
  };

  const diffCustomStyles = {
    variables: {
      dark: {
        diffViewerBackground: '#09090b',
        diffViewerColor: '#f4f4f5',
        addedBackground: '#064e3b33',
        addedColor: '#a7f3d0',
        removedBackground: '#88133733',
        removedColor: '#fecdd3',
        wordAddedBackground: '#04785755',
        wordRemovedBackground: '#be123c55',
        addedGutterBackground: '#064e3b44',
        removedGutterBackground: '#88133744',
        gutterBackground: '#0c0c0f',
        gutterBackgroundDark: '#0c0c0f',
        highlightBackground: '#27272a',
        highlightGutterBackground: '#27272a',
        codeFoldGutterBackground: '#18181b',
        codeFoldBackground: '#18181b',
        emptyLineBackground: '#09090b',
        gutterColor: '#71717a',
        addedGutterColor: '#34d399',
        removedGutterColor: '#fb7185',
      },
    },
    line: {
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      fontSize: '12px',
      lineHeight: '1.6',
    },
    gutter: {
      padding: '0 8px',
      minWidth: '40px',
    },
  };

  // 1. Loading Skeleton View
  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8 animate-pulse" aria-busy="true" aria-label="Loading analysis">
        <div className="flex items-center justify-between">
          <div className="h-4 w-24 bg-zinc-800 rounded"></div>
          <div className="h-5 w-24 bg-zinc-800 rounded"></div>
        </div>
        <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-4">
          <div className="flex flex-col sm:flex-row justify-between gap-4">
            <div className="space-y-2">
              <div className="h-3 w-40 bg-zinc-800 rounded"></div>
              <div className="h-6 w-72 bg-zinc-800 rounded"></div>
            </div>
            <div className="flex gap-2">
              <div className="h-6 w-20 bg-zinc-800 rounded"></div>
              <div className="h-6 w-20 bg-zinc-800 rounded"></div>
            </div>
          </div>
          <div className="h-4 w-52 bg-zinc-800/80 rounded"></div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 p-6 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-3">
            <div className="h-4 w-48 bg-zinc-800 rounded"></div>
            <div className="h-3 w-full bg-zinc-800/60 rounded"></div>
            <div className="h-3 w-5/6 bg-zinc-800/60 rounded"></div>
          </div>
          <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-3">
            <div className="h-4 w-36 bg-zinc-800 rounded"></div>
            <div className="h-12 w-full bg-zinc-800/60 rounded"></div>
          </div>
        </div>
        <div className="h-64 rounded-xl border border-zinc-800 bg-zinc-950/60 flex items-center justify-center text-zinc-500 font-mono text-xs">
          <Loader2 className="w-5 h-5 animate-spin mr-2 text-zinc-400" aria-hidden="true" />
          <span>Loading split diff &amp; AST verification...</span>
        </div>
      </div>
    );
  }

  // 2. Scan Not Found View (Invalid ID or 400/404)
  if (isNotFound) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center space-y-5">
        <div className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto text-zinc-400">
          <FileQuestion className="w-6 h-6 text-zinc-400" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-zinc-100">Scan Not Found</h1>
          <p className="text-xs text-zinc-400 mt-1.5 max-w-sm mx-auto">
            {notFoundMessage || 'The requested analysis record does not exist or the identifier is invalid.'}
          </p>
        </div>
        <div className="flex items-center justify-center gap-3 pt-2">
          <Link
            to="/history"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-100 text-zinc-950 hover:bg-white text-xs font-semibold transition-colors focus-ring"
          >
            <History className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Browse History</span>
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 text-xs font-medium transition-colors focus-ring"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            <span>New Scan</span>
          </Link>
        </div>
      </div>
    );
  }

  // 3. Network or Server Error State with Retry
  if (error && !analysis) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center space-y-5">
        <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs">
          <p className="font-semibold text-sm mb-1">Failed to retrieve analysis record</p>
          <p>{error}</p>
        </div>
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={loadAnalysis}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-100 text-zinc-950 hover:bg-white text-xs font-semibold transition-colors focus-ring"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Retry</span>
          </button>
          <Link
            to="/history"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 text-xs font-medium transition-colors focus-ring"
          >
            <History className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Back to History</span>
          </Link>
        </div>
      </div>
    );
  }

  if (!analysis) return null;

  // Defensive array access & fallbacks
  const resolvedFiles = analysis.resolved_files ?? [];
  const currentResolvedFile = resolvedFiles[activeFileIndex] ?? resolvedFiles[0] ?? null;
  const fileDiffs = analysis.file_diffs ?? [];
  const isPrChangedFile = Boolean(
    currentResolvedFile && fileDiffs.some((f) => f?.filename === currentResolvedFile?.filename)
  );
  const contextFiles = analysis.context_files ?? [];
  const testAssertions = analysis.test_assertions ?? [];
  const originalContent = currentResolvedFile?.original_content ?? null;

  // Separate root explanation and assumption to confirm
  const parseExplanationAndAssumption = (text: string) => {
    if (!text) return { rootExplanation: '', assumption: null };
    const marker = /(?:Assumption to confirm:?|\*\*Assumption to confirm:?\*\*)/i;
    const match = text.match(marker);
    if (match && match.index !== undefined) {
      const rootExplanation = text.slice(0, match.index).trim();
      const assumption = text.slice(match.index + match[0].length).trim();
      return { rootExplanation: rootExplanation || text, assumption: assumption || null };
    }
    return { rootExplanation: text, assumption: null };
  };

  const { rootExplanation, assumption } = parseExplanationAndAssumption(analysis.explanation || '');

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* Back button and breadcrumb */}
      <div className="flex items-center justify-between">
        <Link
          to="/history"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors focus-ring rounded"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Back to History</span>
        </Link>

        <div className="flex items-center gap-2">
          <IntegrationBadge status={analysis.integration_status} size="sm" />
        </div>
      </div>

      {/* Status Header */}
      <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-900/50 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-zinc-400 mb-1">
              <span>{analysis.repo_owner}</span>
              <span>/</span>
              <span className="text-zinc-200 font-semibold">{analysis.repo_name}</span>
              <span className="text-zinc-600">|</span>
              <span className="text-zinc-300">PR #{analysis.pr_number}</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-zinc-100 tracking-tight">
              {analysis.pr_title}
            </h1>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <ConflictBadge type={analysis.conflict_type} size="md" />
            <RiskBadge score={analysis.risk_score} size="md" />
          </div>
        </div>

        {/* State Notice & Truncation Warnings */}
        {analysis.conflict_type === 'TEXTUAL' && analysis.github_mergeable_state === 'dirty' && (
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-medium">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" aria-hidden="true" />
            <span>GitHub reports merge conflicts on this PR</span>
          </div>
        )}

        {analysis.truncated && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs">
            <Info className="w-3.5 h-3.5 shrink-0 text-amber-400" aria-hidden="true" />
            <span>Analysis input was truncated to fit context limits.</span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-mono text-zinc-400">
          <div className="flex items-center gap-1.5">
            <GitPullRequest className="w-3.5 h-3.5 text-zinc-500" aria-hidden="true" />
            <span>Target:</span>
            <span className="text-zinc-200 bg-zinc-800/80 px-1.5 py-0.5 rounded border border-zinc-700/60">
              {analysis.base_branch || 'main'}
            </span>
            <span>&larr;</span>
            <span className="text-zinc-200 bg-zinc-800/80 px-1.5 py-0.5 rounded border border-zinc-700/60">
              {analysis.compare_branch || 'feature'}
            </span>
          </div>

          <div className="text-zinc-500">
            Scanned on {analysis.created_at ? new Date(analysis.created_at).toLocaleString() : 'N/A'}
          </div>
        </div>
      </div>

      {/* Explanation Block + Caller Context Callout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 p-6 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2 mb-2">
              <FileText className="w-4 h-4 text-zinc-400" aria-hidden="true" />
              <span>Conflict Root Cause &amp; Analysis</span>
            </h2>
            <p className="text-sm text-zinc-300 leading-relaxed font-sans">
              {rootExplanation || 'No detailed conflict explanation provided for this record.'}
            </p>
          </div>

          {/* Assumption to confirm (for TEXTUAL and SEMANTIC conflicts) */}
          {analysis.conflict_type !== 'NONE' && (
            <div className="p-4 rounded-lg bg-zinc-950/70 border border-amber-500/30 space-y-1.5 animate-in fade-in duration-200">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                <HelpCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Assumption to confirm</span>
              </h3>
              <p className="text-xs text-zinc-300 leading-relaxed font-sans">
                {assumption ||
                  'The synthesized resolution assumes the new signature/behavior was intentional and updates downstream callers accordingly. Confirm with the PR author whether caller expectations should be adapted or if original semantics must be preserved.'}
              </p>
            </div>
          )}
        </div>

        {/* Proof of Caller-Context Detection */}
        <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-900/60 flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
              <span>Downstream Impact Check</span>
            </h2>
            <p className="text-xs text-zinc-400 mb-3">
              External files analyzed outside this PR:
            </p>

            {contextFiles.length > 0 ? (
              <ul className="space-y-2">
                {contextFiles.map((cf, idx) => (
                  <li
                    key={idx}
                    className="p-2.5 rounded bg-zinc-950/80 border border-zinc-800/80 text-xs font-mono"
                  >
                    <div className="text-zinc-200 font-semibold truncate">{cf.filename}</div>
                    <div className="text-amber-400/90 text-[11px] mt-0.5">{cf.reason}</div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-3 rounded bg-zinc-950/50 border border-zinc-800 text-xs text-zinc-500">
                No external callers impacted outside this PR diff set.
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-zinc-800/80 text-[11px] text-zinc-500">
            Caller-context AST extraction inspects functions &amp; exports across the full base tree.
          </div>
        </div>
      </div>

      {/* Multi-File Resolution Diff Viewer */}
      <section className="space-y-3" aria-labelledby="diff-heading">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 id="diff-heading" className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
            <FileCode className="w-4 h-4 text-zinc-400" aria-hidden="true" />
            <span>Resolved Files &amp; Split Diff</span>
          </h2>

          {/* File Tabs */}
          {resolvedFiles.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Resolved files">
              {resolvedFiles.map((file, idx) => {
                const isPr = fileDiffs.some((f) => f?.filename === file.filename);
                const isActive = idx === activeFileIndex;

                return (
                  <button
                    key={file.filename || idx}
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setActiveFileIndex(idx)}
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono transition-colors focus-ring border ${
                      isActive
                        ? 'bg-zinc-800 border-zinc-600 text-zinc-100 shadow-xs'
                        : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
                    }`}
                  >
                    <span className="truncate max-w-[160px]">{file.filename}</span>
                    <span
                      className={`text-[10px] px-1 py-0.2 rounded uppercase tracking-wider ${
                        isPr ? 'bg-zinc-700/50 text-zinc-300' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      }`}
                    >
                      {isPr ? 'PR' : 'Caller'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Diff Container */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden shadow-inner">
          {resolvedFiles.length === 0 ? (
            <div className="p-8 text-center text-xs font-mono text-zinc-500">
              No resolved file modifications recorded for this inspection.
            </div>
          ) : (
            <>
              <div className="bg-zinc-900/90 border-b border-zinc-800 px-4 py-2.5 flex items-center justify-between text-xs font-mono">
                <div className="flex items-center gap-2">
                  <span className="text-zinc-200 font-semibold">{currentResolvedFile?.filename}</span>
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded ${
                      isPrChangedFile
                        ? 'bg-zinc-800 text-zinc-300 border border-zinc-700/80'
                        : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                    }`}
                  >
                    {isPrChangedFile ? 'Changed in PR' : 'Downstream Caller Repaired by MergeMind'}
                  </span>
                </div>

                <div className="text-zinc-500 hidden sm:block">
                  {originalContent !== null ? 'Original vs MergeMind Clean Resolution' : 'Clean Resolution Only'}
                </div>
              </div>

              <div className="overflow-x-auto text-xs font-mono">
                {originalContent !== null ? (
                  <DiffViewer
                    oldValue={originalContent}
                    newValue={currentResolvedFile?.content || ''}
                    splitView={true}
                    useDarkTheme={true}
                    styles={diffCustomStyles}
                    leftTitle="Original Source"
                    rightTitle="MergeMind Integrated Resolution"
                  />
                ) : (
                  <div className="p-4 space-y-2">
                    <div className="p-2.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-sans">
                      Original source content was not present on disk (newly generated file). Showing integrated content below:
                    </div>
                    <pre className="p-4 bg-zinc-950 rounded text-zinc-200 text-xs overflow-x-auto">
                      {currentResolvedFile?.content || ''}
                    </pre>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </section>

      {/* Test Verification Console (Indicative LLM Assertions) */}
      <section className="space-y-3" aria-labelledby="tests-heading">
        <div className="flex items-center justify-between">
          <h2 id="tests-heading" className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" aria-hidden="true" />
            <span>Pre-Merge Test Verification Checks</span>
          </h2>
          <span className="text-[11px] font-mono text-zinc-400 border border-zinc-800 px-2 py-0.5 rounded bg-zinc-900">
            LLM-evaluated, not executed
          </span>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 space-y-2.5 font-mono text-xs">
          {testAssertions.length > 0 ? (
            testAssertions.map((item, idx) => (
              <div
                key={idx}
                className="flex items-start sm:items-center justify-between p-2.5 rounded bg-zinc-900/60 border border-zinc-800/80 gap-3"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {item.status === 'PASS' ? (
                    <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-400 shrink-0" aria-hidden="true" />
                  )}
                  <span className="text-zinc-200 truncate">{item.assertion}</span>
                </div>

                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                    item.status === 'PASS'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                  }`}
                >
                  {item.status}
                </span>
              </div>
            ))
          ) : (
            <div className="text-zinc-500 text-xs py-2 text-center font-sans">
              No indicative verification checks generated for this scan.
            </div>
          )}
        </div>
      </section>

      {/* Primary Action / Integration Section */}
      <section className="border-t border-zinc-800 pt-6">
        {integrationResult ? (
          <div className="p-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 space-y-4 animate-in fade-in">
            <div className="flex items-center gap-2 text-emerald-400 font-semibold text-base">
              <CheckCircle2 className="w-5 h-5 shrink-0" aria-hidden="true" />
              <span>Integration Branch Published to GitHub!</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
              <div className="p-3 rounded bg-zinc-950/80 border border-zinc-800/80">
                <span className="text-zinc-400 block mb-1">Branch Reference:</span>
                <span className="text-zinc-100 font-bold">{integrationResult.branch}</span>
              </div>

              <div className="p-3 rounded bg-zinc-950/80 border border-zinc-800/80 flex items-center justify-between">
                <div>
                  <span className="text-zinc-400 block mb-1">Latest Commit SHA:</span>
                  <span className="text-zinc-100 font-bold">
                    {integrationResult.commit_sha.slice(0, 7)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => copySha(integrationResult.commit_sha)}
                  className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors focus-ring"
                  title="Copy full commit SHA"
                >
                  {copiedSha ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
              <div className="text-xs text-zinc-400">
                <span>Committed files: </span>
                <span className="text-zinc-200 font-mono">
                  {(integrationResult.files_committed ?? []).join(', ') || 'None'}
                </span>
              </div>

              <a
                href={`https://github.com/${analysis.repo_owner}/${analysis.repo_name}/tree/${integrationResult.branch}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 text-zinc-950 hover:bg-emerald-400 text-xs font-bold transition-colors focus-ring"
              >
                <span>Inspect Branch on GitHub</span>
                <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
              </a>
            </div>
          </div>
        ) : showConfirm ? (
          <div className="p-6 rounded-xl border border-zinc-700 bg-zinc-900/90 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">
                Confirm One-Click Branch Creation
              </h3>
              <p className="text-xs text-zinc-400 mt-1">
                MergeMind will create a new reference{' '}
                <code className="text-zinc-200 font-mono">mergemind/patch-pr-{analysis.pr_number}</code> on{' '}
                <span className="text-zinc-200">{analysis.repo_owner}/{analysis.repo_name}</span> and commit all{' '}
                {resolvedFiles.length} clean resolved files.
              </p>
            </div>

            {error && (
              <div className="p-3 rounded bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                {error}
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={integrating}
                onClick={handleIntegrate}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 text-zinc-950 hover:bg-emerald-400 active:bg-emerald-600 text-xs font-bold transition-colors focus-ring disabled:opacity-50"
              >
                {integrating ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                    <span>Publishing Branch to GitHub...</span>
                  </>
                ) : (
                  <>
                    <GitBranch className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Confirm &amp; Push Branch</span>
                  </>
                )}
              </button>

              <button
                type="button"
                disabled={integrating}
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 rounded-lg border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 text-xs font-medium transition-colors focus-ring"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-zinc-800 bg-zinc-900/40">
            <div>
              <h3 className="text-sm font-semibold text-zinc-200">
                Ready to Integrate Resolution
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Publish a clean patch branch directly to GitHub with zero line or interface collisions.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowConfirm(true)}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-zinc-100 text-zinc-950 hover:bg-white active:bg-zinc-200 text-xs font-bold transition-colors focus-ring shrink-0"
            >
              <GitBranch className="w-3.5 h-3.5 text-zinc-950" aria-hidden="true" />
              <span>Approve &amp; Create Integration Branch</span>
            </button>
          </div>
        )}
      </section>
    </div>
  );
};

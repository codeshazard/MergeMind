import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { GitPullRequest, ArrowRight, Loader2, Calendar, GitBranch } from 'lucide-react';
import { api } from '../lib/api';
import { getAnalysisId, type Analysis } from '../lib/types';
import { ConflictBadge, RiskBadge, IntegrationBadge } from '../components/Badge';

export const HistoryPage: React.FC = () => {
  const navigate = useNavigate();
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    api.getHistory(50)
      .then((data) => {
        if (isMounted) {
          setAnalyses(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to retrieve scan history.');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleRowClick = (id: string | null) => {
    if (id) {
      navigate(`/analysis/${id}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, id: string | null) => {
    if ((e.key === 'Enter' || e.key === ' ') && id) {
      e.preventDefault();
      navigate(`/analysis/${id}`);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
            Inspection History
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Complete archive of monitored PRs, conflict detections, and patch integrations.
          </p>
        </div>

        <Link
          to="/"
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-zinc-100 text-zinc-950 hover:bg-white text-xs font-semibold transition-colors focus-ring shrink-0 self-start sm:self-auto"
        >
          <GitPullRequest className="w-3.5 h-3.5" aria-hidden="true" />
          <span>New Inspection</span>
        </Link>
      </div>

      {loading ? (
        <div className="p-16 text-center text-xs font-mono text-zinc-500">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-zinc-400" aria-hidden="true" />
          <span>Loading historical scans...</span>
        </div>
      ) : error ? (
        <div className="p-4 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs text-center">
          {error}
        </div>
      ) : analyses.length === 0 ? (
        <div className="p-16 rounded-xl border border-dashed border-zinc-800 text-center space-y-3">
          <GitPullRequest className="w-8 h-8 text-zinc-600 mx-auto" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-zinc-300">No PR scans found</h2>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto">
            Scan your first GitHub Pull Request to identify semantic drift and line collisions.
          </p>
          <div className="pt-2">
            <Link
              to="/"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors focus-ring"
            >
              <span>Go to Scanner</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </Link>
          </div>
        </div>
      ) : (
        <div className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-900/40">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-zinc-300 border-collapse">
              <thead>
                <tr className="border-b border-zinc-800/80 bg-zinc-900/80 font-mono text-[11px] text-zinc-400 uppercase tracking-wider">
                  <th scope="col" className="py-3 px-4">Repository & PR</th>
                  <th scope="col" className="py-3 px-4">Conflict Type</th>
                  <th scope="col" className="py-3 px-4">Risk</th>
                  <th scope="col" className="py-3 px-4">Integration Status</th>
                  <th scope="col" className="py-3 px-4 text-right">Scanned Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {analyses.map((scan, idx) => {
                  const targetId = getAnalysisId(scan);
                  const dateStr = scan.created_at
                    ? new Date(scan.created_at).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })
                    : 'Recent';

                  const cells = (
                    <>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-zinc-400">
                            {scan.repo_owner}/{scan.repo_name}#{scan.pr_number}
                          </span>
                        </div>
                        <div className="text-zinc-100 font-medium mt-0.5 truncate max-w-sm sm:max-w-md">
                          {scan.pr_title}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <ConflictBadge type={scan.conflict_type} size="sm" />
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <RiskBadge score={scan.risk_score} size="sm" />
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <IntegrationBadge status={scan.integration_status} size="sm" />
                          {scan.integration_branch && (
                            <span className="font-mono text-[10px] text-zinc-500 hidden sm:inline-flex items-center gap-1">
                              <GitBranch className="w-3 h-3 text-zinc-600" aria-hidden="true" />
                              {scan.integration_branch}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-right whitespace-nowrap font-mono text-zinc-500 text-[11px]">
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-zinc-600" aria-hidden="true" />
                          {dateStr}
                        </span>
                      </td>
                    </>
                  );

                  if (!targetId) {
                    return (
                      <tr
                        key={`unidentified-${idx}`}
                        className="bg-zinc-900/20 text-zinc-400"
                        aria-label={`Unidentified analysis for ${scan.repo_owner}/${scan.repo_name} PR #${scan.pr_number}`}
                      >
                        {cells}
                      </tr>
                    );
                  }

                  return (
                    <tr
                      key={targetId}
                      tabIndex={0}
                      onClick={() => handleRowClick(targetId)}
                      onKeyDown={(e) => handleKeyDown(e, targetId)}
                      className="hover:bg-zinc-800/50 cursor-pointer transition-colors focus-ring"
                      role="link"
                      aria-label={`View analysis for ${scan.repo_owner}/${scan.repo_name} PR #${scan.pr_number}: ${scan.pr_title}`}
                    >
                      {cells}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

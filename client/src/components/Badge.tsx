import React from 'react';
import {
  AlertTriangle,
  GitMerge,
  CheckCircle2,
  ShieldAlert,
  AlertCircle,
  ShieldCheck,
  GitBranch,
  Clock,
  XCircle,
} from 'lucide-react';
import type { ConflictType, RiskScore, IntegrationStatus } from '../lib/types';

interface ConflictBadgeProps {
  type: ConflictType;
  size?: 'sm' | 'md';
}

export const ConflictBadge: React.FC<ConflictBadgeProps> = ({ type, size = 'md' }) => {
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs gap-1.5' : 'px-2.5 py-1 text-xs gap-2';

  switch (type) {
    case 'SEMANTIC':
      return (
        <span
          className={`inline-flex items-center font-medium rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-400 ${sizeClasses}`}
        >
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Semantic Conflict</span>
        </span>
      );
    case 'TEXTUAL':
      return (
        <span
          className={`inline-flex items-center font-medium rounded-md border border-rose-500/30 bg-rose-500/10 text-rose-400 ${sizeClasses}`}
        >
          <GitMerge className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Textual Collision</span>
        </span>
      );
    case 'NONE':
    default:
      return (
        <span
          className={`inline-flex items-center font-medium rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 ${sizeClasses}`}
        >
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>No Conflict</span>
        </span>
      );
  }
};

interface RiskBadgeProps {
  score: RiskScore;
  size?: 'sm' | 'md';
}

export const RiskBadge: React.FC<RiskBadgeProps> = ({ score, size = 'md' }) => {
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs gap-1.5' : 'px-2.5 py-1 text-xs gap-2';

  switch (score) {
    case 'HIGH':
      return (
        <span
          className={`inline-flex items-center font-medium rounded-md border border-rose-500/30 bg-rose-500/10 text-rose-400 ${sizeClasses}`}
        >
          <ShieldAlert className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>High Risk</span>
        </span>
      );
    case 'MEDIUM':
      return (
        <span
          className={`inline-flex items-center font-medium rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-400 ${sizeClasses}`}
        >
          <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Medium Risk</span>
        </span>
      );
    case 'LOW':
    default:
      return (
        <span
          className={`inline-flex items-center font-medium rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 ${sizeClasses}`}
        >
          <ShieldCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Low Risk</span>
        </span>
      );
  }
};

interface IntegrationBadgeProps {
  status: IntegrationStatus;
  size?: 'sm' | 'md';
}

export const IntegrationBadge: React.FC<IntegrationBadgeProps> = ({ status, size = 'md' }) => {
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs gap-1.5' : 'px-2.5 py-1 text-xs gap-2';

  switch (status) {
    case 'BRANCH_CREATED':
      return (
        <span
          className={`inline-flex items-center font-medium rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 ${sizeClasses}`}
        >
          <GitBranch className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Branch Created</span>
        </span>
      );
    case 'REJECTED':
      return (
        <span
          className={`inline-flex items-center font-medium rounded-md border border-zinc-700 bg-zinc-800 text-zinc-400 ${sizeClasses}`}
        >
          <XCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Rejected</span>
        </span>
      );
    case 'PENDING':
    default:
      return (
        <span
          className={`inline-flex items-center font-medium rounded-md border border-zinc-700/80 bg-zinc-900 text-zinc-300 ${sizeClasses}`}
        >
          <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Pending Integration</span>
        </span>
      );
  }
};



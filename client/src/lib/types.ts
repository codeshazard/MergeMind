export type ConflictType = 'NONE' | 'TEXTUAL' | 'SEMANTIC';
export type RiskScore = 'LOW' | 'MEDIUM' | 'HIGH';
export type IntegrationStatus = 'PENDING' | 'BRANCH_CREATED' | 'REJECTED';
export type TestStatus = 'PASS' | 'FAIL';

export interface FileDiff {
  filename: string;
  status: string;
  patch?: string | null;
}

export interface ContextFile {
  filename: string;
  reason: string;
  content?: string | null;
}

export interface ResolvedFile {
  filename: string;
  content: string;
  original_content?: string | null;
}

export interface TestAssertion {
  assertion: string;
  status: TestStatus;
}

export interface Analysis {
  _id?: string;
  id?: string;
  repo_owner: string;
  repo_name: string;
  pr_number: number;
  pr_title: string;
  base_branch: string;
  compare_branch: string;
  conflict_type: ConflictType;
  risk_score: RiskScore;
  explanation: string;
  file_diffs: FileDiff[];
  context_files: ContextFile[];
  resolved_files: ResolvedFile[];
  test_assertions: TestAssertion[];
  integration_status: IntegrationStatus;
  integration_branch?: string | null;
  created_at: string;
}

export interface BreakdownItem {
  name: string;
  value: number;
}

export interface DashboardStats {
  total_monitored: number;
  semantic_caught: number;
  conflict_breakdown: BreakdownItem[];
  risk_breakdown: BreakdownItem[];
}

export interface ScanRequest {
  repo_url: string;
  pr_number: number;
}

export interface IntegrateRequest {
  analysis_id: string;
}

export interface IntegrateResponse {
  success: boolean;
  branch: string;
  commit_sha: string;
  files_committed: string[];
}

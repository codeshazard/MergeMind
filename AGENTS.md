# AGENTS.md — MergeMind System Specification & Agent Execution Guide

## 1. Project Overview & System Scope
MergeMind is an AI-powered code integration and conflict analysis platform. It features a Python FastAPI backend and a React (Vite) frontend. It interfaces with GitHub repositories via the GitHub REST API to inspect Pull Requests, detect both traditional Git conflicts and semantic mismatches, generate integrated resolutions, run static test assertions, and optionally push the resolved patch to a new integration branch.

### Key Capabilities:
- **On-Demand PR Inspector**: User submits a GitHub PR URL or `owner/repo + prNumber`.
- **Dual-Mode Conflict Engine**: Identifies line-level Git collisions and semantic/interface drift via an LLM.
- **Caller-Context Detection**: Automatically finds external files referencing modified identifiers to catch downstream semantic breaks.
- **Multi-File Diff & Resolution Viewer**: Interactive UI showing original diffs, conflict root causes, and clean merged files.
- **Pre-Merge Test Integrity**: LLM-evaluated regression assertions verifying logic and signature safety (indicative verification, not dynamically executed).
- **One-Click GitHub Integration**: Programmatically creates an integration branch (`mergemind/patch-pr-{id}`) and commits all resolved files.
- **Repository Health Dashboard**: Recharts-powered metrics summarizing conflict history, module risk, and pass rates.

---

## 2. Tech Stack & Dependencies

### Backend (`/server`)
- **Runtime**: Python 3.10+, FastAPI, Uvicorn
- **Data Validation & Schemas**: Pydantic v2
- **Database**: MongoDB via Motor (async Python MongoDB driver)
- **GitHub Client**: `httpx` (async HTTP client interfacing with GitHub REST API v3)
- **AI SDK**: `google-genai` (official Google GenAI Python SDK)
- **Utilities**: `python-dotenv`, `fastapi.middleware.cors.CORSMiddleware`

### Frontend (`/client`)
- **Framework**: React.js (Vite)
- **Styling**: Tailwind CSS
- **Icons**: `lucide-react`
- **Diff Rendering**: `react-diff-viewer-continued`
- **Visualizations**: `recharts`

---

## 3. Database & Pydantic Schemas

File: `server/models/analysis.py`

```python
from datetime import datetime, timezone
from typing import List, Optional, Literal
from pydantic import BaseModel, Field, ConfigDict

class FileDiff(BaseModel):
    filename: str
    status: str
    patch: Optional[str] = None

class ContextFile(BaseModel):
    filename: str
    reason: str

class TestAssertion(BaseModel):
    assertion: str
    status: Literal['PASS', 'FAIL'] = 'PASS'
    # LLM-evaluated: indicative checks synthesized by Gemini, not executed in runtime sandbox

class ResolvedFile(BaseModel):
    filename: str
    content: str

class AnalysisModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: Optional[str] = Field(default=None, alias="_id")
    repo_owner: str
    repo_name: str
    pr_number: int
    pr_title: str
    base_branch: str
    compare_branch: str
    conflict_type: Literal['NONE', 'TEXTUAL', 'SEMANTIC']
    risk_score: Literal['LOW', 'MEDIUM', 'HIGH']
    explanation: str
    file_diffs: List[FileDiff]
    context_files: List[ContextFile] = Field(default_factory=list)
    resolved_files: List[ResolvedFile]
    test_assertions: List[TestAssertion]
    integration_status: Literal['PENDING', 'BRANCH_CREATED', 'REJECTED'] = 'PENDING'
    integration_branch: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
```

---

## 4. REST API Contract

### Base Route: `/api`

#### 1. `POST /api/scan`
- **Payload**:
  ```json
  {
    "repo_url": "https://github.com/owner/repository",
    "pr_number": 1
  }
  ```
- **Flow**:
  1. Extract `owner` and `repo` from `repo_url` (handle trailing slash and `.git`).
  2. Fetch PR details using GitHub REST API (`GET /repos/{owner}/{repo}/pulls/{pull_number}`).
  3. Fetch modified files and diff patches using GitHub REST API (`GET /repos/{owner}/{repo}/pulls/{pull_number}/files`).
  4. **Caller-Context Extraction**: Extract changed identifiers from diffs, traverse repository tree (`GET /repos/{owner}/{repo}/git/trees/{base_sha}?recursive=1`), and fetch candidate source files outside the PR that reference these identifiers.
  5. Aggregate patch strings and context files, then send to Gemini API (`google-genai`) with strict Pydantic JSON schema instructions.
  6. Save the resulting payload to MongoDB `analyses` collection via Motor.
- **Returns**: Persisted MongoDB analysis document including `context_files` and `resolved_files`.

#### 2. `GET /api/history`
- **Query**: `?limit=10` (range: 1 to 50)
- **Returns**: Array of recent analyses sorted by `created_at` descending.

#### 3. `GET /api/analysis/{id}`
- **Returns**: Complete details of a specific scan. Returns 400 for invalid ObjectId, 404 if not found.

#### 4. `POST /api/integrate`
- **Payload**:
  ```json
  {
    "analysis_id": "<MongoDB_ID>"
  }
  ```
- **Flow**:
  1. Look up analysis in MongoDB. Return 409 if `integration_status` is already `BRANCH_CREATED`.
  2. Get latest commit SHA of `base_branch` via `GET /repos/{owner}/{repo}/git/ref/heads/{base_branch}`.
  3. Create reference `refs/heads/mergemind/patch-pr-{pr_number}` with that SHA via `POST /repos/{owner}/{repo}/git/refs`. If reference already exists (422), append a numeric suffix.
  4. For each file in `resolved_files`:
     - Fetch existing file SHA via `GET /repos/{owner}/{repo}/contents/{filename}?ref={branch}` if present.
     - Commit updated file content (base64 encoded) via `PUT /repos/{owner}/{repo}/contents/{filename}` with message `"MergeMind: resolve PR #{n} ({conflict_type})"`.
  5. Update MongoDB document (`integration_status: 'BRANCH_CREATED'`, `integration_branch: '{branch}'`).
- **Returns**: `{ "success": true, "branch": "mergemind/patch-pr-1", "commit_sha": "...", "files_committed": ["path/to/file"] }`

#### 5. `GET /api/dashboard/stats`
- **Returns**:
  ```json
  {
    "total_monitored": 12,
    "semantic_caught": 4,
    "conflict_breakdown": [
      { "name": "Textual", "value": 5 },
      { "name": "Semantic", "value": 4 },
      { "name": "None", "value": 3 }
    ],
    "risk_breakdown": [
      { "name": "High", "value": 3 },
      { "name": "Medium", "value": 6 },
      { "name": "Low", "value": 3 }
    ]
  }
  ```

---

## 5. Structured LLM Generation Contract

Use the following system prompt and structured JSON schema for Gemini (via `google-genai`):

### System Prompt:
```text
You are an expert Git integration engineer and semantic code reviewer.
Analyze the provided Git diff patches from a Pull Request.

Your job:
1. Determine if changes contain:
   - "TEXTUAL": Traditional Git line collisions or conflict markers.
   - "SEMANTIC": Independent, clean textual changes that break downstream assumptions (e.g., function parameter count/type changes, altered return structures, broken invariants).
   - "NONE": Clean, fully compatible changes.
2. Formulate a plain-English explanation of the underlying problem.
3. You are also given full contents of files NOT in the PR that call or import changed code. A change is SEMANTIC if it alters return-value meaning, parameters, or invariants that those files rely on, even if the PR's own tests would pass. Name the affected caller files and explain the reasoning in `explanation`. `resolved_files` must contain a complete, valid version of every file that needs to change, including caller files.
4. Output 2 to 4 LLM-evaluated test verification checks indicating that the integration maintains integrity (these are synthesized indicative checks, not executed in runtime sandbox).

Output MUST strictly follow the JSON schema.
```

### Response Schema:
```json
{
  "conflict_type": "TEXTUAL | SEMANTIC | NONE",
  "risk_score": "LOW | MEDIUM | HIGH",
  "explanation": "Concise breakdown of why and where the changes collide.",
  "resolved_files": [
    {
      "filename": "path/to/file.py",
      "content": "# Complete syntactically valid resolved source code"
    }
  ],
  "test_assertions": [
    {
      "assertion": "Verifies calculate_tax handles newly introduced currency parameter",
      "status": "PASS"
    },
    {
      "assertion": "Preserves default argument fallback for legacy invocations",
      "status": "PASS"
    }
  ]
}
```

---

## 6. Phased Implementation Roadmap

### Phase 1: Environment & Project Scaffolding [DONE]
- [x] Scaffolding for `/server` (FastAPI) and `/client` (Vite React TypeScript).

### Phase 2: Core Backend Engine (FastAPI)
- [ ] Initialize FastAPI application in `server/main.py` with lifespan handler (Motor client, index on created_at desc) and DB health ping.
- [ ] Create `server/config.py` loading `.env` with fail-fast validation for `MONGODB_URI`, `GITHUB_TOKEN`, `GEMINI_API_KEY`, `GEMINI_MODEL`.
- [ ] Create `server/db.py` with Motor client and `get_db` dependency.
- [ ] Define Pydantic v2 schemas in `server/models/analysis.py`.
- [ ] Build `server/utils/github.py`: Async GitHub API client via `httpx` (`parse_repo_url`, `get_pr`, `list_pr_files`, `get_file_content`, `get_repo_tree`, `find_callers`).
- [ ] Build `server/utils/ai.py`: Gemini client via `google-genai` implementing `analyze_diff_with_ai` returning `AIResult`.
- [ ] Build routes:
  - `server/routes/scan.py` (`POST /api/scan`)
  - `server/routes/history.py` (`GET /api/history`, `GET /api/analysis/{id}`)
  - `server/routes/integrate.py` (`POST /api/integrate`)
  - `server/routes/dashboard.py` (`GET /api/dashboard/stats`)

### Phase 3: Frontend Interface & Workflows
- [ ] Build interactive UI with side-by-side diffs, resolution review, health metrics, and one-click integration.

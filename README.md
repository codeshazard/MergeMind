# MergeMind

MergeMind is an AI-powered code integration and conflict analysis platform. It inspects GitHub Pull Requests on-demand, detects both raw textual collisions and semantic interface/signature drift via Google Gemini, extracts caller and callee context from the repository tree, synthesizes test integrity assertions, and provides one-click creation of integrated patch branches (`mergemind/patch-pr-{id}`).

---

## System Architecture

```text
  +-----------------------------------------------------------------------+
  |                     MergeMind Frontend (React + Vite)                 |
  |  - Hero PR Scan & Demo Presets      - Split Side-by-Side Diff Viewer  |
  |  - Downstream Impact Callout        - Recharts Repository Health      |
  +-----------------------------------+-----------------------------------+
                                      | HTTP REST (/api)
                                      v
  +-----------------------------------------------------------------------+
  |                     MergeMind Backend (FastAPI)                       |
  |                                                                       |
  |  +--------------------+   +-------------------+   +----------------+  |
  |  |   GitHub Client    |   | Caller/Callee AST |   | Conflict Rules |  |
  |  |  (httpx + retry)   |   | (Regex Extractor) |   |  (Ground Truth)|  |
  |  +---------+----------+   +---------+---------+   +--------+-------+  |
  |            |                        |                      |          |
  +------------|------------------------|----------------------|----------+
               |                        |                      |
               |                        v                      |
  +------------v------------+  +-------------------------------+v---------+
  |     GitHub REST API     |  |       Google Gemini 3 Flash              |
  | - PR metadata & diffs   |  | - Structured conflict classification     |
  | - Recursive repo tree   |  | - Semantic drift root-cause reasoning    |
  | - Branch ref creation   |  | - Multi-file resolution code synthesis   |
  | - File commit dispatch  |  | - Indicative test integrity assertions   |
  +-------------------------+  +------------------------------------------+
               ^
               | Persistence
  +------------+------------+
  |    MongoDB (Motor)      |
  |  - PR Analyses Cache    |
  |  - Metrics & Telemetry  |
  +-------------------------+
```

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | Optional | `8000` | Port for the FastAPI backend server. |
| `MONGODB_URI` | Required | — | MongoDB connection string (e.g. `mongodb://localhost:27017` or Atlas URI). |
| `GITHUB_TOKEN` | Required | — | GitHub Personal Access Token (classic or fine-grained) with repo read & write access. |
| `GEMINI_API_KEY` | Required | — | Google Gemini API key from Google AI Studio. |
| `GEMINI_MODEL` | Optional | `gemini-3-flash-preview` | Gemini model name used for conflict detection and code synthesis. |

---

## Getting Started

### Prerequisites
- **Python**: 3.10+ (tested on Python 3.13)
- **Node.js**: 18+ (tested on Node 22 / 24)
- **MongoDB**: Local or cloud MongoDB instance
- **API Keys**: `GITHUB_TOKEN` and `GEMINI_API_KEY`

---

### Backend Setup (`/server`)

1. Navigate to the `server` directory:
   ```bash
   cd server
   ```

2. Run the setup script to create a virtual environment and install dependencies:
   - On Windows:
     ```cmd
     setup.bat
     ```
   - On Linux/macOS:
     ```bash
     chmod +x setup.sh
     ./setup.sh
     ```

   *Alternatively, manual setup:*
   ```bash
   python -m venv .venv
   # Windows:
   .venv\Scripts\activate
   # Linux/macOS:
   source .venv/bin/activate

   pip install -r requirements.txt -r requirements-dev.txt
   ```

3. Configure environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your MONGODB_URI, GITHUB_TOKEN, and GEMINI_API_KEY
   ```

4. Run pure unit tests (15 tests, 0 network calls):
   ```bash
   pytest -v
   ```

5. Run the FastAPI development server:
   ```bash
   uvicorn main:app --reload --port 8000
   ```
   API health check: `http://localhost:8000/api/health`
   Interactive Swagger docs: `http://localhost:8000/docs`

---

### Frontend Setup (`/client`)

1. Navigate to the `client` directory:
   ```bash
   cd client
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run the standalone PR parser unit test suite (18 test cases):
   ```bash
   node src/lib/parsePr.test.ts
   ```

4. Run the Vite development server:
   ```bash
   npm run dev
   ```
   The client starts at `http://localhost:5173`.
   API requests matching `/api/*` are automatically proxied to `http://localhost:8000`.

---

## Demo Script

Follow this end-to-end walkthrough to demonstrate MergeMind's capabilities:

1. **Start Services**:
   - Terminal 1: In `/server`, activate `.venv` and run `uvicorn main:app --reload --port 8000`.
   - Terminal 2: In `/client`, run `npm run dev` and navigate to `http://localhost:5173`.
2. **Preset Demo PR Shortcuts**:
   - On the homepage, locate the **"Preset Demo PR Shortcuts"** section.
   - Click on the **`codeshazard/MergeDemo #1`** card (or click its "Copy PR URL" button). The scan input will populate automatically.
   - Click **"Scan for Conflicts"**.
3. **Observe Staged Inspection**:
   - The UI displays live feedback: *Fetching Pull Request metadata & diffs &rarr; Identifying caller & callee context &rarr; Evaluating semantic drift with Google Gemini*.
4. **Inspect Conflict Analysis**:
   - **Conflict Badge & Risk Score**: Notice the `SEMANTIC` conflict badge and `MEDIUM`/`HIGH` risk badge.
   - **Conflict Root Cause**: Plain-English breakdown explaining that `calculateTotal` now applies a 10% storewide discount, which unexpectedly drops carts originally totaling $50 to $45.
   - **Assumption to Confirm**: Review the dedicated callout detailing what the resolution assumed (e.g., whether to adjust the free-shipping threshold check in `shippingService.js` or retain pre-discount calculations).
   - **Downstream Impact Check**: View `shippingService.js` tagged with `"imports 'pricingService' and calls 'calculateTotal'"`.
   - **Split Diff Viewer**: Toggle between `pricingService.js` and `shippingService.js` to view original vs merged resolution code side-by-side.
   - **Indicative Assertions**: Verify the synthesized test assertions covering signature integrity and threshold guarantees.
5. **One-Click GitHub Integration**:
   - Click **"Apply Integration Branch"**.
   - MergeMind creates a new Git reference `refs/heads/mergemind/patch-pr-1` and commits all resolved files directly to the GitHub repository.
6. **Telemetry & Health Metrics**:
   - Navigate to **Analytics** to view aggregate statistics: conflict breakdowns, module risk distributions, and semantic drift catch rate.
   - When the database is fresh/empty, all views render clean empty states with direct navigation buttons.

---

## Known Limitations

- **LLM-Evaluated Assertions**: Test assertions are synthesized by Gemini to verify interface and regression safety; they are indicative checks and are not executed in a live sandboxed runtime container.
- **Regex-Based Context Search**: Downstream caller/callee discovery uses regex patterns and module stem matching across repository trees rather than a complete compiler AST or Language Server Protocol (LSP) index.
- **Diff & Context Size Caps**: PR diffs exceeding 6,000 characters per file or 40,000 characters total are capped to adhere to model context window budgets. When truncation occurs, the UI displays an `"Analysis input was truncated to fit context limits"` notice.
- **Language Scope**: Deep identifier extraction and definition matching supports JavaScript, TypeScript, JSX, TSX, MJS, CJS, and Python (`.js`, `.jsx`, `.ts`, `.tsx`, `.mjs`, `.cjs`, `.py`).

---

## What I'd Build Next

1. **Webhook Trigger on PR Open**: Implement a GitHub App webhook listener (`pull_request.opened`, `pull_request.synchronize`) to run MergeMind scans automatically whenever a contributor pushes commits.
2. **GitHub Action PR Comment Bot**: Build a GitHub Action that posts the conflict analysis, downstream caller impact, and synthesized patch as a formatted markdown comment directly on the Pull Request.
3. **Language-Aware Analysis (AST & LSP)**: Replace regex-based caller discovery with Tree-sitter AST queries and Language Server Protocol (LSP) symbol indexing for exact cross-file type resolution and jump-to-definition accuracy.
4. **Real Test Execution in a Sandbox**: Spin up ephemeral microVMs (e.g. Firecracker or Docker in gVisor) to run the repository's actual test suite (`pytest`, `jest`, `npm test`) against the synthesized resolution before proposing the integration branch.

---

## Repository Structure

```text
mergemind/
├── AGENTS.md             # System specification and agent execution roadmap
├── PRODUCT.md            # Product truth, target users, and principles
├── README.md             # Setup, architecture, demo script, and documentation
├── .gitignore            # Root ignore rules for node_modules, .venv, .env, etc.
├── server/               # Python FastAPI backend
│   ├── main.py           # FastAPI entrypoint, middleware & logging
│   ├── config.py         # Fail-fast environment variable loader
│   ├── db.py             # Motor MongoDB connection manager
│   ├── pytest.ini        # Pytest configuration
│   ├── requirements.txt  # Core dependencies
│   ├── requirements-dev.txt # Dev & testing dependencies
│   ├── models/           # Pydantic schemas (AnalysisModel, FileDiff, etc.)
│   ├── routes/           # FastAPI routers (scan, history, integrate, dashboard)
│   ├── utils/            # GitHub client, Gemini client, pure rules
│   └── tests/            # Pure unit tests (0 network calls)
└── client/               # Vite React TypeScript frontend
    ├── package.json      # Frontend dependencies
    ├── vite.config.ts    # Vite config with /api proxy to :8000
    ├── src/
    │   ├── lib/          # API client, types, PR parser & tests
    │   ├── components/   # Badges, Layout, Navbar
    │   ├── pages/        # ScanPage, ResultPage, HistoryPage, AnalyticsPage
    │   ├── App.tsx       # Root UI router
    │   └── main.tsx      # React DOM bootstrap
```

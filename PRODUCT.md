# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React (Vite) + Tailwind CSS (with Lucide icons, `react-diff-viewer-continued`, and Recharts) on the frontend; Python 3.10+, FastAPI, Uvicorn, Pydantic v2, MongoDB (Motor), GitHub REST API (`httpx`), and Google GenAI SDK (`google-genai`) on the backend.

## Users

Solo developers and engineers looking for AI-assisted merge conflict resolution and automated patch branch creation when integrating complex changes or pull requests.

## Product Purpose

MergeMind eliminates integration friction by inspecting Pull Requests on-demand, detecting both standard line collisions (textual) and silent semantic/interface drift, generating an integrated resolution with regression test assertions, and programmatically creating a verified integration branch on GitHub. Success means a developer can submit a PR URL, inspect the conflict root-cause, review clean merged code with passing assertions, and safely push an integration patch in one click.

## Positioning

Unlike traditional Git CLI merge tools that only spot raw line collisions (or fail silently on semantic breaks where syntax compiles but interfaces or contracts drift), MergeMind combines dual-mode conflict analysis (textual + LLM-evaluated semantic verification) with automated integration branch publishing directly to GitHub.

## Operating Context

- GitHub Pull Request inspection: works with standard GitHub PR URLs or `owner/repo` + `prNumber`.
- Dual analysis flow: fetches PR diffs via GitHub REST API (`httpx`), evaluates changes through Gemini LLM (`google-genai`) against a strict Pydantic JSON schema, and persists records in MongoDB (`motor`).
- Review and action surface: developer reviews side-by-side original vs. resolved diffs, static regression assertions, and conflict risk scores, then approves the patch.
- Repository integration: automatically creates `mergemind/patch-pr-{id}` branch from the base branch commit SHA and pushes the resolved code via GitHub REST API.

## Capabilities and Constraints

- **On-Demand PR Scan**: Input GitHub PR URL, retrieve file diffs, analyze conflict type (`TEXTUAL`, `SEMANTIC`, `NONE`) and risk score (`LOW`, `MEDIUM`, `HIGH`).
- **Interactive Diff & Resolution Viewer**: Side-by-side view comparing conflicting patches with clean resolved code.
- **Pre-Merge Test Integrity**: 2 to 4 automated test verification assertions validating function signatures, arguments, and invariants.
- **One-Click GitHub Branch Integration**: Programmatic creation of reference `refs/heads/mergemind/patch-pr-{prNumber}` and direct file update.
- **Health & Metrics Dashboard**: Aggregate statistics on conflict frequency, risk breakdown, and scan history.
- **Constraints**: Requires valid GitHub Personal Access Token (`GITHUB_TOKEN`) with repo scope and Gemini API key (`GEMINI_API_KEY`).

## Brand Commitments

- **Name**: MergeMind
- **Tone**: Technical, authoritative, developer-native, precise, and reassuring.
- **Visual Identity**: High-contrast, clean developer tooling aesthetic emphasizing clarity, git-native metaphors (diffs, badges, commits), and zero fluff.
- **Color Direction**: High-contrast dark editor theme (deep zinc/slate `#09090b` ground, `#fafafa` ink, subtle border tone `#27272a`, emerald `#10b981` added lines / pass, rose `#f43f5e` deleted lines / fail, amber `#f59e0b` conflict warning, no purple gradients or decorative blobs).
- **Typography Direction**: Clean neutral sans-serif (`Inter`, system UI font) for interface copy; monospace (`JetBrains Mono`, `ui-monospace`, `monospace`) strictly reserved for diff views, code snippets, commit SHAs, and assertion statements.

## Evidence on Hand

- Complete system architecture, API contracts, database schema, and phased implementation roadmap documented in [AGENTS.md](file:///C:/Users/shasw/OneDrive/Desktop/mergemind/AGENTS.md).
- Sample conflict test cases defined for verification: textual line collisions and semantic function signature mismatches.

## Product Principles

1. **Semantic Safety Over Raw Merging**: Never assume zero line conflicts equals clean code; verify interface, parameter, and behavioral contracts.
2. **Explain Before You Resolve**: Clearly explain *why* and *where* changes collide in plain English before presenting the fix.
3. **Transparent Verification**: Pair every suggested resolution with concrete test assertions demonstrating why the code is safe.
4. **Developer-in-Control**: MergeMind recommends, explains, and prepares the patch branch, but the developer retains one-click approval and review.

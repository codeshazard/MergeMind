# MergeMind

MergeMind is an AI-powered code integration and conflict analysis platform. It inspects GitHub Pull Requests on-demand, detects both raw textual collisions and semantic interface/signature drift via Google Gemini, outputs test integrity assertions, and provides one-click creation of integrated patch branches (`mergemind/patch-pr-{id}`).

## System Architecture

The project consists of two decoupled applications:
- **Backend (`/server`)**: Python 3.10+, FastAPI, Uvicorn, Pydantic v2, Motor (MongoDB), and Google GenAI SDK.
- **Frontend (`/client`)**: React (Vite) + TypeScript, Tailwind CSS, Lucide icons, `react-diff-viewer-continued`, and Recharts.

---

## Getting Started

### Prerequisites
- **Python**: 3.10+ (tested on Python 3.13)
- **Node.js**: 18+ (tested on Node 22 / 24)
- **MongoDB**: Local or cloud MongoDB instance (URI configured in `.env`)
- **API Keys**:
  - `GITHUB_TOKEN` (Personal Access Token with repository read/write access)
  - `GEMINI_API_KEY` (Google Gemini API key)

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

   pip install -r requirements.txt
   ```

3. Configure environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your MONGODB_URI, GITHUB_TOKEN, and GEMINI_API_KEY
   ```

4. Run the FastAPI development server:
   ```bash
   uvicorn main:app --reload --port 8000
   ```
   API health endpoint is available at `http://localhost:8000/api/health`.
   Interactive Swagger docs are available at `http://localhost:8000/docs`.

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

3. Run the Vite development server:
   ```bash
   npm run dev
   ```
   The client will start at `http://localhost:5173`.
   API requests matching `/api/*` are automatically proxied to `http://localhost:8000`.

---

## Repository Structure

```
mergemind/
├── AGENTS.md             # System specification and agent execution roadmap
├── PRODUCT.md            # Product truth, target users, and principles
├── README.md             # Setup and developer run guide
├── .gitignore            # Root ignore rules for node_modules, .venv, .env, etc.
├── server/               # Python FastAPI backend
│   ├── main.py           # FastAPI entrypoint, CORS & health routes
│   ├── requirements.txt  # Python dependencies
│   ├── .env.example      # Environment variable template
│   ├── setup.bat         # Windows setup automation
│   ├── setup.sh          # Unix setup automation
│   ├── models/           # Pydantic data schemas
│   ├── routes/           # FastAPI API routers
│   └── utils/            # GitHub client and AI integration helpers
└── client/               # Vite React TypeScript frontend
    ├── package.json      # Frontend dependencies
    ├── vite.config.ts    # Vite config with /api proxy to :8000
    ├── src/
    │   ├── lib/
    │   │   └── api.ts    # Typed fetch API client
    │   ├── App.tsx       # Root UI shell
    │   ├── main.tsx      # React DOM bootstrap
    │   └── index.css     # Tailwind styling rules
```

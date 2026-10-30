import os
from pathlib import Path
from dotenv import load_dotenv

env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=env_path)

MONGODB_URI: str = os.getenv("MONGODB_URI", "")
GITHUB_TOKEN: str = os.getenv("GITHUB_TOKEN", "")
GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
PORT: int = int(os.getenv("PORT", "8000"))

missing = []
if not MONGODB_URI:
    missing.append("MONGODB_URI")
if not GITHUB_TOKEN:
    missing.append("GITHUB_TOKEN")
if not GEMINI_API_KEY:
    missing.append("GEMINI_API_KEY")
if not GEMINI_MODEL:
    missing.append("GEMINI_MODEL")

if missing:
    raise RuntimeError(
        f"Missing required environment variable(s) in server/.env: {', '.join(missing)}. "
        "Please update server/.env with valid configuration values."
    )

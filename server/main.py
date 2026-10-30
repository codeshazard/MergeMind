from contextlib import asynccontextmanager
from typing import Any, Dict
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pymongo import DESCENDING

from db import close_mongo_connection, connect_to_mongo, get_db
from routes.dashboard import router as dashboard_router
from routes.history import router as history_router
from routes.integrate import router as integrate_router
from routes.scan import router as scan_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Connect to MongoDB and ensure index on created_at DESC
    database = await connect_to_mongo()
    try:
        await database["analyses"].create_index([("created_at", DESCENDING)])
    except Exception as err:
        print(f"Warning: Failed to create index on 'created_at': {err}")
    yield
    # Shutdown: Cleanly close Motor database connection
    await close_mongo_connection()


app = FastAPI(
    title="MergeMind API",
    description="AI-powered code integration and conflict analysis platform",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS configuration
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount all feature routers under /api
app.include_router(scan_router, prefix="/api")
app.include_router(history_router, prefix="/api")
app.include_router(integrate_router, prefix="/api")
app.include_router(dashboard_router, prefix="/api")


@app.get("/api/health")
async def health_check() -> Dict[str, Any]:
    """Health check reporting server and database connection status."""
    db_status = "disconnected"
    try:
        database = await get_db()
        await database.command("ping")
        db_status = "connected"
    except Exception:
        db_status = "disconnected"

    return {
        "status": "ok",
        "database": db_status,
    }

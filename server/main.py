from contextlib import asynccontextmanager
import logging
import uuid
from typing import Any, Dict
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pymongo import DESCENDING

from db import close_mongo_connection, connect_to_mongo, get_db
from routes.dashboard import router as dashboard_router
from routes.history import router as history_router
from routes.integrate import router as integrate_router
from routes.scan import router as scan_router

# Configure structured logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [req_id=%(request_id)s] %(name)s: %(message)s",
)
logger = logging.getLogger("mergemind")


class RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        if not hasattr(record, "request_id"):
            record.request_id = "system"
        return True


logging.getLogger().addFilter(RequestIdFilter())


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Connect to MongoDB and ensure index on created_at DESC
    database = await connect_to_mongo()
    try:
        await database["analyses"].create_index([("created_at", DESCENDING)])
    except Exception as err:
        logger.warning("Failed to create index on 'created_at': %s", err, extra={"request_id": "startup"})
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


# Request ID and Structured Logging Middleware
@app.middleware("http")
async def request_id_logging_middleware(request: Request, call_next):
    req_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    request.state.request_id = req_id

    # Log incoming request without sensitive headers or bodies
    logger.info(
        "Request started: %s %s",
        request.method,
        request.url.path,
        extra={"request_id": req_id},
    )

    try:
        response = await call_next(request)
        response.headers["X-Request-ID"] = req_id
        logger.info(
            "Request finished: %s %s -> status %d",
            request.method,
            request.url.path,
            response.status_code,
            extra={"request_id": req_id},
        )
        return response
    except Exception as exc:
        logger.error(
            "Unhandled exception processing %s %s: %s",
            request.method,
            request.url.path,
            exc,
            exc_info=True,
            extra={"request_id": req_id},
        )
        return JSONResponse(
            status_code=500,
            content={"detail": "An internal server error occurred. Please try again."},
            headers={"X-Request-ID": req_id},
        )


# Global Exception Handler to ensure consistent {detail: "..."} format
@app.exception_handler(Exception)
async def global_unhandled_exception_handler(request: Request, exc: Exception):
    req_id = getattr(request.state, "request_id", "unknown")
    logger.error("Global exception caught: %s", exc, extra={"request_id": req_id})
    return JSONResponse(
        status_code=500,
        content={"detail": "An unexpected error occurred."},
        headers={"X-Request-ID": req_id},
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

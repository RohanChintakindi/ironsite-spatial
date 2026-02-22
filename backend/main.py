"""
Ironsite Spatial -- FastAPI Backend
===================================
Serves the spatial awareness pipeline via REST + WebSocket.
Also serves the built frontend static files.
"""

import logging
import os
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from routers import pipeline, results, memory, ws

logger = logging.getLogger("ironsite")


class ConnectionManager:
    """Manages per-run WebSocket connections for real-time progress updates."""

    def __init__(self) -> None:
        self.active: dict[str, list[WebSocket]] = {}

    async def connect(self, run_id: str, websocket: WebSocket, runs_dict: dict) -> None:
        await websocket.accept()
        if run_id not in self.active:
            self.active[run_id] = []
        self.active[run_id].append(websocket)
        logger.info("WS connected: run_id=%s  total=%d", run_id, len(self.active[run_id]))

        # Send catch-up: replay current state of all steps so the client
        # doesn't miss events that fired before this WS connected.
        run = runs_dict.get(run_id)
        if run:
            for step_name, step_info in run.get("steps", {}).items():
                status = step_info.get("status", "pending")
                if status != "pending":
                    try:
                        await websocket.send_json({
                            "type": "step_status",
                            "step": step_name,
                            "status": status,
                            "progress": step_info.get("progress", 0.0),
                            "metadata": step_info.get("metadata"),
                            "error": step_info.get("error"),
                        })
                    except Exception:
                        break
            # Also send pipeline_complete if already done
            if run.get("status") == "completed":
                try:
                    await websocket.send_json({
                        "type": "pipeline_complete",
                        "status": "completed",
                    })
                except Exception:
                    pass

    def disconnect(self, run_id: str, websocket: WebSocket) -> None:
        if run_id in self.active:
            try:
                self.active[run_id].remove(websocket)
            except ValueError:
                pass
            if not self.active[run_id]:
                del self.active[run_id]
        logger.info("WS disconnected: run_id=%s", run_id)

    async def broadcast(self, run_id: str, data: Any) -> None:
        if run_id not in self.active:
            return
        stale: list[WebSocket] = []
        for ws_conn in self.active[run_id]:
            try:
                await ws_conn.send_json(data)
            except Exception:
                stale.append(ws_conn)
        for ws_conn in stale:
            self.disconnect(run_id, ws_conn)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle."""
    app.state.runs: dict[str, dict] = {}
    app.state.ws_manager = ConnectionManager()
    logger.info("Ironsite backend started")
    yield
    logger.info("Ironsite backend shutting down")


app = FastAPI(
    title="Ironsite Spatial API",
    version="0.1.0",
    description="REST + WebSocket backend for the Ironsite Spatial Awareness Pipeline.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(pipeline.router, prefix="/api/pipeline", tags=["pipeline"])
app.include_router(results.router, prefix="/api/results", tags=["results"])
app.include_router(memory.router, prefix="/api/memory", tags=["memory"])
app.include_router(ws.router, tags=["websocket"])


@app.get("/health")
async def health_check():
    return {"status": "ok"}


# --- Serve frontend static files ---
FRONTEND_DIST = os.path.join(os.path.dirname(__file__), os.pardir, "frontend", "dist")

if os.path.isdir(FRONTEND_DIST):
    # Serve static assets (JS, CSS, images)
    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIST, "assets")), name="static")

    # Catch-all: serve index.html for any non-API route (SPA routing)
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        return FileResponse(os.path.join(FRONTEND_DIST, "index.html"))

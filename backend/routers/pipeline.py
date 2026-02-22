"""
Pipeline control endpoints: start a run, upload video, query status.
"""

import hashlib
import os
import uuid
import tempfile
import shutil

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, UploadFile, File

from models.schemas import PipelineConfig, PipelineStartResponse, PipelineStatus, StepStatus
from services.runner import run_pipeline

router = APIRouter()

# Directory for uploaded videos
UPLOAD_DIR = os.path.join(tempfile.gettempdir(), "ironsite_uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.post("/run", response_model=PipelineStartResponse)
async def start_pipeline(
    config: PipelineConfig,
    background_tasks: BackgroundTasks,
    request: Request,
):
    """Launch the spatial-awareness pipeline as a background task.

    Returns a ``run_id`` that can be used to query status, stream
    WebSocket progress, and retrieve results.
    """
    run_id = str(uuid.uuid4())

    runs_dict = request.app.state.runs
    ws_manager = request.app.state.ws_manager

    config_dict = config.model_dump()

    background_tasks.add_task(
        run_pipeline,
        run_id=run_id,
        config=config_dict,
        runs_dict=runs_dict,
        ws_manager=ws_manager,
    )

    return PipelineStartResponse(run_id=run_id)


@router.post("/upload")
async def upload_video(file: UploadFile = File(...)):
    """Upload a video file and return the server-side path."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ('.mp4', '.avi', '.mov', '.mkv', '.webm'):
        raise HTTPException(status_code=400, detail=f"Unsupported format: {ext}")

    # Use a content hash so re-uploading the same video reuses the same path
    # (and therefore the same cache directory)
    content = file.file.read()
    file_hash = hashlib.md5(content).hexdigest()[:12]
    dest = os.path.join(UPLOAD_DIR, f"{file_hash}{ext}")

    if not os.path.exists(dest):
        with open(dest, "wb") as f:
            f.write(content)

    return {"video_path": dest, "filename": file.filename, "size_mb": round(len(content) / 1e6, 1)}


@router.get("/status/{run_id}", response_model=PipelineStatus)
async def get_pipeline_status(run_id: str, request: Request):
    """Return the current status of a pipeline run."""
    runs_dict = request.app.state.runs

    if run_id not in runs_dict:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found")

    run = runs_dict[run_id]

    steps = {}
    for step_name, step_info in run["steps"].items():
        steps[step_name] = StepStatus(
            step=step_info["step"],
            status=step_info["status"],
            progress=step_info.get("progress", 0.0),
            metadata=step_info.get("metadata"),
            error=step_info.get("error"),
        )

    return PipelineStatus(
        run_id=run["run_id"],
        status=run["status"],
        current_step=run.get("current_step"),
        steps=steps,
    )

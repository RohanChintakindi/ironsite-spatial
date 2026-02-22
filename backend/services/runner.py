"""
Pipeline orchestrator -- runs the full Ironsite Spatial pipeline in
background threads and broadcasts progress over WebSocket.
"""

import asyncio
import logging
import os
import sys
import time
import traceback
from concurrent.futures import ThreadPoolExecutor
from typing import Any

import numpy as np

logger = logging.getLogger("ironsite.runner")

# Reusable thread pool for CPU/GPU-heavy work
_executor = ThreadPoolExecutor(max_workers=2)


def _ensure_project_on_path() -> str:
    """Ensure the ironsite-spatial project root is on sys.path so that
    ``from utils.preprocess import ...`` etc. work inside worker threads.
    Returns the project root path.
    """
    project_root = os.path.abspath(
        os.path.join(os.path.dirname(__file__), os.pardir, os.pardir)
    )
    if project_root not in sys.path:
        sys.path.insert(0, project_root)
    return project_root


# ---------------------------------------------------------------------------
# Individual pipeline steps (all synchronous -- run inside the executor)
# ---------------------------------------------------------------------------

def _step_preprocess(config: dict, data: dict) -> dict:
    """Step 1: Extract and undistort keyframes from video."""
    _ensure_project_on_path()
    from config import FISHEYE_K_SCALE, FISHEYE_D, FISHEYE_BALANCE
    from utils.preprocess import extract_keyframes

    video_path = config["video_path"]
    interval = config.get("keyframe_interval", 10)
    max_frames = config.get("max_frames", 0)

    # Create output / scene directories next to the video
    output_dir = os.path.join(os.path.dirname(video_path), "output")
    scene_dir = os.path.join(output_dir, "scene")
    frames_dir = os.path.join(scene_dir, "images")
    os.makedirs(frames_dir, exist_ok=True)

    keyframes, timestamps, frame_indices, fps, w, h = extract_keyframes(
        video_path,
        frames_dir,
        interval=interval,
        k_scale=FISHEYE_K_SCALE,
        D=FISHEYE_D,
        balance=FISHEYE_BALANCE,
        max_frames=max_frames,
    )

    data["keyframes"] = keyframes
    data["timestamps"] = timestamps
    data["frame_indices"] = frame_indices
    data["fps"] = fps
    data["w"] = w
    data["h"] = h
    data["output_dir"] = output_dir
    data["scene_dir"] = scene_dir
    data["frames_dir"] = frames_dir

    return {
        "num_keyframes": len(keyframes),
        "fps": fps,
        "resolution": f"{w}x{h}",
        "timestamps_range": [
            round(timestamps[0], 2) if timestamps else 0,
            round(timestamps[-1], 2) if timestamps else 0,
        ],
    }


def _step_detection(config: dict, data: dict) -> dict:
    """Step 2: Grounding DINO detection + SAM2 tracking."""
    _ensure_project_on_path()
    import torch
    from config import (
        TEXT_PROMPT, DETECTION_THRESHOLD, REDETECT_EVERY,
        SAM2_CHECKPOINT, SAM2_CONFIG,
    )
    from utils.detection import run_dino_detections, run_sam2_tracking

    device = "cuda" if torch.cuda.is_available() else "cpu"
    keyframes = data["keyframes"]
    frames_dir = data["frames_dir"]

    dino_results = run_dino_detections(
        keyframes,
        device,
        text_prompt=TEXT_PROMPT,
        threshold=DETECTION_THRESHOLD,
        redetect_every=REDETECT_EVERY,
    )

    all_detections, object_labels = run_sam2_tracking(
        keyframes,
        frames_dir,
        device,
        dino_results,
        redetect_every=REDETECT_EVERY,
        sam2_checkpoint=SAM2_CHECKPOINT,
        sam2_config=SAM2_CONFIG,
    )

    data["all_detections"] = all_detections
    data["object_labels"] = object_labels

    total_dets = sum(len(d) for d in all_detections)
    return {
        "total_detections": total_dets,
        "unique_objects": len(object_labels),
        "frames_tracked": len(all_detections),
    }


def _step_reconstruction(config: dict, data: dict) -> dict:
    """Step 3: 3D reconstruction via VGGT-X or FastVGGT."""
    _ensure_project_on_path()
    from config import (
        FASTVGGT_MERGING, FASTVGGT_MERGE_RATIO, FASTVGGT_DEPTH_CONF,
        FASTVGGT_MAX_POINTS, VGGTX_CHUNK_SIZE, VGGTX_MAX_QUERY_PTS,
        VGGTX_MAX_POINTS,
    )
    from utils.depth import run_full_3d_pipeline

    backend = config.get("backend", "vggtx")
    scene_dir = data["scene_dir"]
    output_dir = data["output_dir"]
    num_keyframes = len(data["keyframes"])

    recon_data = run_full_3d_pipeline(
        scene_dir=scene_dir,
        output_dir=output_dir,
        merging=FASTVGGT_MERGING,
        merge_ratio=FASTVGGT_MERGE_RATIO,
        depth_conf_thresh=FASTVGGT_DEPTH_CONF,
        max_points=FASTVGGT_MAX_POINTS,
        num_keyframes=num_keyframes,
        backend=backend,
        chunk_size=VGGTX_CHUNK_SIZE,
        max_query_pts=VGGTX_MAX_QUERY_PTS,
        vggtx_max_points=VGGTX_MAX_POINTS,
    )

    data["recon_data"] = recon_data

    return {
        "backend": backend,
        "num_poses": len(recon_data.get("image_data", {})),
        "point_cloud_size": len(recon_data.get("points_xyz", [])),
        "depth_maps": len(recon_data.get("depth_map_cache", {})),
        "total_distance": round(recon_data.get("total_distance", 0), 2),
    }


def _step_scene_graphs(config: dict, data: dict) -> dict:
    """Step 4: Build scene graphs."""
    _ensure_project_on_path()
    from utils.scene_graph import build_scene_graphs

    scene_graphs = build_scene_graphs(
        data["keyframes"],
        data["all_detections"],
        data["recon_data"],
        data["timestamps"],
        data["frame_indices"],
    )

    data["scene_graphs"] = scene_graphs

    all_labels = set()
    for sg in scene_graphs:
        for obj in sg["objects"]:
            all_labels.add(obj["label"])

    return {
        "num_graphs": len(scene_graphs),
        "unique_classes": sorted(all_labels),
        "avg_objects_per_frame": round(
            float(np.mean([sg["num_objects"] for sg in scene_graphs])), 1
        ) if scene_graphs else 0,
    }


def _step_graph(config: dict, data: dict) -> dict:
    """Step 4.5: Build spatial graph (NetworkX)."""
    _ensure_project_on_path()
    from utils.graph import SpatialGraph

    spatial_graph = SpatialGraph()
    spatial_graph.build(data["scene_graphs"])

    output_dir = data["output_dir"]
    spatial_graph.export_html(os.path.join(output_dir, "spatial_graph.html"))
    spatial_graph.save_json(os.path.join(output_dir, "graph_data.json"))

    # Store for VLM and API
    data["spatial_graph"] = spatial_graph
    data["graph_data"] = spatial_graph.to_frontend_json()

    stats = spatial_graph.stats()
    return {
        "total_nodes": stats["total_nodes"],
        "total_edges": stats["total_edges"],
        "node_types": stats["node_types"],
    }


def _step_memory(config: dict, data: dict) -> dict:
    """Step 5: Build FAISS spatial memory."""
    _ensure_project_on_path()
    from utils.memory import SpatialMemory

    output_dir = data["output_dir"]
    memory_dir = os.path.join(output_dir, "memory_store")

    memory = SpatialMemory(memory_dir)
    memory.ingest(data["scene_graphs"], config["video_path"])
    memory.save()

    data["memory"] = memory

    stats = memory.stats()
    return {
        "entries": stats.get("entries", 0),
        "size_kb": stats.get("size_kb", 0),
    }


def _step_vlm(config: dict, data: dict) -> dict:
    """Step 6: VLM reasoning via Grok (optional)."""
    grok_key = config.get("grok_key")
    skip_vlm = config.get("skip_vlm", True)

    if skip_vlm or not grok_key:
        data["vlm_analysis"] = {}
        return {"skipped": True, "reason": "skip_vlm flag or no grok_key"}

    _ensure_project_on_path()
    from config import GROK_MODEL, GROK_BASE_URL, VLM_NUM_SAMPLES, VLM_TEMPERATURE, VLM_MAX_TOKENS
    from utils.vlm import run_vlm_analysis

    analysis = run_vlm_analysis(
        data["scene_graphs"],
        config["video_path"],
        grok_key,
        model=GROK_MODEL,
        base_url=GROK_BASE_URL,
        num_samples=VLM_NUM_SAMPLES,
        temperature=VLM_TEMPERATURE,
        max_tokens=VLM_MAX_TOKENS,
        spatial_graph=data.get("spatial_graph"),
        keyframes=data.get("keyframes"),
        num_images=5,
    )

    data["vlm_analysis"] = analysis

    return {
        "skipped": False,
        "has_timeline": "activity_timeline" in analysis,
        "has_summary": "summary" in analysis,
    }


# ---------------------------------------------------------------------------
# Ordered pipeline steps
# ---------------------------------------------------------------------------

PIPELINE_STEPS = [
    ("preprocess", _step_preprocess),
    ("detection", _step_detection),
    ("reconstruction", _step_reconstruction),
    ("scene_graphs", _step_scene_graphs),
    ("graph", _step_graph),
    ("memory", _step_memory),
    ("vlm", _step_vlm),
]


# ---------------------------------------------------------------------------
# Async orchestrator
# ---------------------------------------------------------------------------

async def run_pipeline(
    run_id: str,
    config: dict,
    runs_dict: dict,
    ws_manager: Any,
) -> None:
    """Execute the full pipeline, updating *runs_dict* and broadcasting
    progress via *ws_manager* after each step.

    Heavy work is offloaded to a ThreadPoolExecutor so the event loop
    stays responsive.
    """
    loop = asyncio.get_event_loop()

    # Initialise run entry
    step_statuses = {}
    for step_name, _ in PIPELINE_STEPS:
        step_statuses[step_name] = {
            "step": step_name,
            "status": "pending",
            "progress": 0.0,
            "metadata": None,
            "error": None,
        }

    run_entry: dict[str, Any] = {
        "run_id": run_id,
        "config": config,
        "status": "running",
        "current_step": None,
        "steps": step_statuses,
        "data": {},
    }
    runs_dict[run_id] = run_entry

    data = run_entry["data"]

    for step_name, step_fn in PIPELINE_STEPS:
        run_entry["current_step"] = step_name
        run_entry["steps"][step_name]["status"] = "started"
        run_entry["steps"][step_name]["progress"] = 0.0

        await ws_manager.broadcast(run_id, {
            "type": "step_status",
            "step": step_name,
            "status": "started",
            "progress": 0.0,
        })

        try:
            t0 = time.time()
            metadata = await loop.run_in_executor(
                _executor, step_fn, config, data
            )
            elapsed = round(time.time() - t0, 1)

            if metadata is None:
                metadata = {}
            metadata["elapsed_s"] = elapsed

            run_entry["steps"][step_name]["status"] = "completed"
            run_entry["steps"][step_name]["progress"] = 1.0
            run_entry["steps"][step_name]["metadata"] = metadata

            await ws_manager.broadcast(run_id, {
                "type": "step_status",
                "step": step_name,
                "status": "completed",
                "progress": 1.0,
                "metadata": metadata,
            })

            logger.info("Step '%s' completed in %.1fs", step_name, elapsed)

        except Exception as exc:
            tb = traceback.format_exc()
            logger.error("Step '%s' failed: %s\n%s", step_name, exc, tb)

            run_entry["steps"][step_name]["status"] = "error"
            run_entry["steps"][step_name]["error"] = str(exc)
            run_entry["status"] = "error"
            run_entry["current_step"] = step_name

            await ws_manager.broadcast(run_id, {
                "type": "step_status",
                "step": step_name,
                "status": "error",
                "error": str(exc),
            })
            return

    # All steps succeeded
    run_entry["status"] = "completed"
    run_entry["current_step"] = None

    await ws_manager.broadcast(run_id, {
        "type": "pipeline_complete",
        "status": "completed",
    })

    logger.info("Pipeline %s completed successfully", run_id)

"""
Pipeline orchestrator -- runs the full Ironsite Spatial pipeline in
background threads and broadcasts progress over WebSocket.

Supports pickle-based caching (matching the original pipeline.py cache
format) so repeated runs with the same video skip completed steps.
"""

import asyncio
import glob
import json
import logging
import os
import pickle
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


def _get_cache_dir(config: dict) -> str:
    """Return the cache directory for this video, creating it if needed."""
    video_path = config["video_path"]
    output_dir = os.path.join(os.path.dirname(video_path), "output")
    cache_dir = os.path.join(output_dir, ".cache")
    os.makedirs(cache_dir, exist_ok=True)
    return cache_dir


def _load_cache(cache_path: str):
    """Load a pickle cache file, return None if missing or corrupt."""
    if not os.path.exists(cache_path):
        return None
    try:
        with open(cache_path, "rb") as f:
            return pickle.load(f)
    except Exception as e:
        logger.warning("Cache load failed for %s: %s", cache_path, e)
        return None


def _save_cache(cache_path: str, obj):
    """Save object to pickle cache."""
    with open(cache_path, "wb") as f:
        pickle.dump(obj, f)


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

    output_dir = os.path.join(os.path.dirname(video_path), "output")
    scene_dir = os.path.join(output_dir, "scene")
    frames_dir = os.path.join(scene_dir, "images")
    os.makedirs(frames_dir, exist_ok=True)

    data["output_dir"] = output_dir
    data["scene_dir"] = scene_dir
    data["frames_dir"] = frames_dir

    # Check cache
    cache_dir = _get_cache_dir(config)
    cache_path = os.path.join(cache_dir, "preprocess.pkl")
    existing_frames = glob.glob(os.path.join(frames_dir, "*.jpg"))

    cached = _load_cache(cache_path)
    if cached and existing_frames:
        logger.info("Preprocess: loaded from cache (%d keyframes)", len(cached["keyframes"]))
        data["keyframes"] = cached["keyframes"]
        data["timestamps"] = cached["timestamps"]
        data["frame_indices"] = cached["frame_indices"]
        data["fps"] = cached["fps"]
        data["w"] = cached["w"]
        data["h"] = cached["h"]
        return {
            "num_keyframes": len(cached["keyframes"]),
            "fps": cached["fps"],
            "resolution": f"{cached['w']}x{cached['h']}",
            "cached": True,
        }

    keyframes, timestamps, frame_indices, fps, w, h = extract_keyframes(
        video_path, frames_dir, interval=interval,
        k_scale=FISHEYE_K_SCALE, D=FISHEYE_D, balance=FISHEYE_BALANCE,
        max_frames=max_frames,
    )

    _save_cache(cache_path, {
        "keyframes": keyframes, "timestamps": timestamps,
        "frame_indices": frame_indices, "fps": fps, "w": w, "h": h,
    })

    data["keyframes"] = keyframes
    data["timestamps"] = timestamps
    data["frame_indices"] = frame_indices
    data["fps"] = fps
    data["w"] = w
    data["h"] = h

    return {
        "num_keyframes": len(keyframes),
        "fps": fps,
        "resolution": f"{w}x{h}",
        "cached": False,
    }


def _step_dino(config: dict, data: dict) -> dict:
    """Step 2a: Grounding DINO zero-shot object detection."""
    _ensure_project_on_path()

    cache_dir = _get_cache_dir(config)
    dino_cache = os.path.join(cache_dir, "dino.pkl")

    dino_cached = _load_cache(dino_cache)
    if dino_cached:
        logger.info("DINO: loaded from cache (%d frames)", len(dino_cached))
        data["dino_results"] = dino_cached
        total_boxes = sum(len(r.get("boxes", [])) for r in dino_cached.values())
        unique_labels = set()
        for r in dino_cached.values():
            unique_labels.update(r.get("labels", []))
        return {
            "frames_detected": len(dino_cached),
            "total_boxes": total_boxes,
            "unique_labels": sorted(unique_labels),
            "cached": True,
        }

    import torch
    from config import TEXT_PROMPT, DETECTION_THRESHOLD, REDETECT_EVERY
    from utils.detection import run_dino_detections

    device = "cuda" if torch.cuda.is_available() else "cpu"
    keyframes = data["keyframes"]

    dino_results = run_dino_detections(
        keyframes, device,
        text_prompt=TEXT_PROMPT,
        threshold=DETECTION_THRESHOLD,
        redetect_every=REDETECT_EVERY,
    )
    _save_cache(dino_cache, dino_results)

    data["dino_results"] = dino_results

    total_boxes = sum(len(r.get("boxes", [])) for r in dino_results.values())
    unique_labels = set()
    for r in dino_results.values():
        unique_labels.update(r.get("labels", []))

    return {
        "frames_detected": len(dino_results),
        "total_boxes": total_boxes,
        "unique_labels": sorted(unique_labels),
        "cached": False,
    }


def _step_tracking(config: dict, data: dict) -> dict:
    """Step 2b: SAM2 video tracking across all frames."""
    _ensure_project_on_path()

    cache_dir = _get_cache_dir(config)
    tracking_cache = os.path.join(cache_dir, "tracking.pkl")

    tracking_cached = _load_cache(tracking_cache)
    if tracking_cached:
        logger.info("Tracking: loaded from cache")
        data["all_detections"] = tracking_cached["all_detections"]
        data["object_labels"] = tracking_cached["object_labels"]
        total_dets = sum(len(d) for d in tracking_cached["all_detections"])
        return {
            "total_detections": total_dets,
            "unique_objects": len(tracking_cached["object_labels"]),
            "frames_tracked": len(tracking_cached["all_detections"]),
            "cached": True,
        }

    import torch
    from config import REDETECT_EVERY, SAM2_CHECKPOINT, SAM2_CONFIG
    from utils.detection import run_sam2_tracking

    device = "cuda" if torch.cuda.is_available() else "cpu"
    keyframes = data["keyframes"]
    frames_dir = data["frames_dir"]
    dino_results = data["dino_results"]

    all_detections, object_labels = run_sam2_tracking(
        keyframes, frames_dir, device, dino_results,
        redetect_every=REDETECT_EVERY,
        sam2_checkpoint=SAM2_CHECKPOINT,
        sam2_config=SAM2_CONFIG,
    )
    _save_cache(tracking_cache, {
        "all_detections": all_detections,
        "object_labels": object_labels,
    })

    data["all_detections"] = all_detections
    data["object_labels"] = object_labels

    total_dets = sum(len(d) for d in all_detections)
    return {
        "total_detections": total_dets,
        "unique_objects": len(object_labels),
        "frames_tracked": len(all_detections),
        "cached": False,
    }


def _step_reconstruction(config: dict, data: dict) -> dict:
    """Step 3: 3D reconstruction via VGGT-X or FastVGGT."""
    _ensure_project_on_path()

    backend = config.get("backend", "vggtx")
    cache_dir = _get_cache_dir(config)
    cache_path = os.path.join(cache_dir, f"recon_{backend}.pkl")

    cached = _load_cache(cache_path)
    if cached:
        logger.info("Reconstruction: loaded from cache (%d points)", len(cached.get("points_xyz", [])))
        data["recon_data"] = cached
        return {
            "backend": backend,
            "num_poses": len(cached.get("image_data", {})),
            "point_cloud_size": len(cached.get("points_xyz", [])),
            "depth_maps": len(cached.get("depth_map_cache", {})),
            "total_distance": round(cached.get("total_distance", 0), 2),
            "cached": True,
        }

    from config import (
        FASTVGGT_MERGING, FASTVGGT_MERGE_RATIO, FASTVGGT_DEPTH_CONF,
        FASTVGGT_MAX_POINTS, VGGTX_CHUNK_SIZE, VGGTX_MAX_QUERY_PTS,
        VGGTX_MAX_POINTS,
    )
    from utils.depth import run_full_3d_pipeline

    scene_dir = data["scene_dir"]
    output_dir = data["output_dir"]
    num_keyframes = len(data["keyframes"])

    recon_data = run_full_3d_pipeline(
        scene_dir=scene_dir, output_dir=output_dir,
        merging=FASTVGGT_MERGING, merge_ratio=FASTVGGT_MERGE_RATIO,
        depth_conf_thresh=FASTVGGT_DEPTH_CONF, max_points=FASTVGGT_MAX_POINTS,
        num_keyframes=num_keyframes, backend=backend,
        chunk_size=VGGTX_CHUNK_SIZE, max_query_pts=VGGTX_MAX_QUERY_PTS,
        vggtx_max_points=VGGTX_MAX_POINTS,
    )
    _save_cache(cache_path, recon_data)

    data["recon_data"] = recon_data

    return {
        "backend": backend,
        "num_poses": len(recon_data.get("image_data", {})),
        "point_cloud_size": len(recon_data.get("points_xyz", [])),
        "depth_maps": len(recon_data.get("depth_map_cache", {})),
        "total_distance": round(recon_data.get("total_distance", 0), 2),
        "cached": False,
    }


def _step_scene_graphs(config: dict, data: dict) -> dict:
    """Step 4: Build scene graphs."""
    _ensure_project_on_path()

    cache_dir = _get_cache_dir(config)
    cache_path = os.path.join(cache_dir, "scene_graphs.pkl")

    cached = _load_cache(cache_path)
    if cached:
        logger.info("Scene graphs: loaded from cache (%d graphs)", len(cached))
        data["scene_graphs"] = cached
        all_labels = set()
        for sg in cached:
            for obj in sg["objects"]:
                all_labels.add(obj["label"])
        return {
            "num_graphs": len(cached),
            "unique_classes": sorted(all_labels),
            "avg_objects_per_frame": round(
                float(np.mean([sg["num_objects"] for sg in cached])), 1
            ) if cached else 0,
            "cached": True,
        }

    from utils.scene_graph import build_scene_graphs

    scene_graphs = build_scene_graphs(
        data["keyframes"],
        data["all_detections"],
        data["recon_data"],
        data["timestamps"],
        data["frame_indices"],
    )
    _save_cache(cache_path, scene_graphs)

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

    data["spatial_graph"] = spatial_graph
    data["graph_data"] = spatial_graph.to_frontend_json()

    stats = spatial_graph.stats()
    return {
        "total_nodes": stats["total_nodes"],
        "total_edges": stats["total_edges"],
        "node_types": stats["node_types"],
    }


def _step_events(config: dict, data: dict) -> dict:
    """Step 4.75: Extract events from scene graphs."""
    _ensure_project_on_path()

    cache_dir = _get_cache_dir(config)
    cache_path = os.path.join(cache_dir, "events.pkl")

    cached = _load_cache(cache_path)
    if cached:
        logger.info("Events: loaded from cache (%d events)", len(cached.get("events", [])))
        data["event_result"] = cached
        stats = cached.get("stats", {})
        return {
            "num_events": len(cached.get("events", [])),
            "timeline_segments": len(cached.get("timeline", [])),
            "production_pct": stats.get("production_pct", 0),
            "prep_pct": stats.get("prep_pct", 0),
            "downtime_pct": stats.get("downtime_pct", 0),
            "cached": True,
        }

    from utils.events import extract_events

    recon_data = data.get("recon_data", {})
    cam_smooth = recon_data.get("cam_positions_smooth")
    event_result = extract_events(data["scene_graphs"], cam_smooth)
    _save_cache(cache_path, event_result)
    data["event_result"] = event_result

    output_dir = data["output_dir"]
    with open(os.path.join(output_dir, "events.json"), "w") as f:
        json.dump(event_result, f, indent=2, default=str)

    stats = event_result.get("stats", {})
    return {
        "num_events": len(event_result.get("events", [])),
        "timeline_segments": len(event_result.get("timeline", [])),
        "production_pct": stats.get("production_pct", 0),
        "prep_pct": stats.get("prep_pct", 0),
        "downtime_pct": stats.get("downtime_pct", 0),
    }


def _step_memory(config: dict, data: dict) -> dict:
    """Step 5: Build FAISS spatial memory."""
    _ensure_project_on_path()
    from utils.memory import SpatialMemory

    output_dir = data["output_dir"]
    memory_dir = os.path.join(output_dir, "memory_store")

    # Check if memory store already exists on disk
    meta_path = os.path.join(memory_dir, "meta.json")
    if os.path.exists(meta_path):
        try:
            with open(meta_path) as f:
                meta = json.load(f)
            memory = SpatialMemory(memory_dir)
            memory.id_map = meta.get("id_map", [])
            data["memory"] = memory
            logger.info("Memory: loaded from disk (%d entries)", len(memory.id_map))
            return {
                "entries": len(memory.id_map),
                "size_kb": meta.get("size_kb", 0),
                "cached": True,
            }
        except Exception:
            pass

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
    """Step 6: VLM narrator (optional -- summarizes events)."""
    grok_key = config.get("grok_key")
    skip_vlm = config.get("skip_vlm", True)

    event_result = data.get("event_result", {})
    data["vlm_analysis"] = {
        **(event_result.get("stats", {})),
        "activity_timeline": event_result.get("timeline", []),
        "events": event_result.get("events", []),
        "safety": event_result.get("ppe_report", {}),
    }

    if skip_vlm or not grok_key:
        data["vlm_skipped"] = True
        return {"skipped": True, "reason": "skip_vlm flag or no grok_key",
                "events_available": True}

    _ensure_project_on_path()
    from config import GROK_MODEL, GROK_BASE_URL, VLM_NUM_SAMPLES, VLM_TEMPERATURE, VLM_MAX_TOKENS
    from utils.vlm import run_vlm_analysis
    from utils.events import events_to_vlm_context

    event_context = events_to_vlm_context(event_result) if event_result else None

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
        event_context=event_context,
    )

    data["vlm_analysis"] = analysis
    data["vlm_skipped"] = False

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
    ("dino", _step_dino),
    ("tracking", _step_tracking),
    ("reconstruction", _step_reconstruction),
    ("scene_graphs", _step_scene_graphs),
    ("graph", _step_graph),
    ("events", _step_events),
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
    stays responsive. Steps with cached results complete instantly.
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

            cached = metadata.get("cached", False)
            logger.info("Step '%s' %s in %.1fs", step_name,
                        "loaded from cache" if cached else "completed", elapsed)

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

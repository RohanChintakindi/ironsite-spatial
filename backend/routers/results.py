"""
Result endpoints -- serve pipeline outputs (frames, detections, point-cloud,
trajectory, scene graphs, VLM analysis, dashboard data).
"""

import io
import logging

import numpy as np
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse

from backend.services.serializer import (
    annotated_frame_jpeg,
    dashboard_data_from_scene_graphs,
    depth_to_plasma_jpeg,
    frame_to_jpeg,
    pointcloud_to_binary,
)

router = APIRouter()
logger = logging.getLogger("ironsite.results")


def _get_run(run_id: str, request: Request) -> dict:
    """Look up a run or raise 404."""
    runs = request.app.state.runs
    if run_id not in runs:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found")
    return runs[run_id]


def _get_data(run: dict) -> dict:
    """Return the run's data dict, raising 409 if it is not ready yet."""
    data = run.get("data", {})
    if not data:
        raise HTTPException(
            status_code=409,
            detail="Pipeline has not produced data yet. Check status.",
        )
    return data


# ------------------------------------------------------------------
# Preprocess metadata
# ------------------------------------------------------------------

@router.get("/{run_id}/preprocess")
async def get_preprocess_info(run_id: str, request: Request):
    """Return keyframe extraction metadata."""
    run = _get_run(run_id, request)
    data = _get_data(run)

    keyframes = data.get("keyframes")
    if keyframes is None:
        raise HTTPException(status_code=409, detail="Preprocess step not completed")

    timestamps = data.get("timestamps", [])
    fps = data.get("fps", 0)
    w = data.get("w", 0)
    h = data.get("h", 0)

    return {
        "count": len(keyframes),
        "fps": fps,
        "resolution": {"width": w, "height": h},
        "timestamps": [round(t, 3) for t in timestamps],
    }


# ------------------------------------------------------------------
# Individual frames
# ------------------------------------------------------------------

@router.get("/{run_id}/frame/{idx}")
async def get_frame(run_id: str, idx: int, request: Request):
    """Return the undistorted keyframe at *idx* as JPEG."""
    run = _get_run(run_id, request)
    data = _get_data(run)

    keyframes = data.get("keyframes")
    if keyframes is None:
        raise HTTPException(status_code=409, detail="Preprocess step not completed")
    if idx < 0 or idx >= len(keyframes):
        raise HTTPException(status_code=404, detail=f"Frame index {idx} out of range [0, {len(keyframes) - 1}]")

    jpeg_bytes = frame_to_jpeg(keyframes[idx])
    return StreamingResponse(io.BytesIO(jpeg_bytes), media_type="image/jpeg")


@router.get("/{run_id}/frame/{idx}/annotated")
async def get_annotated_frame(run_id: str, idx: int, request: Request):
    """Return keyframe *idx* with bounding-box overlays as JPEG."""
    run = _get_run(run_id, request)
    data = _get_data(run)

    keyframes = data.get("keyframes")
    scene_graphs = data.get("scene_graphs")
    if keyframes is None:
        raise HTTPException(status_code=409, detail="Preprocess step not completed")
    if scene_graphs is None:
        raise HTTPException(status_code=409, detail="Scene graph step not completed")
    if idx < 0 or idx >= len(keyframes):
        raise HTTPException(status_code=404, detail=f"Frame index {idx} out of range")

    objects = scene_graphs[idx].get("objects", [])
    jpeg_bytes = annotated_frame_jpeg(keyframes[idx], objects)
    return StreamingResponse(io.BytesIO(jpeg_bytes), media_type="image/jpeg")


@router.get("/{run_id}/frame/{idx}/depth")
async def get_depth_frame(run_id: str, idx: int, request: Request):
    """Return a plasma-colormapped depth image for keyframe *idx*."""
    run = _get_run(run_id, request)
    data = _get_data(run)

    recon_data = data.get("recon_data")
    if recon_data is None:
        raise HTTPException(status_code=409, detail="Reconstruction step not completed")

    depth_cache = recon_data.get("depth_map_cache", {})
    fname = f"{idx:06d}.jpg"
    depth_map = depth_cache.get(fname)

    if depth_map is None:
        raise HTTPException(status_code=404, detail=f"No depth map for frame {idx}")

    jpeg_bytes = depth_to_plasma_jpeg(depth_map)
    return StreamingResponse(io.BytesIO(jpeg_bytes), media_type="image/jpeg")


# ------------------------------------------------------------------
# Detections
# ------------------------------------------------------------------

@router.get("/{run_id}/detections")
async def get_detections(run_id: str, request: Request):
    """Return all per-frame detections derived from scene graphs."""
    run = _get_run(run_id, request)
    data = _get_data(run)

    scene_graphs = data.get("scene_graphs")
    if scene_graphs is None:
        raise HTTPException(status_code=409, detail="Scene graph step not completed")

    frames = []
    for sg in scene_graphs:
        frame_dets = {
            "frame_index": sg["frame_index"],
            "timestamp": sg["timestamp"],
            "timestamp_str": sg["timestamp_str"],
            "objects": [
                {
                    "id": obj["id"],
                    "label": obj["label"],
                    "bbox": obj["bbox"],
                    "depth_m": obj.get("depth_m"),
                    "position_3d": obj.get("position_3d"),
                    "confidence": obj.get("confidence"),
                }
                for obj in sg["objects"]
            ],
        }
        frames.append(frame_dets)

    return frames


# ------------------------------------------------------------------
# Point cloud
# ------------------------------------------------------------------

@router.get("/{run_id}/pointcloud")
async def get_pointcloud(run_id: str, request: Request):
    """Return the point cloud as a binary Float32 buffer.

    Layout per point: ``[x, y, z, r, g, b]`` (r/g/b normalised 0-1).
    Subsampled to 30 000 points.
    """
    run = _get_run(run_id, request)
    data = _get_data(run)

    recon_data = data.get("recon_data")
    if recon_data is None:
        raise HTTPException(status_code=409, detail="Reconstruction step not completed")

    points_xyz = recon_data.get("points_xyz", np.zeros((0, 3)))
    points_rgb = recon_data.get("points_rgb", np.zeros((0, 3), dtype=np.uint8))

    binary = pointcloud_to_binary(points_xyz, points_rgb, max_points=30000)
    return StreamingResponse(
        io.BytesIO(binary),
        media_type="application/octet-stream",
        headers={"Content-Length": str(len(binary))},
    )


# ------------------------------------------------------------------
# Trajectory
# ------------------------------------------------------------------

@router.get("/{run_id}/trajectory")
async def get_trajectory(run_id: str, request: Request):
    """Return the smoothed camera trajectory."""
    run = _get_run(run_id, request)
    data = _get_data(run)

    recon_data = data.get("recon_data")
    if recon_data is None:
        raise HTTPException(status_code=409, detail="Reconstruction step not completed")

    cam_smooth = recon_data.get("cam_positions_smooth", np.zeros((0, 3)))
    total_distance = recon_data.get("total_distance", 0.0)

    positions = []
    for i, row in enumerate(cam_smooth):
        positions.append({
            "x": round(float(row[0]), 4),
            "y": round(float(row[1]), 4),
            "z": round(float(row[2]), 4),
            "frame_index": i,
        })

    return {
        "positions": positions,
        "total_distance": round(total_distance, 3),
    }


# ------------------------------------------------------------------
# Scene graphs (raw JSON)
# ------------------------------------------------------------------

@router.get("/{run_id}/scene-graphs")
async def get_scene_graphs(run_id: str, request: Request):
    """Return the full scene-graph list."""
    run = _get_run(run_id, request)
    data = _get_data(run)

    scene_graphs = data.get("scene_graphs")
    if scene_graphs is None:
        raise HTTPException(status_code=409, detail="Scene graph step not completed")

    return scene_graphs


# ------------------------------------------------------------------
# VLM analysis
# ------------------------------------------------------------------

@router.get("/{run_id}/vlm")
async def get_vlm_analysis(run_id: str, request: Request):
    """Return the VLM reasoning output."""
    run = _get_run(run_id, request)
    data = _get_data(run)

    vlm = data.get("vlm_analysis")
    if vlm is None:
        return {"skipped": True, "analysis": {}}

    return {"skipped": False, "analysis": vlm}


# ------------------------------------------------------------------
# Spatial graph data
# ------------------------------------------------------------------

@router.get("/{run_id}/graph")
async def get_graph_data(run_id: str, request: Request):
    """Return spatial graph nodes + edges for frontend visualization."""
    run = _get_run(run_id, request)
    data = _get_data(run)

    graph_data = data.get("graph_data")
    if graph_data is None:
        raise HTTPException(status_code=409, detail="Graph step not completed")

    return graph_data


# ------------------------------------------------------------------
# Dashboard aggregated data
# ------------------------------------------------------------------

@router.get("/{run_id}/dashboard-data")
async def get_dashboard_data(run_id: str, request: Request):
    """Return aggregated analytics for the frontend dashboard."""
    run = _get_run(run_id, request)
    data = _get_data(run)

    scene_graphs = data.get("scene_graphs")
    recon_data = data.get("recon_data")
    if scene_graphs is None or recon_data is None:
        raise HTTPException(
            status_code=409,
            detail="Scene graph and reconstruction steps must be completed first",
        )

    dashboard = dashboard_data_from_scene_graphs(scene_graphs, recon_data)
    return dashboard

"""
Pydantic v2 models for the Ironsite Spatial backend API.
"""

from typing import Literal, Optional
from pydantic import BaseModel, Field


class PipelineConfig(BaseModel):
    video_path: str
    backend: Literal["vggtx", "fastvggt"] = "vggtx"
    keyframe_interval: int = 10
    max_frames: int = 0
    grok_key: Optional[str] = None
    skip_vlm: bool = True


class PipelineStartResponse(BaseModel):
    run_id: str


class StepStatus(BaseModel):
    step: str
    status: Literal["pending", "started", "progress", "completed", "error"]
    progress: float = Field(default=0.0, ge=0.0, le=1.0)
    metadata: Optional[dict] = None
    error: Optional[str] = None


class PipelineStatus(BaseModel):
    run_id: str
    status: Literal["running", "completed", "error"]
    current_step: Optional[str] = None
    steps: dict[str, StepStatus] = {}


class DetectionObject(BaseModel):
    id: int
    label: str
    bbox: list[float]
    depth_m: Optional[float] = None
    position_3d: Optional[list[float]] = None
    confidence: Optional[float] = None


class FrameDetections(BaseModel):
    frame_index: int
    timestamp: float
    timestamp_str: str
    objects: list[DetectionObject]


class CameraPosition(BaseModel):
    x: float
    y: float
    z: float
    frame_index: Optional[int] = None


class TrajectoryData(BaseModel):
    positions: list[CameraPosition]
    total_distance: float


class MemoryQuery(BaseModel):
    query_type: Literal["label", "depth_range", "proximity"]
    label: Optional[str] = None
    label_a: Optional[str] = None
    label_b: Optional[str] = None
    min_depth: Optional[float] = None
    max_depth: Optional[float] = None
    max_distance: Optional[float] = None


class MemoryResult(BaseModel):
    query: MemoryQuery
    count: int
    entries: list[dict]


class DashboardData(BaseModel):
    detections_per_class: dict[str, int]
    depth_values: list[float]
    depth_timestamps: list[dict]
    spatial_positions: list[dict]
    camera_path: list[dict]
    heatmap_data: dict

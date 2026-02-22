"""
Serialization helpers: convert numpy arrays and pipeline data into
wire-friendly formats (JPEG bytes, binary point-cloud buffers, dashboard JSON).
"""

import io
import struct
from collections import Counter

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

CLASS_COLORS: dict[str, tuple[int, int, int]] = {
    "person": (0, 200, 100),
    "worker": (0, 200, 100),
    "cinder block": (50, 150, 255),
    "concrete block": (30, 120, 220),
    "safety vest": (255, 165, 0),
    "hard hat": (0, 255, 255),
    "head protection": (0, 255, 255),
    "crane": (220, 50, 50),
    "scaffolding": (180, 50, 220),
    "trowel": (255, 255, 0),
    "hand protection": (255, 200, 0),
    "gloved hand": (255, 200, 0),
}

DEFAULT_COLOR: tuple[int, int, int] = (200, 200, 200)


def frame_to_jpeg(frame_rgb: np.ndarray, quality: int = 85) -> bytes:
    """Convert an RGB numpy array to JPEG bytes."""
    img = Image.fromarray(frame_rgb)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality)
    return buf.getvalue()


def annotated_frame_jpeg(
    frame_rgb: np.ndarray,
    objects: list[dict],
    quality: int = 85,
) -> bytes:
    """Draw bounding boxes with class-coloured labels, then encode as JPEG.

    Each label shows:
        <label> <confidence>
        <depth_m>m
    """
    img = Image.fromarray(frame_rgb.copy())
    draw = ImageDraw.Draw(img, "RGBA")

    try:
        font = ImageFont.truetype("arial.ttf", 14)
    except (OSError, IOError):
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 14)
        except (OSError, IOError):
            font = ImageFont.load_default()

    for obj in objects:
        label = obj.get("label", "unknown")
        color = CLASS_COLORS.get(label, DEFAULT_COLOR)
        bbox = obj.get("bbox", [0, 0, 0, 0])
        x1, y1, x2, y2 = [int(v) for v in bbox]
        confidence = obj.get("confidence")
        depth_m = obj.get("depth_m")

        # Rectangle outline (2px)
        for offset in range(2):
            draw.rectangle(
                [x1 - offset, y1 - offset, x2 + offset, y2 + offset],
                outline=color,
            )

        # Build text lines
        conf_str = f" {confidence:.2f}" if confidence is not None else ""
        line1 = f"{label}{conf_str}"
        line2 = f"{depth_m:.2f}m" if depth_m is not None and depth_m > 0 else ""
        text = line1 + ("\n" + line2 if line2 else "")

        # Measure text bounding box
        text_bbox = draw.textbbox((x1, y1), text, font=font)
        tw = text_bbox[2] - text_bbox[0]
        th = text_bbox[3] - text_bbox[1]

        # Semi-transparent background (alpha 0.75 ~ 191)
        bg_x1 = x1
        bg_y1 = max(y1 - th - 6, 0)
        bg_x2 = x1 + tw + 6
        bg_y2 = bg_y1 + th + 6
        draw.rectangle(
            [bg_x1, bg_y1, bg_x2, bg_y2],
            fill=color + (191,),
        )

        # Draw text in white
        draw.text((bg_x1 + 3, bg_y1 + 2), text, fill=(255, 255, 255, 255), font=font)

    buf = io.BytesIO()
    img.convert("RGB").save(buf, format="JPEG", quality=quality)
    return buf.getvalue()


def depth_to_plasma_jpeg(depth_map: np.ndarray, quality: int = 85) -> bytes:
    """Normalize a depth map (min-max) and apply the matplotlib plasma colormap,
    then encode as JPEG bytes."""
    import matplotlib.cm as cm

    depth = depth_map.copy().astype(np.float32)
    valid_mask = np.isfinite(depth) & (depth > 0)

    if not valid_mask.any():
        # Return a blank black image when no valid depth data exists
        h, w = depth.shape[:2]
        blank = np.zeros((h, w, 3), dtype=np.uint8)
        return frame_to_jpeg(blank, quality)

    dmin = float(depth[valid_mask].min())
    dmax = float(depth[valid_mask].max())

    if dmax - dmin < 1e-6:
        normalised = np.zeros_like(depth)
    else:
        normalised = (depth - dmin) / (dmax - dmin)

    normalised[~valid_mask] = 0.0

    plasma = cm.get_cmap("plasma")
    coloured = (plasma(normalised)[:, :, :3] * 255).astype(np.uint8)

    # Set invalid pixels to black
    coloured[~valid_mask] = 0

    return frame_to_jpeg(coloured, quality)


def pointcloud_to_binary(
    points_xyz: np.ndarray,
    points_rgb: np.ndarray,
    max_points: int = 30000,
) -> bytes:
    """Subsample the point cloud and interleave as a flat Float32 buffer.

    Layout: [x, y, z, r, g, b, x, y, z, r, g, b, ...]
    where r, g, b are normalised to 0-1.

    Returns raw bytes suitable for a StreamingResponse.
    """
    n = len(points_xyz)
    if n == 0:
        return b""

    if n > max_points:
        indices = np.random.choice(n, max_points, replace=False)
        xyz = points_xyz[indices].astype(np.float32)
        rgb = points_rgb[indices].astype(np.float32)
    else:
        xyz = points_xyz.astype(np.float32)
        rgb = points_rgb.astype(np.float32)

    # Normalise RGB from 0-255 to 0-1 if needed
    if rgb.max() > 1.0:
        rgb = rgb / 255.0

    interleaved = np.empty((len(xyz), 6), dtype=np.float32)
    interleaved[:, 0:3] = xyz
    interleaved[:, 3:6] = rgb

    return interleaved.tobytes()


def dashboard_data_from_scene_graphs(
    scene_graphs: list[dict],
    recon_data: dict,
) -> dict:
    """Aggregate scene-graph and reconstruction data into a dashboard payload.

    Returns a dict matching the DashboardData schema.
    """
    # -- detections per class --
    class_counter: Counter = Counter()
    depth_values: list[float] = []
    depth_timestamps: list[dict] = []
    spatial_positions: list[dict] = []

    for sg in scene_graphs:
        time_idx = sg["frame_index"]
        for obj in sg["objects"]:
            label = obj["label"]
            class_counter[label] += 1

            dm = obj.get("depth_m", 0)
            if dm and dm > 0:
                depth_values.append(dm)
                depth_timestamps.append({
                    "label": label,
                    "depth": round(dm, 3),
                    "time_idx": time_idx,
                })

            pos = obj.get("position_3d")
            if pos and any(p != 0 for p in pos):
                spatial_positions.append({
                    "x": round(pos[0], 4),
                    "z": round(pos[2], 4),
                    "label": label,
                })

    # -- camera path --
    cam_smooth = recon_data.get("cam_positions_smooth", np.zeros((0, 3)))
    camera_path: list[dict] = []
    if len(cam_smooth) > 0:
        for row in cam_smooth:
            camera_path.append({
                "x": round(float(row[0]), 4),
                "z": round(float(row[2]), 4),
            })

    # -- heatmap (2D histogram of spatial positions) --
    if spatial_positions:
        xs = [p["x"] for p in spatial_positions]
        zs = [p["z"] for p in spatial_positions]
        counts, x_edges, z_edges = np.histogram2d(xs, zs, bins=20)
        heatmap_data = {
            "x_bins": [round(float(v), 4) for v in x_edges.tolist()],
            "z_bins": [round(float(v), 4) for v in z_edges.tolist()],
            "counts": counts.tolist(),
        }
    else:
        heatmap_data = {
            "x_bins": [],
            "z_bins": [],
            "counts": [],
        }

    return {
        "detections_per_class": dict(class_counter),
        "depth_values": [round(d, 3) for d in depth_values],
        "depth_timestamps": depth_timestamps,
        "spatial_positions": spatial_positions,
        "camera_path": camera_path,
        "heatmap_data": heatmap_data,
    }

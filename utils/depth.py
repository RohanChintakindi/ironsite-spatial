"""
3D reconstruction via FastVGGT.
Runs FastVGGT → parses COLMAP output + depth maps → returns poses, depths, point cloud.
"""

import subprocess
import os
import time
import numpy as np
import pycolmap
from pathlib import Path


def run_fastvggt(scene_dir, output_dir, merging=6, merge_ratio=0.9,
                 depth_conf_thresh=3.0, max_points=100000):
    """Run FastVGGT reconstruction script."""

    cmd_parts = [
        "python", "-u", "scripts/run_fastvggt.py",
        f"--scene_dir", scene_dir,
        f"--output_dir", output_dir,
        f"--merging", str(merging),
        f"--merge_ratio", str(merge_ratio),
        f"--depth_conf_thresh", str(depth_conf_thresh),
        f"--max_points", str(max_points),
    ]

    cmd = " ".join(cmd_parts)
    print(f"Running FastVGGT:\n  {cmd}\n")

    t0 = time.time()
    result = subprocess.run(cmd, shell=True)

    if result.returncode != 0:
        raise RuntimeError("FastVGGT failed! Check errors above.")

    elapsed = time.time() - t0
    print(f"FastVGGT completed in {elapsed:.1f}s")


def find_colmap_output(output_dir):
    """Find the COLMAP sparse reconstruction directory."""
    candidates = [
        os.path.join(output_dir, "sparse", "0"),
        os.path.join(output_dir, "sparse"),
    ]

    for c in candidates:
        if os.path.exists(os.path.join(c, "cameras.bin")):
            return c

    raise FileNotFoundError(
        f"Could not find COLMAP output in {output_dir}. Searched:\n" +
        "\n".join(f"  {c}" for c in candidates)
    )


def find_depth_dir(output_dir):
    """Find the depth maps directory."""
    depth_dir = os.path.join(output_dir, "estimated_depths")
    if os.path.exists(depth_dir):
        npy_files = [f for f in os.listdir(depth_dir) if f.endswith(".npy")]
        if npy_files:
            return depth_dir
    return None


def parse_colmap(colmap_dir):
    """Parse COLMAP output using pycolmap. Returns cameras, image poses, 3D points."""
    print(f"Parsing COLMAP from: {colmap_dir}")
    reconstruction = pycolmap.Reconstruction(colmap_dir)

    print(f"  Cameras  : {len(reconstruction.cameras)}")
    print(f"  Images   : {len(reconstruction.images)}")
    print(f"  3D Points: {len(reconstruction.points3D)}")

    # Camera intrinsics
    cam = list(reconstruction.cameras.values())[0]
    params = cam.params
    if len(params) == 3:  # SIMPLE_PINHOLE
        fx = fy = params[0]
        cx, cy = params[1], params[2]
    elif len(params) >= 4:  # PINHOLE or more
        fx, fy, cx, cy = params[0], params[1], params[2], params[3]
    else:
        fx = fy = 500.0
        cx, cy = cam.width / 2, cam.height / 2

    intrinsics = np.array([
        [fx, 0, cx],
        [0, fy, cy],
        [0, 0, 1]
    ], dtype=np.float32)
    print(f"  Intrinsics: fx={fx:.1f}, fy={fy:.1f}, cx={cx:.1f}, cy={cy:.1f}")

    # Per-image extrinsics (world-to-camera transforms)
    image_data = {}
    for img in reconstruction.images.values():
        T = img.cam_from_world.matrix()  # 4x4 world-to-camera
        R = T[:3, :3]
        t = T[:3, 3]
        cam_center = -R.T @ t  # camera position in world coords

        image_data[img.name] = {
            "extrinsics": T.astype(np.float32),
            "cam_center": cam_center.astype(np.float32),
        }

    # 3D point cloud
    points_xyz = np.array([pt.xyz for pt in reconstruction.points3D.values()])
    points_rgb = np.array([pt.color for pt in reconstruction.points3D.values()])

    # Per-image 3D point lookup
    from collections import defaultdict
    img_to_points3d = defaultdict(list)
    for pt in reconstruction.points3D.values():
        for track_el in pt.track.elements:
            img_id = track_el.image_id
            if img_id in reconstruction.images:
                img_obj = reconstruction.images[img_id]
                p2d = img_obj.points2D[track_el.point2D_idx]
                img_to_points3d[img_obj.name].append({
                    "xyz": pt.xyz.tolist(),
                    "xy": [float(p2d.xy[0]), float(p2d.xy[1])],
                    "rgb": pt.color.tolist(),
                })

    return intrinsics, image_data, points_xyz, points_rgb, img_to_points3d


def load_depth_maps(depth_dir, num_keyframes):
    """Load depth maps (.npy files)."""
    if depth_dir is None:
        print("No depth directory found")
        return {}

    depth_files = sorted([f for f in os.listdir(depth_dir) if f.endswith(".npy")])
    print(f"Loading {len(depth_files)} depth maps from {depth_dir}")

    depth_map_cache = {}
    for df in depth_files:
        depth = np.load(os.path.join(depth_dir, df))
        if depth.ndim == 3:
            depth = depth[..., 0]

        # Match depth file to image name
        img_name = (df
                    .replace("_depth.npy", ".jpg")
                    .replace(".npy", ".jpg"))
        depth_map_cache[img_name] = depth

    print(f"Loaded {len(depth_map_cache)} depth maps")
    return depth_map_cache


def get_depth_at_bbox(depth_map_cache, img_name, bbox, img_hw):
    """Get depth at a bounding box using depth map."""
    x1, y1, x2, y2 = [int(v) for v in bbox]

    if img_name not in depth_map_cache:
        return 0.0

    dep = depth_map_cache[img_name]
    H_d, W_d = dep.shape
    H_o, W_o = img_hw
    sx, sy = W_d / W_o, H_d / H_o

    px1 = max(0, int(x1 * sx))
    py1 = max(0, int(y1 * sy))
    px2 = min(W_d - 1, int(x2 * sx))
    py2 = min(H_d - 1, int(y2 * sy))

    patch = dep[py1:py2, px1:px2].ravel()
    # Filter NaN values (from confidence filtering)
    patch = patch[np.isfinite(patch)]
    if len(patch) < 3:
        cy_d = int((y1 + y2) / 2 * sy)
        cx_d = int((x1 + x2) / 2 * sx)
        cy_d = min(cy_d, H_d - 1)
        cx_d = min(cx_d, W_d - 1)
        val = float(dep[cy_d, cx_d])
        return val if np.isfinite(val) else 0.0

    # Outlier-filtered median
    med = np.median(patch)
    std = np.nanstd(patch)
    inliers = patch[np.abs(patch - med) < std * 1.5 + 1e-6]
    return float(np.median(inliers)) if len(inliers) > 2 else float(med)


def unproject_to_world(cx_px, cy_px, depth, intrinsics, extrinsics):
    """Unproject a 2D pixel + depth into COLMAP world coordinates."""
    if depth <= 0 or not np.isfinite(depth):
        return [0.0, 0.0, 0.0]

    fx, fy = intrinsics[0, 0], intrinsics[1, 1]
    ppx, ppy = intrinsics[0, 2], intrinsics[1, 2]

    X_cam = (cx_px - ppx) * depth / fx
    Y_cam = (cy_px - ppy) * depth / fy
    Z_cam = depth

    R = extrinsics[:3, :3]
    t = extrinsics[:3, 3]
    p_cam = np.array([X_cam, Y_cam, Z_cam])
    p_world = R.T @ (p_cam - t)

    return [round(float(v), 4) for v in p_world]


def run_full_3d_pipeline(scene_dir, output_dir, merging=6, merge_ratio=0.9,
                         depth_conf_thresh=3.0, max_points=100000, num_keyframes=0):
    """Run the full FastVGGT pipeline: reconstruct → parse → load depths."""

    recon_dir = os.path.join(output_dir, "recon")

    # Check if already computed
    try:
        colmap_dir = find_colmap_output(recon_dir)
        print(f"Found existing reconstruction: {colmap_dir}")
    except FileNotFoundError:
        run_fastvggt(scene_dir, recon_dir, merging, merge_ratio,
                     depth_conf_thresh, max_points)
        colmap_dir = find_colmap_output(recon_dir)

    # Parse COLMAP
    intrinsics, image_data, points_xyz, points_rgb, img_to_points3d = parse_colmap(colmap_dir)

    # Load depth maps
    depth_dir = find_depth_dir(recon_dir)
    depth_map_cache = load_depth_maps(depth_dir, num_keyframes)

    # Build camera trajectory (smoothed)
    cam_positions = []
    frame_names_ordered = sorted(image_data.keys())
    for fname in frame_names_ordered:
        cam_positions.append(image_data[fname]["cam_center"])
    cam_positions = np.array(cam_positions) if cam_positions else np.zeros((0, 3))

    # Smooth trajectory
    if len(cam_positions) > 10:
        window = 5
        smoothed = np.copy(cam_positions)
        for ax in range(3):
            kernel = np.ones(window) / window
            smoothed[:, ax] = np.convolve(cam_positions[:, ax], kernel, mode="same")
        cam_positions_smooth = smoothed
    else:
        cam_positions_smooth = cam_positions

    total_dist = 0.0
    if len(cam_positions_smooth) > 1:
        total_dist = float(np.sum(np.linalg.norm(
            np.diff(cam_positions_smooth, axis=0), axis=1
        )))

    print(f"\n3D Reconstruction Summary:")
    print(f"  Camera poses: {len(image_data)}")
    print(f"  Point cloud: {len(points_xyz)} points")
    print(f"  Depth maps: {len(depth_map_cache)}")
    print(f"  Worker distance: {total_dist:.1f}m")

    return {
        "intrinsics": intrinsics,
        "image_data": image_data,
        "points_xyz": points_xyz,
        "points_rgb": points_rgb,
        "img_to_points3d": img_to_points3d,
        "depth_map_cache": depth_map_cache,
        "cam_positions": cam_positions,
        "cam_positions_smooth": cam_positions_smooth,
        "total_distance": total_dist,
        "colmap_dir": colmap_dir,
    }

"""
3D reconstruction via VGGT-X or FastVGGT.
Supports both backends:
  - vggtx: VGGT-X with global alignment → metric depth (slower)
  - fastvggt: FastVGGT with token merging → relative depth (faster)
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


def run_vggtx(scene_dir, chunk_size=256, max_query_pts=2048, max_points=500000):
    """Run VGGT-X with global alignment (metric depth).

    VGGT-X outputs to {parent}_vggt_x/{scene_name}/ with:
      - sparse/0/cameras.bin, images.bin, points3D.bin (COLMAP format)
      - estimated_depths/{frame}_depth.npy (per-frame metric depth maps)
    """
    vggtx_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "VGGT-X")
    if not os.path.exists(vggtx_dir):
        raise FileNotFoundError(
            f"VGGT-X not found at {vggtx_dir}. Run:\n"
            f"  git clone --recursive https://github.com/Linketic/VGGT-X.git\n"
            f"  pip install -r VGGT-X/requirements.txt"
        )

    cmd_parts = [
        "python", "-u", f"{vggtx_dir}/demo_colmap.py",
        f"--scene_dir", scene_dir,
        f"--chunk_size", str(chunk_size),
        f"--max_query_pts", str(max_query_pts),
        f"--max_points_for_colmap", str(max_points),
        "--shared_camera",
        "--use_ga",
        "--save_depth",
    ]

    cmd = " ".join(cmd_parts)
    print(f"Running VGGT-X:\n  {cmd}\n")

    t0 = time.time()
    # Stream output in real-time so user sees progress
    proc = subprocess.Popen(cmd, shell=True, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, text=True, bufsize=1)
    for line in proc.stdout:
        print(f"  [VGGT-X] {line}", end="")
    proc.wait()

    if proc.returncode != 0:
        raise RuntimeError("VGGT-X failed! Check errors above.")

    elapsed = time.time() - t0
    print(f"\nVGGT-X completed in {elapsed:.1f}s")

    # VGGT-X outputs to {parent}_vggt_x/{scene_name}/
    parent = os.path.dirname(scene_dir)
    scene_name = os.path.basename(scene_dir)
    return os.path.join(f"{parent}_vggt_x", scene_name)


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
                         depth_conf_thresh=3.0, max_points=100000, num_keyframes=0,
                         backend="vggtx", chunk_size=256, max_query_pts=2048,
                         vggtx_max_points=500000):
    """Run 3D reconstruction pipeline.

    backend="vggtx": VGGT-X with global alignment (metric depth, slower)
    backend="fastvggt": FastVGGT with token merging (relative depth, faster)
    """

    if backend == "vggtx":
        return _run_vggtx_pipeline(scene_dir, output_dir, chunk_size,
                                    max_query_pts, vggtx_max_points, num_keyframes)
    else:
        return _run_fastvggt_pipeline(scene_dir, output_dir, merging, merge_ratio,
                                      depth_conf_thresh, max_points, num_keyframes)


def _run_vggtx_pipeline(scene_dir, output_dir, chunk_size, max_query_pts,
                         max_points, num_keyframes):
    """VGGT-X backend: metric depth via global alignment + COLMAP output."""

    # Check if VGGT-X output already exists
    parent = os.path.dirname(scene_dir)
    scene_name = os.path.basename(scene_dir)
    vggtx_out = os.path.join(f"{parent}_vggt_x", scene_name)

    try:
        colmap_dir = find_colmap_output(vggtx_out)
        print(f"Found existing VGGT-X reconstruction: {colmap_dir}")
    except FileNotFoundError:
        vggtx_out = run_vggtx(scene_dir, chunk_size=chunk_size,
                               max_query_pts=max_query_pts, max_points=max_points)
        colmap_dir = find_colmap_output(vggtx_out)

    # Parse COLMAP (same as notebook)
    intrinsics, image_data, points_xyz, points_rgb, img_to_points3d = parse_colmap(colmap_dir)

    # Load depth maps
    depth_dir = find_depth_dir(vggtx_out)
    depth_map_cache = load_depth_maps(depth_dir, num_keyframes)

    # Sanity check: VGGT-X with GA should give metric depth in meters
    if depth_map_cache:
        all_depths = []
        for dep in depth_map_cache.values():
            valid = dep[np.isfinite(dep) & (dep > 0)]
            if len(valid) > 0:
                all_depths.append(valid)
        if all_depths:
            all_depths = np.concatenate(all_depths)
            print(f"  Depth stats (metric): min={all_depths.min():.2f}m, "
                  f"max={all_depths.max():.2f}m, median={np.median(all_depths):.2f}m")

    # Build camera trajectory
    cam_positions = []
    for fname in sorted(image_data.keys()):
        cam_positions.append(image_data[fname]["cam_center"])
    cam_positions = np.array(cam_positions) if cam_positions else np.zeros((0, 3))

    # Smooth trajectory
    cam_positions_smooth = _smooth_trajectory(cam_positions)
    total_dist = _compute_distance(cam_positions_smooth)

    print(f"\n3D Reconstruction Summary (VGGT-X):")
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


def _run_fastvggt_pipeline(scene_dir, output_dir, merging, merge_ratio,
                            depth_conf_thresh, max_points, num_keyframes):
    """FastVGGT backend: relative depth via token merging."""

    recon_dir = os.path.join(output_dir, "recon")
    npz_path = os.path.join(recon_dir, "predictions.npz")

    if not os.path.exists(npz_path):
        run_fastvggt(scene_dir, recon_dir, merging, merge_ratio,
                     depth_conf_thresh, max_points)

    if not os.path.exists(npz_path):
        raise FileNotFoundError(f"FastVGGT did not produce {npz_path}")

    print(f"Loading predictions from {npz_path}")
    data = np.load(npz_path, allow_pickle=True)
    extrinsics_all = data["extrinsics"]
    intrinsics_all = data["intrinsics"]
    image_names = list(data["image_names"])

    K = intrinsics_all[0]
    fx, fy = float(K[0, 0]), float(K[1, 1])
    cx, cy = float(K[0, 2]), float(K[1, 2])
    intrinsics = np.array([
        [fx, 0, cx],
        [0, fy, cy],
        [0, 0, 1]
    ], dtype=np.float32)
    print(f"  Intrinsics: fx={fx:.1f}, fy={fy:.1f}, cx={cx:.1f}, cy={cy:.1f}")

    image_data = {}
    cam_positions = []
    for i, fname in enumerate(image_names):
        T = extrinsics_all[i].astype(np.float32)
        R = T[:3, :3]
        t = T[:3, 3]
        cam_center = -R.T @ t
        image_data[fname] = {"extrinsics": T, "cam_center": cam_center}
        cam_positions.append(cam_center)

    cam_positions = np.array(cam_positions) if cam_positions else np.zeros((0, 3))

    depth_dir = find_depth_dir(recon_dir)
    depth_map_cache = load_depth_maps(depth_dir, num_keyframes)

    ply_path = os.path.join(recon_dir, "sparse", "points.ply")
    points_xyz = np.zeros((0, 3))
    points_rgb = np.zeros((0, 3), dtype=np.uint8)
    if os.path.exists(ply_path):
        try:
            import trimesh
            cloud = trimesh.load(ply_path)
            points_xyz = np.array(cloud.vertices)
            points_rgb = np.array(cloud.colors[:, :3]) if cloud.colors is not None else np.zeros((len(points_xyz), 3), dtype=np.uint8)
        except Exception:
            pass

    cam_positions_smooth = _smooth_trajectory(cam_positions)
    total_dist = _compute_distance(cam_positions_smooth)

    print(f"\n3D Reconstruction Summary (FastVGGT):")
    print(f"  Camera poses: {len(image_data)}")
    print(f"  Point cloud: {len(points_xyz)} points")
    print(f"  Depth maps: {len(depth_map_cache)}")
    print(f"  Worker distance: {total_dist:.1f} (relative units)")

    return {
        "intrinsics": intrinsics,
        "image_data": image_data,
        "points_xyz": points_xyz,
        "points_rgb": points_rgb,
        "img_to_points3d": {},
        "depth_map_cache": depth_map_cache,
        "cam_positions": cam_positions,
        "cam_positions_smooth": cam_positions_smooth,
        "total_distance": total_dist,
        "colmap_dir": recon_dir,
    }


def _smooth_trajectory(cam_positions):
    if len(cam_positions) > 10:
        window = 5
        smoothed = np.copy(cam_positions)
        for ax in range(3):
            kernel = np.ones(window) / window
            smoothed[:, ax] = np.convolve(cam_positions[:, ax], kernel, mode="same")
        return smoothed
    return cam_positions


def _compute_distance(cam_positions_smooth):
    if len(cam_positions_smooth) > 1:
        return float(np.sum(np.linalg.norm(
            np.diff(cam_positions_smooth, axis=0), axis=1
        )))
    return 0.0

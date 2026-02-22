"""
Run FastVGGT inference: outputs COLMAP reconstruction + per-frame depth maps.
Usage: python scripts/run_fastvggt.py --scene_dir output/scene --output_dir output/recon
"""

import argparse
import os
import sys
import time
import glob
import numpy as np
import torch
from pathlib import Path

# Add FastVGGT to path
FASTVGGT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "FastVGGT")
sys.path.insert(0, FASTVGGT_DIR)


def load_images(image_dir, max_size=1024):
    """Load images from directory, return tensor + paths."""
    from PIL import Image
    import torchvision.transforms as T

    paths = sorted(glob.glob(os.path.join(image_dir, "*.jpg")))
    if not paths:
        paths = sorted(glob.glob(os.path.join(image_dir, "*.png")))
    print(f"Found {len(paths)} images in {image_dir}")

    images = []
    for p in paths:
        img = Image.open(p).convert("RGB")
        images.append(np.array(img))

    images_np = np.stack(images)  # (N, H, W, 3)
    N, H, W, C = images_np.shape

    # Resize to nearest multiple of 14 (DINOv2 patch size requirement)
    patch_size = 14
    H_new = (H // patch_size) * patch_size
    W_new = (W // patch_size) * patch_size
    if H_new != H or W_new != W:
        print(f"Resizing frames: {W}x{H} -> {W_new}x{H_new} (patch size {patch_size})")
        import cv2
        resized = []
        for img in images_np:
            resized.append(cv2.resize(img, (W_new, H_new), interpolation=cv2.INTER_LINEAR))
        images_np = np.stack(resized)

    # Normalize to [0, 1]
    images_tensor = torch.from_numpy(images_np).float() / 255.0
    images_tensor = images_tensor.permute(0, 3, 1, 2)  # (N, 3, H, W)

    return images_tensor, paths, images_np


def run_inference(model, images_tensor, device="cuda"):
    """Run FastVGGT inference, return predictions dict."""
    # FastVGGT expects (1, N, 3, H, W) batch
    images_batch = images_tensor.unsqueeze(0).to(device).to(torch.bfloat16)

    print(f"Running FastVGGT inference on {images_tensor.shape[0]} frames...")
    t0 = time.time()

    with torch.no_grad():
        predictions = model(images_batch)

    elapsed = time.time() - t0
    print(f"Inference complete in {elapsed:.1f}s")

    return predictions


def save_depth_maps(predictions, image_paths, output_dir, conf_thresh=3.0):
    """Extract and save per-frame depth maps as .npy files."""
    depth_dir = os.path.join(output_dir, "estimated_depths")
    os.makedirs(depth_dir, exist_ok=True)

    depth_tensor = predictions["depth"]  # (1, N, H, W)
    depth_np = depth_tensor[0].detach().float().cpu().numpy()  # (N, H, W)

    # Confidence filtering
    if "depth_conf" in predictions:
        conf = predictions["depth_conf"][0].detach().float().cpu().numpy()
        mask = conf < conf_thresh
        depth_np_filtered = depth_np.copy()
        depth_np_filtered[mask] = np.nan
    else:
        depth_np_filtered = depth_np

    for i, img_path in enumerate(image_paths):
        stem = Path(img_path).stem
        out_path = os.path.join(depth_dir, f"{stem}_depth.npy")
        np.save(out_path, depth_np_filtered[i])

    print(f"Saved {len(image_paths)} depth maps to {depth_dir}")
    return depth_np_filtered


def save_colmap(predictions, image_paths, images_np, output_dir, max_points=100000):
    """Export COLMAP reconstruction from FastVGGT predictions."""
    import pycolmap

    sparse_dir = Path(output_dir) / "sparse" / "0"
    sparse_dir.mkdir(parents=True, exist_ok=True)

    # Extract poses and intrinsics
    extrinsics = predictions["extrinsic"][0].detach().float().cpu().numpy()  # (N, 4, 4)
    intrinsics = predictions["intrinsic"][0].detach().float().cpu().numpy()  # (N, 3, 3)
    depth = predictions["depth"][0].detach().float().cpu().numpy()  # (N, H, W)

    N, H_d, W_d = depth.shape
    H_img, W_img = images_np.shape[1], images_np.shape[2]

    # Build COLMAP reconstruction
    reconstruction = pycolmap.Reconstruction()

    # Add camera (shared)
    K = intrinsics[0]
    # Scale intrinsics from depth resolution to image resolution
    sx = W_img / W_d
    sy = H_img / H_d
    fx = float(K[0, 0] * sx)
    fy = float(K[1, 1] * sy)
    cx = float(K[0, 2] * sx)
    cy = float(K[1, 2] * sy)

    cam = pycolmap.Camera(
        model="PINHOLE",
        width=W_img,
        height=H_img,
        params=[fx, fy, cx, cy],
        camera_id=1,
    )
    reconstruction.add_camera(cam)

    # Add images with poses
    for i, img_path in enumerate(image_paths):
        T = extrinsics[i]  # 4x4 world-to-camera
        R = T[:3, :3]
        t = T[:3, 3]

        img = pycolmap.Image(
            image_id=i + 1,
            camera_id=1,
            name=Path(img_path).name,
        )
        # Set pose: cam_from_world
        img.cam_from_world = pycolmap.Rigid3d(
            pycolmap.Rotation3d(R), t
        )
        reconstruction.add_image(img)

    # Unproject depth to 3D points
    print("Unprojecting depth to 3D points...")
    all_points = []
    all_colors = []

    for i in range(N):
        dep = depth[i]
        valid = np.isfinite(dep) & (dep > 0)

        # Subsample to avoid too many points per frame
        ys, xs = np.where(valid)
        if len(ys) == 0:
            continue

        max_per_frame = max_points // N
        if len(ys) > max_per_frame:
            idx = np.random.choice(len(ys), max_per_frame, replace=False)
            ys, xs = ys[idx], xs[idx]

        depths_valid = dep[ys, xs]

        # Scale pixel coords to image resolution for unprojection
        xs_img = xs * sx
        ys_img = ys * sy

        # Unproject: pixel (x, y, depth) -> camera coords
        X_cam = (xs_img - cx) * depths_valid / fx
        Y_cam = (ys_img - cy) * depths_valid / fy
        Z_cam = depths_valid

        pts_cam = np.stack([X_cam, Y_cam, Z_cam], axis=1)  # (M, 3)

        # Camera to world
        T = extrinsics[i]
        R = T[:3, :3]
        t = T[:3, 3]
        pts_world = (R.T @ (pts_cam.T - t[:, None])).T  # (M, 3)

        # Get colors from image
        ys_img_i = np.clip((ys * sy).astype(int), 0, H_img - 1)
        xs_img_i = np.clip((xs * sx).astype(int), 0, W_img - 1)
        colors = images_np[i, ys_img_i, xs_img_i]  # (M, 3) uint8

        all_points.append(pts_world)
        all_colors.append(colors)

    if all_points:
        all_points = np.concatenate(all_points)
        all_colors = np.concatenate(all_colors)

        # Cap total points
        if len(all_points) > max_points:
            idx = np.random.choice(len(all_points), max_points, replace=False)
            all_points = all_points[idx]
            all_colors = all_colors[idx]

        # Add 3D points to reconstruction
        for j in range(len(all_points)):
            pt = pycolmap.Point3D(
                xyz=all_points[j],
                color=all_colors[j],
            )
            reconstruction.add_point3D(pt)

        print(f"Added {len(all_points)} 3D points")

    # Save
    reconstruction.write(str(sparse_dir))
    print(f"COLMAP reconstruction saved to {sparse_dir}")

    # Also save PLY
    try:
        import trimesh
        cloud = trimesh.PointCloud(vertices=all_points, colors=all_colors)
        ply_path = Path(output_dir) / "sparse" / "points.ply"
        cloud.export(str(ply_path))
        print(f"Point cloud saved to {ply_path}")
    except ImportError:
        pass

    return str(sparse_dir)


def main():
    parser = argparse.ArgumentParser(description="FastVGGT: COLMAP + Depth Maps")
    parser.add_argument("--scene_dir", required=True, help="Directory with images/ subfolder")
    parser.add_argument("--output_dir", required=True, help="Output directory")
    parser.add_argument("--ckpt_path", default=None, help="Model checkpoint path")
    parser.add_argument("--merging", type=int, default=6, help="Token merging block (0=off, 6=recommended)")
    parser.add_argument("--merge_ratio", type=float, default=0.9, help="Token merge ratio")
    parser.add_argument("--depth_conf_thresh", type=float, default=3.0)
    parser.add_argument("--max_points", type=int, default=100000)
    args = parser.parse_args()

    image_dir = os.path.join(args.scene_dir, "images")
    if not os.path.exists(image_dir):
        print(f"Error: {image_dir} not found")
        sys.exit(1)

    os.makedirs(args.output_dir, exist_ok=True)

    # Find checkpoint
    ckpt_path = args.ckpt_path
    if ckpt_path is None:
        candidates = [
            "FastVGGT/model_tracker_fixed_e20.pt",
            "model_tracker_fixed_e20.pt",
            os.path.expanduser("~/.cache/vggt/model_tracker_fixed_e20.pt"),
        ]
        for c in candidates:
            if os.path.exists(c):
                ckpt_path = c
                break
    if ckpt_path is None:
        print("Downloading VGGT checkpoint...")
        from huggingface_hub import hf_hub_download
        ckpt_path = hf_hub_download(
            repo_id="facebook/VGGT_tracker_fixed",
            filename="model_tracker_fixed_e20.pt",
            local_dir="FastVGGT",
        )

    print(f"Checkpoint: {ckpt_path}")

    # Load model
    from vggt.models.vggt import VGGT

    model = VGGT(merging=args.merging, merge_ratio=args.merge_ratio)
    ckpt = torch.load(ckpt_path, map_location="cpu")
    model.load_state_dict(ckpt, strict=False)
    model = model.cuda().eval().to(torch.bfloat16)
    print("FastVGGT model loaded")

    # Load images
    images_tensor, image_paths, images_np = load_images(image_dir)

    # Run inference
    predictions = run_inference(model, images_tensor)

    # Save depth maps
    save_depth_maps(predictions, image_paths, args.output_dir, args.depth_conf_thresh)

    # Save COLMAP reconstruction
    save_colmap(predictions, image_paths, images_np, args.output_dir, args.max_points)

    # Free GPU
    del model, predictions
    torch.cuda.empty_cache()

    print(f"\nDone! Output in {args.output_dir}")
    print(f"  sparse/0/     — COLMAP reconstruction")
    print(f"  estimated_depths/ — per-frame depth maps (.npy)")


if __name__ == "__main__":
    main()

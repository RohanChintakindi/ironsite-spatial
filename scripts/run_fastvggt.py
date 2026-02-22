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


def load_images(image_dir):
    """Load images and preprocess using FastVGGT's own function.

    Returns:
        vgg_input: tensor (N, 3, H, W) preprocessed for the model
        paths: list of image file paths
        images_np: original images as numpy (N, H, W, 3) for COLMAP colors
        patch_width: patch grid width for token merging
        patch_height: patch grid height for token merging
    """
    from PIL import Image
    from vggt.utils.eval_utils import get_vgg_input_imgs

    paths = sorted(glob.glob(os.path.join(image_dir, "*.jpg")))
    if not paths:
        paths = sorted(glob.glob(os.path.join(image_dir, "*.png")))
    print(f"Found {len(paths)} images in {image_dir}")

    # Load original images as RGB numpy arrays
    images = []
    for p in paths:
        img = Image.open(p).convert("RGB")
        images.append(np.array(img))

    images_np = np.stack(images)  # (N, H, W, 3)
    N, H, W, C = images_np.shape
    print(f"Original frame size: {W}x{H}")

    # Use FastVGGT's own preprocessing (correct resizing + patch dims)
    vgg_input, patch_width, patch_height = get_vgg_input_imgs(images_np)
    print(f"Model input: {vgg_input.shape[3]}x{vgg_input.shape[2]} | "
          f"patch grid: {patch_width}x{patch_height}")

    return vgg_input, paths, images_np, patch_width, patch_height


def run_inference(model, vgg_input, device="cuda"):
    """Run FastVGGT inference, return predictions dict."""
    import threading

    # FastVGGT expects (1, N, 3, H, W) batch
    images_batch = vgg_input.unsqueeze(0).to(device).to(torch.bfloat16)
    n_frames = vgg_input.shape[0]
    vram_gb = torch.cuda.get_device_properties(0).total_memory / 1e9

    print(f"Running FastVGGT inference on {n_frames} frames...")
    print(f"  This is one big GPU operation — no per-frame progress.")
    print(f"  Estimated ~{n_frames // 5}s on {vram_gb:.0f}GB GPU. Printing heartbeat every 30s...")
    t0 = time.time()

    # Heartbeat thread so you know it's not frozen
    done = threading.Event()
    def heartbeat():
        while not done.wait(30):
            elapsed = time.time() - t0
            mem = torch.cuda.memory_allocated() / 1e9
            print(f"  ... still running ({elapsed:.0f}s elapsed, {mem:.1f}GB VRAM used)")
    hb = threading.Thread(target=heartbeat, daemon=True)
    hb.start()

    with torch.no_grad(), torch.amp.autocast("cuda", dtype=torch.bfloat16):
        predictions = model(images_batch)

    done.set()

    elapsed = time.time() - t0
    print(f"Inference complete in {elapsed:.1f}s")

    return predictions


def save_depth_maps(depth_np, depth_conf, image_paths, output_dir, conf_thresh=3.0):
    """Save per-frame depth maps as .npy files."""
    depth_dir = os.path.join(output_dir, "estimated_depths")
    os.makedirs(depth_dir, exist_ok=True)

    # Confidence filtering
    if depth_conf is not None:
        mask = depth_conf < conf_thresh
        depth_filtered = depth_np.copy()
        depth_filtered[mask] = np.nan
    else:
        depth_filtered = depth_np

    for i, img_path in enumerate(image_paths):
        stem = Path(img_path).stem
        out_path = os.path.join(depth_dir, f"{stem}_depth.npy")
        np.save(out_path, depth_filtered[i])

    print(f"Saved {len(image_paths)} depth maps to {depth_dir}")
    return depth_filtered


def save_colmap(extrinsics, intrinsics, depth, image_paths, images_np, output_dir, max_points=100000):
    """Export COLMAP reconstruction from decoded FastVGGT predictions."""
    import pycolmap

    sparse_dir = Path(output_dir) / "sparse" / "0"
    sparse_dir.mkdir(parents=True, exist_ok=True)

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
            reconstruction.add_point3D(
                all_points[j].astype(np.float64),
                pycolmap.Track(),
                all_colors[j].astype(np.uint8),
            )

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

    # Load images (uses FastVGGT's own preprocessing for correct patch dims)
    vgg_input, image_paths, images_np, patch_width, patch_height = load_images(image_dir)

    # Update model's patch dimensions for token merging
    if args.merging > 0:
        model.update_patch_dimensions(patch_width, patch_height)
        print(f"Token merging enabled at block {args.merging} "
              f"(ratio={args.merge_ratio}, patches={patch_width}x{patch_height})")

    # Run inference
    predictions = run_inference(model, vgg_input)

    # Decode pose encoding into extrinsic/intrinsic matrices
    from vggt.utils.pose_enc import pose_encoding_to_extri_intri
    img_h, img_w = vgg_input.shape[2], vgg_input.shape[3]
    extrinsics, intrinsics = pose_encoding_to_extri_intri(
        predictions["pose_enc"], (img_h, img_w)
    )
    # (1, N, 4, 4) and (1, N, 3, 3)
    extrinsics_np = extrinsics[0].detach().float().cpu().numpy()
    intrinsics_np = intrinsics[0].detach().float().cpu().numpy()
    depth_np = np.squeeze(predictions["depth"][0].detach().float().cpu().numpy())  # -> (N,H,W)
    depth_conf = predictions.get("depth_conf")
    if depth_conf is not None:
        depth_conf = np.squeeze(depth_conf[0].detach().float().cpu().numpy())
    print(f"  Depth: {depth_np.shape}, Conf: {depth_conf.shape if depth_conf is not None else 'None'}")

    # Save depth maps
    save_depth_maps(depth_np, depth_conf, image_paths, args.output_dir, args.depth_conf_thresh)

    # Save COLMAP reconstruction
    save_colmap(extrinsics_np, intrinsics_np, depth_np, image_paths, images_np,
                args.output_dir, args.max_points)

    # Free GPU
    del model, predictions
    torch.cuda.empty_cache()

    print(f"\nDone! Output in {args.output_dir}")
    print(f"  sparse/0/     — COLMAP reconstruction")
    print(f"  estimated_depths/ — per-frame depth maps (.npy)")


if __name__ == "__main__":
    main()

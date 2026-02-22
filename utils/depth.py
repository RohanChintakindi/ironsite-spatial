"""
VGGT: Multi-view depth estimation + 3D reconstruction + camera trajectory.
"""

import torch
import numpy as np
from scipy.spatial.transform import Rotation


def load_vggt(model_name, device):
    from vggt.models.vggt import VGGT

    model = VGGT.from_pretrained(model_name)

    # Use float16 on GPUs without BFloat16 (T4), bfloat16 on Ampere+
    if torch.cuda.is_bf16_supported():
        model = model.to(device=device, dtype=torch.bfloat16)
        print(f"VGGT loaded in bfloat16 on {device}")
    else:
        model = model.to(device=device, dtype=torch.float16)
        print(f"VGGT loaded in float16 on {device}")

    model.eval()
    return model


def process_chunk(model, frames_tensor, device):
    """Process a chunk of frames through VGGT."""
    with torch.no_grad():
        # VGGT expects (1, N, 3, H, W) in the model's dtype
        dtype = next(model.parameters()).dtype
        batch = frames_tensor.unsqueeze(0).to(device=device, dtype=dtype)
        predictions = model(batch)

    # Extract outputs
    depth = predictions.get("depth")
    poses = predictions.get("extrinsic")
    points = predictions.get("world_points")

    # Convert to numpy
    if depth is not None:
        depth = depth.squeeze(0).cpu().float().numpy()
    if poses is not None:
        poses = poses.squeeze(0).cpu().float().numpy()
    if points is not None:
        points = points.squeeze(0).cpu().float().numpy()

    return depth, poses, points


def run_vggt(keyframes, device, model_name="facebook/VGGT-1B", chunk_size=20):
    from torchvision import transforms

    model = load_vggt(model_name, device)

    # Prepare frames as tensors (resize to VGGT input size)
    transform = transforms.Compose([
        transforms.ToPILImage(),
        transforms.Resize((518, 518)),
        transforms.ToTensor(),
    ])

    frame_tensors = torch.stack([transform(kf) for kf in keyframes])
    print(f"Processing {len(keyframes)} keyframes in chunks of {chunk_size}...")

    all_depths = []
    all_poses = []
    all_points = []

    num_chunks = (len(keyframes) + chunk_size - 1) // chunk_size

    for chunk_idx in range(num_chunks):
        start = chunk_idx * chunk_size
        end = min(start + chunk_size, len(keyframes))
        chunk = frame_tensors[start:end]

        print(f"  Chunk {chunk_idx + 1}/{num_chunks}: frames {start}-{end - 1}")

        depth, poses, points = process_chunk(model, chunk, device)

        if depth is not None:
            for d in depth:
                all_depths.append(d)
        if poses is not None:
            for p in poses:
                all_poses.append(p)
        if points is not None:
            all_points.append(points)

        torch.cuda.empty_cache()

    # Build camera trajectory from poses
    cam_positions = []
    for pose in all_poses:
        if pose.shape == (3, 4):
            R = pose[:3, :3]
            t = pose[:3, 3]
            cam_pos = -R.T @ t
        elif pose.shape == (4, 4):
            R = pose[:3, :3]
            t = pose[:3, 3]
            cam_pos = -R.T @ t
        else:
            cam_pos = pose[:3] if len(pose) >= 3 else np.zeros(3)
        cam_positions.append(cam_pos)

    cam_positions = np.array(cam_positions) if cam_positions else np.zeros((0, 3))

    # Smooth trajectory (moving average to filter camera shake)
    if len(cam_positions) > 10:
        window = 5
        smoothed = np.copy(cam_positions)
        for ax in range(3):
            kernel = np.ones(window) / window
            smoothed[:, ax] = np.convolve(cam_positions[:, ax], kernel, mode='same')
        cam_positions_smooth = smoothed
    else:
        cam_positions_smooth = cam_positions

    # Combine point clouds from all chunks
    if all_points:
        # Reshape: each chunk gives (N, H, W, 3)
        combined_points = []
        combined_colors = []
        for pts in all_points:
            # Flatten spatial dims
            flat = pts.reshape(-1, 3) if pts.ndim > 2 else pts
            # Remove outliers (95th percentile)
            dists = np.linalg.norm(flat - np.median(flat, axis=0), axis=1)
            mask = dists < np.percentile(dists, 95)
            combined_points.append(flat[mask])
        point_cloud = np.concatenate(combined_points, axis=0) if combined_points else np.zeros((0, 3))
    else:
        point_cloud = np.zeros((0, 3))

    # Resize depth maps back to original frame size
    original_h, original_w = keyframes[0].shape[:2]
    import cv2
    resized_depths = []
    for d in all_depths:
        if d is not None and d.size > 0:
            resized = cv2.resize(d, (original_w, original_h), interpolation=cv2.INTER_LINEAR)
            resized_depths.append(resized)
        else:
            resized_depths.append(None)

    # Free model
    del model
    torch.cuda.empty_cache()
    print(f"VGGT complete: {len(resized_depths)} depth maps, {len(cam_positions)} poses, {len(point_cloud)} 3D points")

    return resized_depths, cam_positions_smooth, cam_positions, point_cloud

"""
Video preprocessing: fisheye undistortion + keyframe extraction.
"""

import cv2
import numpy as np
from PIL import Image
import os


def get_undistortion_maps(w, h, k_scale=0.8, D=(-0.3, 0.1, 0.0, 0.0), balance=0.5):
    K = np.array([
        [w * k_scale, 0, w / 2],
        [0, h * k_scale, h / 2],
        [0, 0, 1]
    ], dtype=np.float64)
    D = np.array(D, dtype=np.float64)
    new_K = cv2.fisheye.estimateNewCameraMatrixForUndistortRectify(
        K, D, (w, h), np.eye(3), balance=balance
    )
    map1, map2 = cv2.fisheye.initUndistortRectifyMap(
        K, D, np.eye(3), new_K, (w, h), cv2.CV_16SC2
    )
    return map1, map2


def extract_keyframes(video_path, output_dir, interval=10, k_scale=0.8,
                      D=(-0.3, 0.1, 0.0, 0.0), balance=0.5, max_frames=0):
    os.makedirs(output_dir, exist_ok=True)

    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    print(f"Video: {w}x{h} @ {fps:.1f}fps | {total_frames} frames | {total_frames/fps:.1f}s")

    map1, map2 = get_undistortion_maps(w, h, k_scale, D, balance)

    keyframes = []
    timestamps = []
    frame_indices = []

    frame_idx = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        if max_frames > 0 and len(keyframes) >= max_frames:
            break
        if frame_idx % interval == 0:
            undistorted = cv2.remap(frame, map1, map2, cv2.INTER_LINEAR)
            rgb = cv2.cvtColor(undistorted, cv2.COLOR_BGR2RGB)
            keyframes.append(rgb)
            timestamps.append(frame_idx / fps)
            frame_indices.append(frame_idx)
            # Save to disk for SAM2 + VGGT
            kf_idx = len(keyframes) - 1
            Image.fromarray(rgb).save(os.path.join(output_dir, f"{kf_idx:06d}.jpg"))
        frame_idx += 1
    cap.release()

    print(f"Extracted {len(keyframes)} keyframes (every {interval} frames)")
    return keyframes, timestamps, frame_indices, fps, w, h

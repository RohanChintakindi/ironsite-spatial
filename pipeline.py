"""
Ironsite Spatial Awareness Pipeline
====================================
Processes body cam video from construction workers and produces
structured spatial data for LLM-based activity analysis.

Usage:
    python pipeline.py --video path/to/video.mp4 [--grok-key YOUR_KEY]

Pipeline:
    Video → Undistort → Keyframes → Grounded SAM 2 → VGGT → Scene Graphs → VLM Reasoning
"""

import argparse
import os
import sys
import time
import json
import torch
import numpy as np

from config import *
from utils.preprocess import extract_keyframes
from utils.detection import run_grounded_sam2
from utils.depth import run_vggt
from utils.scene_graph import build_scene_graphs
from utils.vlm import run_vlm_analysis
from utils.visualize import (
    plot_annotated_frames, plot_3d_scene, plot_trajectory_topdown,
    plot_activity_timeline, plot_object_frequency, export_results
)


def main():
    parser = argparse.ArgumentParser(description="Ironsite Spatial Awareness Pipeline")
    parser.add_argument("--video", required=True, help="Path to input .mp4 video")
    parser.add_argument("--grok-key", default=None, help="xAI/Grok API key for VLM reasoning")
    parser.add_argument("--output", default="output", help="Output directory")
    parser.add_argument("--skip-vlm", action="store_true", help="Skip VLM reasoning step")
    parser.add_argument("--keyframe-interval", type=int, default=None,
                        help=f"Override keyframe interval (default: {KEYFRAME_INTERVAL})")
    parser.add_argument("--chunk-size", type=int, default=None,
                        help=f"Override VGGT chunk size (default: {VGGT_CHUNK_SIZE})")
    args = parser.parse_args()

    if not os.path.exists(args.video):
        print(f"Error: Video not found: {args.video}")
        sys.exit(1)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    if device == "cuda":
        gpu_name = torch.cuda.get_device_name(0)
        vram = torch.cuda.get_device_properties(0).total_mem / 1e9
        print(f"GPU: {gpu_name} | VRAM: {vram:.1f} GB")
    else:
        print("WARNING: No GPU — this will be very slow!")

    os.makedirs(args.output, exist_ok=True)
    kf_interval = args.keyframe_interval or KEYFRAME_INTERVAL
    chunk_size = args.chunk_size or VGGT_CHUNK_SIZE
    frames_dir = os.path.join(args.output, "frames")

    # ==========================================
    # Step 1: Video Preprocessing
    # ==========================================
    print("\n" + "=" * 60)
    print("STEP 1: Video Preprocessing")
    print("=" * 60)
    t0 = time.time()

    keyframes, timestamps, frame_indices, fps, w, h = extract_keyframes(
        args.video, frames_dir, interval=kf_interval,
        k_scale=FISHEYE_K_SCALE, D=FISHEYE_D, balance=FISHEYE_BALANCE
    )
    print(f"  Completed in {time.time() - t0:.1f}s")

    # ==========================================
    # Step 2: Grounded SAM 2 (Detect + Segment + Track)
    # ==========================================
    print("\n" + "=" * 60)
    print("STEP 2: Grounded SAM 2 — Detection + Segmentation + Tracking")
    print("=" * 60)
    t0 = time.time()

    all_detections, object_labels = run_grounded_sam2(
        keyframes, frames_dir, device,
        text_prompt=TEXT_PROMPT,
        threshold=DETECTION_THRESHOLD,
        redetect_every=REDETECT_EVERY,
        sam2_checkpoint=SAM2_CHECKPOINT,
        sam2_config=SAM2_CONFIG,
    )
    print(f"  Completed in {time.time() - t0:.1f}s")

    # ==========================================
    # Step 3: VGGT (Depth + 3D + Trajectory)
    # ==========================================
    print("\n" + "=" * 60)
    print("STEP 3: VGGT — Depth + 3D Reconstruction + Trajectory")
    print("=" * 60)
    t0 = time.time()

    depth_maps, cam_positions_smooth, cam_positions_raw, point_cloud = run_vggt(
        keyframes, device,
        model_name=VGGT_MODEL,
        chunk_size=chunk_size,
    )

    total_dist = 0.0
    if len(cam_positions_smooth) > 1:
        total_dist = float(np.sum(np.linalg.norm(np.diff(cam_positions_smooth, axis=0), axis=1)))
    print(f"  Worker distance traveled: {total_dist:.1f}m")
    print(f"  Completed in {time.time() - t0:.1f}s")

    # ==========================================
    # Step 4: Scene Graph Builder
    # ==========================================
    print("\n" + "=" * 60)
    print("STEP 4: Building Scene Graphs")
    print("=" * 60)
    t0 = time.time()

    # Estimate camera intrinsics from frame dimensions
    fx = fy = w * FISHEYE_K_SCALE
    cx, cy = w / 2, h / 2

    scene_graphs = build_scene_graphs(
        keyframes, all_detections, depth_maps, cam_positions_smooth,
        timestamps, frame_indices, fx, fy, cx, cy
    )
    print(f"  Completed in {time.time() - t0:.1f}s")

    # ==========================================
    # Step 5: VLM Reasoning
    # ==========================================
    analysis_json = {}
    if not args.skip_vlm:
        if args.grok_key:
            print("\n" + "=" * 60)
            print("STEP 5: VLM Reasoning via Grok")
            print("=" * 60)
            t0 = time.time()

            analysis_json = run_vlm_analysis(
                scene_graphs, args.video, args.grok_key,
                model=GROK_MODEL, base_url=GROK_BASE_URL,
                num_samples=VLM_NUM_SAMPLES, temperature=VLM_TEMPERATURE,
                max_tokens=VLM_MAX_TOKENS,
            )
            print(f"  Completed in {time.time() - t0:.1f}s")
        else:
            print("\nSkipping VLM reasoning (no --grok-key provided)")
    else:
        print("\nSkipping VLM reasoning (--skip-vlm)")

    # ==========================================
    # Step 6: Visualization & Export
    # ==========================================
    print("\n" + "=" * 60)
    print("STEP 6: Visualization & Export")
    print("=" * 60)

    plot_annotated_frames(keyframes, scene_graphs, depth_maps, timestamps, args.output)
    plot_3d_scene(point_cloud, cam_positions_smooth, args.output)
    plot_trajectory_topdown(cam_positions_smooth, args.output)
    plot_object_frequency(scene_graphs, args.output)

    if analysis_json:
        plot_activity_timeline(analysis_json, args.output)

    summary = export_results(
        scene_graphs, analysis_json, cam_positions_smooth, object_labels,
        timestamps, args.video, args.output
    )

    print("\n" + "=" * 60)
    print("PIPELINE COMPLETE")
    print("=" * 60)
    print(f"Results in: {os.path.abspath(args.output)}/")


if __name__ == "__main__":
    main()

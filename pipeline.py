"""
Ironsite Spatial Awareness Pipeline
====================================
Processes body cam video from construction workers and produces
structured spatial data for LLM-based activity analysis.

Pipeline:
    Video → Undistort → Keyframes → Grounded SAM 2 → VGGT-X → Scene Graphs → FAISS Memory → VLM

Usage:
    python pipeline.py --video path/to/video.mp4 [--grok-key YOUR_KEY] [--skip-vlm]
"""

import argparse
import os
import sys
import time
import json
import glob
import pickle
import torch
import numpy as np

from config import *
from utils.preprocess import extract_keyframes
from utils.detection import run_dino_detections, run_sam2_tracking
from utils.depth import run_full_3d_pipeline
from utils.scene_graph import build_scene_graphs
from utils.graph import SpatialGraph
from utils.events import extract_events, events_to_vlm_context
from utils.memory import SpatialMemory
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
    parser.add_argument("--keyframe-interval", type=int, default=None)
    parser.add_argument("--merging", type=int, default=None,
                        help="FastVGGT token merging block (0=off, 6=fast)")
    parser.add_argument("--max-frames", type=int, default=None,
                        help="Max keyframes to extract (0=unlimited)")
    parser.add_argument("--backend", default="vggtx", choices=["vggtx", "fastvggt"],
                        help="3D backend: vggtx (metric depth, slower) or fastvggt (relative, faster)")
    parser.add_argument("--force", action="store_true",
                        help="Force re-run all steps (ignore cached results)")
    args = parser.parse_args()

    if not os.path.exists(args.video):
        print(f"Error: Video not found: {args.video}")
        sys.exit(1)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    if device == "cuda":
        gpu_name = torch.cuda.get_device_name(0)
        vram = torch.cuda.get_device_properties(0).total_memory / 1e9
        print(f"GPU: {gpu_name} | VRAM: {vram:.1f} GB")
    else:
        print("WARNING: No GPU!")

    os.makedirs(args.output, exist_ok=True)
    kf_interval = args.keyframe_interval or KEYFRAME_INTERVAL
    merging = args.merging if args.merging is not None else FASTVGGT_MERGING
    max_frames = args.max_frames if args.max_frames is not None else MAX_FRAMES

    # Cache directory
    cache_dir = os.path.join(args.output, ".cache")
    os.makedirs(cache_dir, exist_ok=True)

    # Scene directory for VGGT-X (expects images/ subdirectory)
    scene_dir = os.path.join(args.output, "scene")
    frames_dir = os.path.join(scene_dir, "images")

    # ==========================================
    # Step 1: Video Preprocessing
    # ==========================================
    print("\n" + "=" * 60)
    print("STEP 1: Video Preprocessing")
    print("=" * 60)

    preprocess_cache = os.path.join(cache_dir, "preprocess.pkl")
    existing_frames = glob.glob(os.path.join(frames_dir, "*.jpg"))

    if not args.force and existing_frames and os.path.exists(preprocess_cache):
        print("  SKIPPED — keyframes already extracted")
        with open(preprocess_cache, "rb") as f:
            cached = pickle.load(f)
        keyframes = cached["keyframes"]
        timestamps = cached["timestamps"]
        frame_indices = cached["frame_indices"]
        fps = cached["fps"]
        w, h = cached["w"], cached["h"]
        print(f"  Loaded {len(keyframes)} keyframes from cache")
    else:
        t0 = time.time()
        keyframes, timestamps, frame_indices, fps, w, h = extract_keyframes(
            args.video, frames_dir, interval=kf_interval,
            k_scale=FISHEYE_K_SCALE, D=FISHEYE_D, balance=FISHEYE_BALANCE,
            max_frames=max_frames,
        )
        with open(preprocess_cache, "wb") as f:
            pickle.dump({
                "keyframes": keyframes, "timestamps": timestamps,
                "frame_indices": frame_indices, "fps": fps, "w": w, "h": h,
            }, f)
        print(f"  Completed in {time.time() - t0:.1f}s")

    # ==========================================
    # Step 2a: Grounding DINO — Object Detection
    # ==========================================
    print("\n" + "=" * 60)
    print("STEP 2a: Grounding DINO — Object Detection")
    print("=" * 60)

    dino_cache = os.path.join(cache_dir, "dino.pkl")

    if not args.force and os.path.exists(dino_cache):
        print("  SKIPPED — DINO detections already cached")
        with open(dino_cache, "rb") as f:
            dino_results = pickle.load(f)
        print(f"  Loaded DINO results for {len(dino_results)} frames")
    else:
        t0 = time.time()
        dino_results = run_dino_detections(
            keyframes, device,
            text_prompt=TEXT_PROMPT,
            threshold=DETECTION_THRESHOLD,
            redetect_every=REDETECT_EVERY,
        )
        with open(dino_cache, "wb") as f:
            pickle.dump(dino_results, f)
        print(f"  Completed in {time.time() - t0:.1f}s")

    # ==========================================
    # Step 2b: SAM2 — Segmentation + Tracking
    # ==========================================
    print("\n" + "=" * 60)
    print("STEP 2b: SAM2 VideoPredictor — Segmentation + Tracking")
    print("=" * 60)

    tracking_cache = os.path.join(cache_dir, "tracking.pkl")

    if not args.force and os.path.exists(tracking_cache):
        print("  SKIPPED — SAM2 tracking already cached")
        with open(tracking_cache, "rb") as f:
            cached = pickle.load(f)
        all_detections = cached["all_detections"]
        object_labels = cached["object_labels"]
        print(f"  Loaded tracking for {len(all_detections)} frames")
    else:
        t0 = time.time()
        all_detections, object_labels = run_sam2_tracking(
            keyframes, frames_dir, device, dino_results,
            redetect_every=REDETECT_EVERY,
            sam2_checkpoint=SAM2_CHECKPOINT,
            sam2_config=SAM2_CONFIG,
        )
        with open(tracking_cache, "wb") as f:
            pickle.dump({
                "all_detections": all_detections,
                "object_labels": object_labels,
            }, f)
        print(f"  Completed in {time.time() - t0:.1f}s")

    # ==========================================
    # Step 3: 3D Reconstruction
    # ==========================================
    print("\n" + "=" * 60)
    backend_name = "VGGT-X (Global Alignment)" if args.backend == "vggtx" else "FastVGGT"
    print(f"STEP 3: {backend_name} — 3D Reconstruction + Depth + Trajectory")
    print("=" * 60)

    recon_cache = os.path.join(cache_dir, f"recon_{args.backend}.pkl")

    if not args.force and os.path.exists(recon_cache):
        print("  SKIPPED — 3D reconstruction already cached")
        with open(recon_cache, "rb") as f:
            recon_data = pickle.load(f)
        print(f"  Loaded: {len(recon_data['image_data'])} poses, {len(recon_data['points_xyz'])} points")
    else:
        t0 = time.time()
        recon_data = run_full_3d_pipeline(
            scene_dir=scene_dir,
            output_dir=args.output,
            merging=FASTVGGT_MERGING,
            merge_ratio=FASTVGGT_MERGE_RATIO,
            depth_conf_thresh=FASTVGGT_DEPTH_CONF,
            max_points=FASTVGGT_MAX_POINTS,
            num_keyframes=len(keyframes),
            backend=args.backend,
            chunk_size=VGGTX_CHUNK_SIZE,
            max_query_pts=VGGTX_MAX_QUERY_PTS,
            vggtx_max_points=VGGTX_MAX_POINTS,
        )
        with open(recon_cache, "wb") as f:
            pickle.dump(recon_data, f)
        print(f"  Completed in {time.time() - t0:.1f}s")

    # ==========================================
    # Step 4: Scene Graph Builder
    # ==========================================
    print("\n" + "=" * 60)
    print("STEP 4: Building Scene Graphs (COLMAP world coordinates)")
    print("=" * 60)
    t0 = time.time()

    scene_graphs = build_scene_graphs(
        keyframes, all_detections, recon_data, timestamps, frame_indices
    )
    print(f"  Completed in {time.time() - t0:.1f}s")

    # ==========================================
    # Step 4.5: Build Spatial Graph (NetworkX)
    # ==========================================
    print("\n" + "=" * 60)
    print("STEP 4.5: Building Spatial Graph (NetworkX)")
    print("=" * 60)
    t0 = time.time()

    spatial_graph = SpatialGraph()
    spatial_graph.build(scene_graphs)
    spatial_graph.export_html(os.path.join(args.output, "spatial_graph.html"))
    spatial_graph.save_json(os.path.join(args.output, "graph_data.json"))
    print(f"  Completed in {time.time() - t0:.1f}s")

    # ==========================================
    # Step 4.75: Event Engine
    # ==========================================
    print("\n" + "=" * 60)
    print("STEP 4.75: Event Engine (pattern extraction)")
    print("=" * 60)
    t0 = time.time()

    event_result = extract_events(scene_graphs, recon_data.get("cam_positions_smooth"))

    # Save events
    import json as _json
    with open(os.path.join(args.output, "events.json"), "w") as f:
        _json.dump(event_result, f, indent=2, default=str)
    print(f"Saved events.json")

    stats = event_result.get("stats", {})
    if stats:
        print(f"\n  Production: {stats.get('production_pct', 0):.0f}%  |  "
              f"Prep: {stats.get('prep_pct', 0):.0f}%  |  "
              f"Downtime: {stats.get('downtime_pct', 0):.0f}%  |  "
              f"Standby: {stats.get('standby_pct', 0):.0f}%")
        print(f"  Distance: {stats.get('distance_traveled_m', 0):.1f}m  |  "
              f"Block interactions: {stats.get('block_interactions', 0)}  |  "
              f"Tool pickups: {stats.get('tool_pickups', 0)}")

    ppe = event_result.get("ppe_report", {})
    if ppe:
        print(f"  PPE — Vest: {ppe.get('vest_visible_pct', 0):.0f}%  |  "
              f"Helmet: {ppe.get('helmet_visible_pct', 0):.0f}%  |  "
              f"Gloves: {ppe.get('gloves_visible_pct', 0):.0f}%")
        for concern in ppe.get("concerns", []):
            print(f"    ! {concern}")

    perf = event_result.get("performance", {})
    if perf:
        eff = perf.get("efficiency", {})
        qty = perf.get("quantity", {})
        spatial = perf.get("spatial", {})
        print(f"\n  --- Performance ---")
        print(f"  Efficiency: {eff.get('overall_score', 0):.0f}/100  "
              f"(production={eff.get('production_score', 0):.0f}  "
              f"movement={eff.get('movement_score', 0):.0f}  "
              f"continuity={eff.get('continuity_score', 0):.0f})")
        print(f"  Blocks: {qty.get('block_interactions', 0)} interactions  "
              f"({qty.get('blocks_per_min_production', 0):.1f}/min production)")
        print(f"  Tools: {qty.get('tool_pickups', 0)} pickups  "
              f"({qty.get('tool_changes_per_min', 0):.1f}/min)")
        print(f"  Work area: {spatial.get('work_area_m2', 0):.1f}m²  |  "
              f"Blocks/meter: {spatial.get('blocks_per_meter', 0):.2f}")

        suggestions = perf.get("suggestions", [])
        if suggestions:
            print(f"\n  --- Optimization Suggestions ---")
            for s in suggestions:
                sev = s.get("severity", "")
                icon = "!!" if sev == "high" else "!" if sev == "medium" else "-"
                print(f"  {icon} [{s.get('category')}] {s.get('message')}")

    print(f"\n  Completed in {time.time() - t0:.1f}s")

    # ==========================================
    # Step 5: FAISS Spatial Memory
    # ==========================================
    print("\n" + "=" * 60)
    print("STEP 5: Building Spatial Memory (FAISS)")
    print("=" * 60)

    memory_dir = os.path.join(args.output, "memory_store")
    memory = SpatialMemory(memory_dir)
    memory.ingest(scene_graphs, args.video)
    memory.save()

    # Demo queries
    print("\nSample queries:")
    blocks = memory.query_label("block")
    print(f"  Frames with blocks: {len(blocks)}")
    close = memory.query_depth_range(0.5, 3.0)
    print(f"  Objects in work range (0.5-3m): {len(close)} frames")
    placements = memory.query_proximity("worker", "concrete block", max_m=2.0)
    print(f"  Worker near block (<2m): {len(placements)} frames")

    # ==========================================
    # Step 6: VLM Narrator (optional — summarizes events)
    # ==========================================
    analysis_json = event_result.get("stats", {})
    analysis_json["activity_timeline"] = event_result.get("timeline", [])
    analysis_json["safety"] = event_result.get("ppe_report", {})

    if not args.skip_vlm:
        if args.grok_key:
            print("\n" + "=" * 60)
            print("STEP 6: VLM Narrator (event summary → Grok)")
            print("=" * 60)
            t0 = time.time()

            # Send compact event summary + key frame images to VLM
            event_context = events_to_vlm_context(event_result)
            analysis_json = run_vlm_analysis(
                scene_graphs, args.video, args.grok_key,
                model=GROK_MODEL, base_url=GROK_BASE_URL,
                num_samples=VLM_NUM_SAMPLES, temperature=VLM_TEMPERATURE,
                max_tokens=VLM_MAX_TOKENS,
                spatial_graph=spatial_graph,
                keyframes=keyframes,
                num_images=5,
                event_context=event_context,
            )
            print(f"  Completed in {time.time() - t0:.1f}s")
        else:
            print("\nSkipping VLM narrator (no --grok-key). Event analysis above is complete.")
    else:
        print("\nSkipping VLM narrator (--skip-vlm). Event analysis above is complete.")

    # ==========================================
    # Step 7: Visualization & Export
    # ==========================================
    print("\n" + "=" * 60)
    print("STEP 7: Visualization & Export")
    print("=" * 60)

    depth_maps_list = []
    for i in range(len(keyframes)):
        fname = f"{i:06d}.jpg"
        depth_maps_list.append(recon_data["depth_map_cache"].get(fname))

    plot_annotated_frames(keyframes, scene_graphs, depth_maps_list, timestamps, args.output)
    plot_3d_scene(recon_data["points_xyz"], recon_data["cam_positions_smooth"], args.output)
    plot_trajectory_topdown(recon_data["cam_positions_smooth"], args.output)
    plot_object_frequency(scene_graphs, args.output)

    if analysis_json:
        plot_activity_timeline(analysis_json, args.output)

    summary = export_results(
        scene_graphs, analysis_json, recon_data["cam_positions_smooth"],
        object_labels, timestamps, args.video, args.output
    )

    print("\n" + "=" * 60)
    print("PIPELINE COMPLETE")
    print("=" * 60)
    print(f"Results in: {os.path.abspath(args.output)}/")
    print(f"\nQuery the spatial memory:")
    print(f"  python -c \"from utils.memory import SpatialMemory; m = SpatialMemory('{memory_dir}'); print(m.stats())\"")


if __name__ == "__main__":
    main()

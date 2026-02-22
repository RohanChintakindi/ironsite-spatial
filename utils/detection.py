"""
Grounded SAM 2: Object detection + segmentation + tracking.
Split into two stages so DINO results survive if SAM2 OOMs.
  Stage 1: run_dino_detections() — Grounding DINO on all frames (cacheable)
  Stage 2: run_sam2_tracking()   — SAM2 VideoPredictor chunked tracking
"""

import sys
import os
import shutil
import torch
import numpy as np

_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(_PROJECT_ROOT, "Grounded-SAM-2"))

from config import GDINO_MODEL_ID, LABEL_TO_ANALYTIC, TRACK_CHUNK_SIZE


def normalize_label(label):
    """Map noisy detection labels to clean analytic categories."""
    return LABEL_TO_ANALYTIC.get(label.lower().strip(), label.lower().strip())


def detect_frame(frame, gd_processor, gd_model, text_prompt, threshold, device):
    inputs = gd_processor(images=frame, text=text_prompt, return_tensors="pt").to(device)
    with torch.no_grad():
        outputs = gd_model(**inputs)
    results = gd_processor.post_process_grounded_object_detection(
        outputs, inputs.input_ids,
        threshold=threshold,
        target_sizes=[frame.shape[:2]]
    )
    return (
        results[0]["boxes"].cpu().numpy(),
        results[0]["labels"],
        results[0]["scores"].cpu().numpy(),
    )


def run_dino_detections(keyframes, device, text_prompt, threshold, redetect_every):
    """Stage 1: Run Grounding DINO on keyframes. Returns per-frame boxes/labels/scores."""
    from transformers import AutoProcessor, AutoModelForZeroShotObjectDetection

    print(f"Loading Grounding DINO: {GDINO_MODEL_ID}")
    gd_processor = AutoProcessor.from_pretrained(GDINO_MODEL_ID, use_fast=False)
    gd_model = AutoModelForZeroShotObjectDetection.from_pretrained(GDINO_MODEL_ID).to(device)
    print("Grounding DINO loaded!")

    num_frames = len(keyframes)
    # Detect on frames that SAM2 will need: frame 0, then every redetect_every
    detect_indices = [0] + list(range(redetect_every, num_frames, redetect_every))
    # Also detect at chunk boundaries
    chunk_size = TRACK_CHUNK_SIZE
    for ci in range(1, (num_frames + chunk_size - 1) // chunk_size):
        idx = ci * chunk_size
        if idx < num_frames and idx not in detect_indices:
            detect_indices.append(idx)
    detect_indices = sorted(set(detect_indices))

    print(f"Running DINO on {len(detect_indices)} keyframes...")
    dino_results = {}  # frame_idx -> {"boxes": ..., "labels": ..., "scores": ...}

    for i, fi in enumerate(detect_indices):
        boxes, labels, scores = detect_frame(
            keyframes[fi], gd_processor, gd_model, text_prompt, threshold, device
        )
        labels = [normalize_label(l) for l in labels]
        dino_results[fi] = {
            "boxes": boxes,
            "labels": labels,
            "scores": scores,
        }
        if fi == 0:
            print(f"  Frame 0: {len(boxes)} detections")
            for label, score in zip(labels, scores):
                print(f"    {label}: {score:.2f}")
        elif (i + 1) % 10 == 0:
            print(f"  [{i + 1}/{len(detect_indices)}] frame {fi}: {len(boxes)} detections")

    # Free DINO
    del gd_model, gd_processor
    torch.cuda.empty_cache()
    print(f"DINO complete: detected on {len(dino_results)} frames")

    return dino_results


def run_sam2_tracking(keyframes, frames_dir, device, dino_results,
                      redetect_every, sam2_checkpoint, sam2_config):
    """Stage 2: SAM2 VideoPredictor tracking using pre-computed DINO boxes."""
    from sam2.build_sam import build_sam2_video_predictor, build_sam2

    all_frame_files = sorted([f for f in os.listdir(frames_dir) if f.endswith(".jpg")])
    num_frames = len(all_frame_files)

    object_labels = {}
    video_segments = {}

    chunk_size = TRACK_CHUNK_SIZE
    num_chunks = (num_frames + chunk_size - 1) // chunk_size
    print(f"SAM2 tracking: {num_frames} frames in {num_chunks} chunks of {chunk_size}...")

    for chunk_idx in range(num_chunks):
        chunk_start = chunk_idx * chunk_size
        chunk_end = min(chunk_start + chunk_size, num_frames)
        chunk_files = all_frame_files[chunk_start:chunk_end]
        chunk_len = len(chunk_files)
        print(f"  Chunk {chunk_idx + 1}/{num_chunks}: frames {chunk_start}-{chunk_end - 1} ({chunk_len} frames)")

        # Copy only this chunk's frames to a temp dir
        tmp_dir = os.path.join(os.path.abspath(os.path.dirname(frames_dir)), f"_chunk_tmp_{chunk_idx}")
        if os.path.exists(tmp_dir):
            shutil.rmtree(tmp_dir)
        os.makedirs(tmp_dir)
        abs_frames_dir = os.path.abspath(frames_dir)
        for local_idx, fname in enumerate(chunk_files):
            src = os.path.join(abs_frames_dir, fname)
            dst = os.path.join(tmp_dir, f"{local_idx:06d}.jpg")
            os.link(src, dst)

        video_predictor = build_sam2_video_predictor(sam2_config, sam2_checkpoint, device=device)

        # Run everything in bfloat16 so Flash Attention works (4-10x faster)
        with torch.autocast(device_type="cuda", dtype=torch.bfloat16):
            inference_state = video_predictor.init_state(video_path=tmp_dir)

            # Register DINO detections from cache for the first frame of this chunk
            chunk_dino = dino_results.get(chunk_start, dino_results.get(0))
            next_obj_id = max(object_labels.keys()) + 1 if object_labels else 1
            for obj_idx in range(len(chunk_dino["boxes"])):
                obj_id = next_obj_id + obj_idx
                object_labels[obj_id] = chunk_dino["labels"][obj_idx]
                video_predictor.add_new_points_or_box(
                    inference_state=inference_state,
                    frame_idx=0, obj_id=obj_id, box=chunk_dino["boxes"][obj_idx],
                )

            # Re-detect within chunk using cached DINO results
            for global_re_idx in range(chunk_start + redetect_every, chunk_end, redetect_every):
                if global_re_idx not in dino_results:
                    continue
                local_re_idx = global_re_idx - chunk_start
                rd = dino_results[global_re_idx]
                re_next_id = max(object_labels.keys()) + 1
                for nb, nl in zip(rd["boxes"], rd["labels"]):
                    object_labels[re_next_id] = nl
                    video_predictor.add_new_points_or_box(
                        inference_state=inference_state,
                        frame_idx=local_re_idx, obj_id=re_next_id, box=nb,
                    )
                    re_next_id += 1

            # Propagate
            for local_frame_idx, out_obj_ids, out_mask_logits in video_predictor.propagate_in_video(inference_state):
                global_frame_idx = chunk_start + local_frame_idx
                video_segments[global_frame_idx] = {}
                for i, out_obj_id in enumerate(out_obj_ids):
                    mask = (out_mask_logits[i] > 0.0).cpu().numpy().squeeze()
                    video_segments[global_frame_idx][out_obj_id] = mask

        del video_predictor, inference_state
        torch.cuda.empty_cache()
        shutil.rmtree(tmp_dir)

    print(f"Tracked {len(object_labels)} unique objects across {len(video_segments)} frames")

    # Build per-frame detection list
    all_detections = []
    for i in range(num_frames):
        frame_dets = []
        if i in video_segments:
            for obj_id, mask in video_segments[i].items():
                ys, xs = np.where(mask)
                if len(ys) == 0:
                    continue
                frame_dets.append({
                    "id": obj_id,
                    "label": object_labels.get(obj_id, "unknown"),
                    "bbox": [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())],
                    "mask": mask,
                })
        all_detections.append(frame_dets)

    det_counts = [len(d) for d in all_detections]
    print(f"Avg detections/frame: {np.mean(det_counts):.1f} | Min: {min(det_counts)} | Max: {max(det_counts)}")
    print("SAM2 tracking complete.")

    return all_detections, object_labels

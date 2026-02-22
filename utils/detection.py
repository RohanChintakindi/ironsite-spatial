"""
Grounded SAM 2: Object detection + segmentation + tracking.
Chunks frames into temp directories so SAM2 only loads chunk_size frames at a time.
"""

import sys
import os
import shutil
import torch
import numpy as np

sys.path.insert(0, "Grounded-SAM-2")

from config import GDINO_MODEL_ID, REDETECT_EVERY, LABEL_TO_ANALYTIC, TRACK_CHUNK_SIZE


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


def run_grounded_sam2(keyframes, frames_dir, device, text_prompt, threshold,
                      redetect_every, sam2_checkpoint, sam2_config):
    from sam2.build_sam import build_sam2_video_predictor, build_sam2
    from sam2.sam2_image_predictor import SAM2ImagePredictor
    from transformers import AutoProcessor, AutoModelForZeroShotObjectDetection

    # Load Grounding DINO (base for stronger detections)
    print(f"Loading Grounding DINO: {GDINO_MODEL_ID}")
    gd_processor = AutoProcessor.from_pretrained(GDINO_MODEL_ID, use_fast=False)
    gd_model = AutoModelForZeroShotObjectDetection.from_pretrained(GDINO_MODEL_ID).to(device)

    # Load SAM2
    sam2_model = build_sam2(sam2_config, sam2_checkpoint, device=device)
    image_predictor = SAM2ImagePredictor(sam2_model)
    print("Grounded SAM 2 models loaded!")

    # Get sorted frame filenames
    all_frame_files = sorted([f for f in os.listdir(frames_dir) if f.endswith(".jpg")])
    num_frames = len(all_frame_files)

    # Track object labels globally
    object_labels = {}
    video_segments = {}  # frame_idx -> {obj_id: mask}

    # --- Chunked tracking with temp directories ---
    chunk_size = TRACK_CHUNK_SIZE
    num_chunks = (num_frames + chunk_size - 1) // chunk_size
    print(f"Tracking {num_frames} frames in {num_chunks} chunks of {chunk_size}...")

    for chunk_idx in range(num_chunks):
        chunk_start = chunk_idx * chunk_size
        chunk_end = min(chunk_start + chunk_size, num_frames)
        chunk_files = all_frame_files[chunk_start:chunk_end]
        chunk_len = len(chunk_files)
        print(f"  Chunk {chunk_idx + 1}/{num_chunks}: frames {chunk_start}-{chunk_end - 1} ({chunk_len} frames)")

        # Create temp directory with ONLY this chunk's frames (renamed 000000.jpg, 000001.jpg, ...)
        tmp_dir = os.path.join(os.path.dirname(frames_dir), f"_chunk_tmp_{chunk_idx}")
        os.makedirs(tmp_dir, exist_ok=True)
        for local_idx, fname in enumerate(chunk_files):
            src = os.path.join(frames_dir, fname)
            dst = os.path.join(tmp_dir, f"{local_idx:06d}.jpg")
            os.symlink(src, dst)

        # Build video predictor for this chunk (only loads chunk_len frames)
        video_predictor = build_sam2_video_predictor(sam2_config, sam2_checkpoint, device=device)
        inference_state = video_predictor.init_state(video_path=tmp_dir)

        # Detect on the first frame of this chunk
        chunk_boxes, chunk_labels, chunk_scores = detect_frame(
            keyframes[chunk_start], gd_processor, gd_model, text_prompt, threshold, device
        )
        chunk_labels = [normalize_label(l) for l in chunk_labels]

        if chunk_idx == 0:
            print(f"    First frame: {len(chunk_boxes)} detections")
            for label, score in zip(chunk_labels, chunk_scores):
                print(f"      {label}: {score:.2f}")

        # Register detections on first frame of chunk (local frame_idx=0)
        next_obj_id = max(object_labels.keys()) + 1 if object_labels else 1
        for obj_idx in range(len(chunk_boxes)):
            obj_id = next_obj_id + obj_idx
            object_labels[obj_id] = chunk_labels[obj_idx]
            video_predictor.add_new_points_or_box(
                inference_state=inference_state,
                frame_idx=0, obj_id=obj_id, box=chunk_boxes[obj_idx],
            )

        # Re-detect within chunk at intervals
        for global_re_idx in range(chunk_start + redetect_every, chunk_end, redetect_every):
            local_re_idx = global_re_idx - chunk_start
            new_boxes, new_labels, _ = detect_frame(
                keyframes[global_re_idx], gd_processor, gd_model, text_prompt, threshold, device
            )
            new_labels = [normalize_label(l) for l in new_labels]
            re_next_id = max(object_labels.keys()) + 1
            for nb, nl in zip(new_boxes, new_labels):
                object_labels[re_next_id] = nl
                video_predictor.add_new_points_or_box(
                    inference_state=inference_state,
                    frame_idx=local_re_idx, obj_id=re_next_id, box=nb,
                )
                re_next_id += 1

        # Propagate tracking (only runs through chunk_len frames)
        for local_frame_idx, out_obj_ids, out_mask_logits in video_predictor.propagate_in_video(inference_state):
            global_frame_idx = chunk_start + local_frame_idx
            video_segments[global_frame_idx] = {}
            for i, out_obj_id in enumerate(out_obj_ids):
                mask = (out_mask_logits[i] > 0.0).cpu().numpy().squeeze()
                video_segments[global_frame_idx][out_obj_id] = mask

        # Cleanup
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

    # Free GPU memory
    del gd_model, gd_processor, image_predictor, sam2_model
    torch.cuda.empty_cache()
    print("Detection models unloaded.")

    return all_detections, object_labels

"""
Grounded SAM 2: Object detection + segmentation + tracking.
"""

import sys
import os
import torch
import numpy as np

sys.path.insert(0, "Grounded-SAM-2")


def load_models(device, sam2_checkpoint, sam2_config):
    from sam2.build_sam import build_sam2_video_predictor, build_sam2
    from sam2.sam2_image_predictor import SAM2ImagePredictor
    from transformers import AutoProcessor, AutoModelForZeroShotObjectDetection

    # Grounding DINO via HuggingFace
    gdino_id = "IDEA-Research/grounding-dino-tiny"
    gd_processor = AutoProcessor.from_pretrained(gdino_id)
    gd_model = AutoModelForZeroShotObjectDetection.from_pretrained(gdino_id).to(device)

    # SAM2
    sam2_model = build_sam2(sam2_config, sam2_checkpoint, device=device)
    image_predictor = SAM2ImagePredictor(sam2_model)
    video_predictor = build_sam2_video_predictor(sam2_config, sam2_checkpoint, device=device)

    print("Grounded SAM 2 models loaded!")
    return gd_processor, gd_model, image_predictor, video_predictor


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
    gd_processor, gd_model, image_predictor, video_predictor = load_models(
        device, sam2_checkpoint, sam2_config
    )

    # Detect on first frame
    boxes, labels, scores = detect_frame(
        keyframes[0], gd_processor, gd_model, text_prompt, threshold, device
    )
    print(f"First frame: {len(boxes)} detections")
    for label, score in zip(labels, scores):
        print(f"  {label}: {score:.2f}")

    # Segment first frame
    image_predictor.set_image(keyframes[0])
    masks, _, _ = image_predictor.predict(
        point_coords=None, point_labels=None,
        box=torch.tensor(boxes, device=device),
        multimask_output=False,
    )
    print(f"Generated {masks.shape[0]} masks")

    # Initialize video predictor
    inference_state = video_predictor.init_state(video_path=frames_dir)

    object_labels = {}
    for obj_idx in range(len(boxes)):
        obj_id = obj_idx + 1
        object_labels[obj_id] = labels[obj_idx]
        video_predictor.add_new_points_or_box(
            inference_state=inference_state,
            frame_idx=0, obj_id=obj_id, box=boxes[obj_idx],
        )

    # Re-detect on later frames
    next_obj_id = len(boxes) + 1
    for re_idx in range(redetect_every, len(keyframes), redetect_every):
        new_boxes, new_labels, _ = detect_frame(
            keyframes[re_idx], gd_processor, gd_model, text_prompt, threshold, device
        )
        for nb, nl in zip(new_boxes, new_labels):
            video_predictor.add_new_points_or_box(
                inference_state=inference_state,
                frame_idx=re_idx, obj_id=next_obj_id, box=nb,
            )
            object_labels[next_obj_id] = nl
            next_obj_id += 1
        print(f"  Re-detected frame {re_idx}: {len(new_boxes)} objects (total IDs: {next_obj_id - 1})")

    # Propagate tracking
    print("Propagating tracking across all frames...")
    video_segments = {}
    for out_frame_idx, out_obj_ids, out_mask_logits in video_predictor.propagate_in_video(inference_state):
        video_segments[out_frame_idx] = {}
        for i, out_obj_id in enumerate(out_obj_ids):
            mask = (out_mask_logits[i] > 0.0).cpu().numpy().squeeze()
            video_segments[out_frame_idx][out_obj_id] = mask

    print(f"Tracked {len(object_labels)} unique objects across {len(video_segments)} frames")

    # Build per-frame detection list
    all_detections = []
    for i in range(len(keyframes)):
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
    del gd_model, gd_processor, image_predictor, video_predictor
    torch.cuda.empty_cache()
    print("Detection models unloaded.")

    return all_detections, object_labels

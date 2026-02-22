"""
Scene Graph Builder: fuse detections + depth + poses into structured spatial data.
"""

import numpy as np
import json


def pixel_to_3d(u, v, depth, fx, fy, cx, cy):
    x = (u - cx) * depth / fx
    y = (v - cy) * depth / fy
    return [round(float(x), 2), round(float(y), 2), round(float(depth), 2)]


def compute_spatial_relations(objects, near_thresh=1.0, far_thresh=3.0,
                               dir_thresh_x=50, dir_thresh_y=30):
    relations = []
    for i, a in enumerate(objects):
        for j, b in enumerate(objects):
            if i >= j:
                continue

            avg_depth = (a["depth_m"] + b["depth_m"]) / 2
            cx_a = (a["bbox"][0] + a["bbox"][2]) / 2
            cx_b = (b["bbox"][0] + b["bbox"][2]) / 2
            cy_a = (a["bbox"][1] + a["bbox"][3]) / 2
            cy_b = (b["bbox"][1] + b["bbox"][3]) / 2

            # Proximity
            if avg_depth < near_thresh:
                relations.append([a["id_str"], "very_near", b["id_str"]])
            elif avg_depth < far_thresh:
                relations.append([a["id_str"], "near", b["id_str"]])
            else:
                relations.append([a["id_str"], "far", b["id_str"]])

            # Direction
            if cx_a < cx_b - dir_thresh_x:
                relations.append([a["id_str"], "left_of", b["id_str"]])
            elif cx_a > cx_b + dir_thresh_x:
                relations.append([a["id_str"], "right_of", b["id_str"]])
            if cy_a < cy_b - dir_thresh_y:
                relations.append([a["id_str"], "above", b["id_str"]])
            elif cy_a > cy_b + dir_thresh_y:
                relations.append([a["id_str"], "below", b["id_str"]])

            # Contact (mask overlap)
            if a.get("mask") is not None and b.get("mask") is not None:
                overlap = np.logical_and(a["mask"], b["mask"]).sum()
                union = np.logical_or(a["mask"], b["mask"]).sum()
                if union > 0 and overlap / union > 0.05:
                    relations.append([a["id_str"], "contacting", b["id_str"]])

    return relations


def detect_hand_state(objects, overlap_thresh=0.2, depth_thresh=0.5):
    hands = [o for o in objects if "hand" in o["label"].lower() or "glove" in o["label"].lower()]
    non_hands = [o for o in objects if o not in hands]
    hand_state = {}

    for hand in hands:
        hand_state[hand["id_str"]] = "free"
        hx1, hy1, hx2, hy2 = hand["bbox"]
        hand_area = (hx2 - hx1) * (hy2 - hy1)
        if hand_area <= 0:
            continue
        for obj in non_hands:
            ox1, oy1, ox2, oy2 = obj["bbox"]
            overlap_x = max(0, min(hx2, ox2) - max(hx1, ox1))
            overlap_y = max(0, min(hy2, oy2) - max(hy1, oy1))
            if (overlap_x * overlap_y) / hand_area > overlap_thresh:
                if abs(hand["depth_m"] - obj["depth_m"]) < depth_thresh:
                    hand_state[hand["id_str"]] = obj["id_str"]
                    break
    return hand_state


def build_scene_graphs(keyframes, all_detections, depth_maps, cam_poses_dict,
                       timestamps, frame_indices, fx, fy, cx, cy, config=None):
    from config import (NEAR_THRESHOLD, FAR_THRESHOLD, HAND_OVERLAP_THRESHOLD,
                        HAND_DEPTH_THRESHOLD, DIRECTION_THRESHOLD_X, DIRECTION_THRESHOLD_Y)

    img_h, img_w = keyframes[0].shape[:2]
    frame_cx, frame_cy = img_w / 2, img_h / 2

    scene_graphs = []

    for i in range(len(keyframes)):
        dm = depth_maps[i] if i < len(depth_maps) and depth_maps[i] is not None else None

        objects = []
        for det in all_detections[i]:
            x1, y1, x2, y2 = det["bbox"]
            obj_cx = (x1 + x2) / 2
            obj_cy = (y1 + y2) / 2

            # Depth from VGGT
            depth_val = 0.0
            if dm is not None:
                dm_h, dm_w = dm.shape[:2]
                scale_x, scale_y = dm_w / img_w, dm_h / img_h
                sx1 = max(0, int(x1 * scale_x))
                sy1 = max(0, int(y1 * scale_y))
                sx2 = min(dm_w, int(x2 * scale_x))
                sy2 = min(dm_h, int(y2 * scale_y))
                if sx2 > sx1 and sy2 > sy1:
                    patch = dm[sy1:sy2, sx1:sx2]
                    valid = patch[patch > 0]
                    if len(valid) > 0:
                        depth_val = float(np.median(valid))

            # Region label
            h_region = "left" if obj_cx < frame_cx - img_w * 0.2 else (
                "right" if obj_cx > frame_cx + img_w * 0.2 else "center")
            v_region = "top" if obj_cy < frame_cy - img_h * 0.2 else (
                "bottom" if obj_cy > frame_cy + img_h * 0.2 else "middle")

            id_str = f"{det['label'].replace(' ', '_')}_{det['id']}"
            pos_3d = pixel_to_3d(obj_cx, obj_cy, depth_val, fx, fy, cx, cy) if depth_val > 0 else [0, 0, 0]

            objects.append({
                "id": det["id"],
                "id_str": id_str,
                "label": det["label"],
                "bbox": det["bbox"],
                "mask": det.get("mask"),
                "depth_m": round(depth_val, 2),
                "position_3d": pos_3d,
                "region": f"{v_region}-{h_region}",
            })

        relations = compute_spatial_relations(
            objects, NEAR_THRESHOLD, FAR_THRESHOLD,
            DIRECTION_THRESHOLD_X, DIRECTION_THRESHOLD_Y
        )
        hand_state = detect_hand_state(objects, HAND_OVERLAP_THRESHOLD, HAND_DEPTH_THRESHOLD)

        cam_pose = None
        if i < len(cam_poses_dict):
            pos = cam_poses_dict[i]
            cam_pose = {"position": [round(float(p), 3) for p in pos]}

        ts = timestamps[i]
        graph = {
            "frame_index": i,
            "original_frame": frame_indices[i],
            "timestamp": round(ts, 2),
            "timestamp_str": f"{int(ts // 60):02d}:{ts % 60:05.2f}",
            "camera_pose": cam_pose,
            "num_objects": len(objects),
            "objects": [{k: v for k, v in obj.items() if k != "mask"} for obj in objects],
            "spatial_relations": relations,
            "hand_state": hand_state,
        }
        scene_graphs.append(graph)

    print(f"Built {len(scene_graphs)} scene graphs")
    return scene_graphs

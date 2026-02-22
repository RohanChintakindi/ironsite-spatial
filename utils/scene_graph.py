"""
Scene Graph Builder: fuse Grounded SAM 2 detections + VGGT-X 3D into structured spatial data.
Uses COLMAP world coordinates for globally consistent 3D positions.
"""

import numpy as np
import json


def compute_spatial_relations(objects, near_thresh=1.0, far_thresh=3.0):
    """Compute pairwise spatial relations using 3D world positions."""
    relations = []
    for i, a in enumerate(objects):
        for j, b in enumerate(objects):
            if i >= j:
                continue

            pa = np.array(a["position_3d"])
            pb = np.array(b["position_3d"])

            # Skip if either has no valid 3D position
            if np.all(pa == 0) or np.all(pb == 0):
                continue

            dist_3d = float(np.linalg.norm(pa - pb))
            dx = float(pb[0] - pa[0])  # world X difference
            dy = float(pb[1] - pa[1])  # world Y difference (vertical)

            # Proximity (using actual 3D distance)
            if dist_3d < near_thresh:
                relations.append([a["id_str"], "very_near", b["id_str"],
                                  {"distance_m": round(dist_3d, 2)}])
            elif dist_3d < far_thresh:
                relations.append([a["id_str"], "near", b["id_str"],
                                  {"distance_m": round(dist_3d, 2)}])
            else:
                relations.append([a["id_str"], "far", b["id_str"],
                                  {"distance_m": round(dist_3d, 2)}])

            # Horizontal direction (world X axis)
            if dx > 0.3:
                relations.append([a["id_str"], "left_of", b["id_str"]])
            elif dx < -0.3:
                relations.append([a["id_str"], "right_of", b["id_str"]])

            # Vertical (world Y axis)
            if dy > 0.3:
                relations.append([a["id_str"], "below", b["id_str"]])
            elif dy < -0.3:
                relations.append([a["id_str"], "above", b["id_str"]])

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
                # Check 3D distance if available
                pa = np.array(hand["position_3d"])
                pb = np.array(obj["position_3d"])
                if not np.all(pa == 0) and not np.all(pb == 0):
                    if np.linalg.norm(pa - pb) < depth_thresh:
                        hand_state[hand["id_str"]] = obj["id_str"]
                        break
                elif abs(hand["depth_m"] - obj["depth_m"]) < depth_thresh:
                    hand_state[hand["id_str"]] = obj["id_str"]
                    break
    return hand_state


def _colmap_3d_position(img_to_points3d, fname, bbox, cam_center):
    """Get metric 3D position from COLMAP points projected into a bbox.

    GA-scaled COLMAP points are in metric world coordinates — this is the
    primary source of depth/position data (same approach as the notebook).
    """
    pts = img_to_points3d.get(fname, [])
    if not pts:
        return 0.0, [0.0, 0.0, 0.0]

    x1, y1, x2, y2 = bbox
    matched_xyz = []
    for p in pts:
        px, py = p["xy"]
        if x1 <= px <= x2 and y1 <= py <= y2:
            matched_xyz.append(p["xyz"])

    if not matched_xyz:
        return 0.0, [0.0, 0.0, 0.0]

    pos_3d = np.median(np.array(matched_xyz), axis=0)

    # Metric depth = distance from camera center to object
    if cam_center is not None:
        depth_m = float(np.linalg.norm(pos_3d - np.array(cam_center)))
    else:
        depth_m = float(np.abs(pos_3d[2]))  # fallback: world Z

    return round(depth_m, 3), [round(float(v), 4) for v in pos_3d]


def build_scene_graphs(keyframes, all_detections, recon_data, timestamps, frame_indices):
    """Build scene graphs using VGGT-X COLMAP world coordinates."""
    from config import NEAR_THRESHOLD, FAR_THRESHOLD, HAND_OVERLAP_THRESHOLD, HAND_DEPTH_THRESHOLD

    image_data = recon_data["image_data"]
    img_to_points3d = recon_data.get("img_to_points3d", {})

    img_h, img_w = keyframes[0].shape[:2]
    scene_graphs = []
    hit_count = 0
    miss_count = 0

    for i in range(len(keyframes)):
        fname = f"{i:06d}.jpg"

        # Get camera data for this frame
        cam_data = image_data.get(fname, None)
        cam_center = cam_data["cam_center"] if cam_data else None

        objects = []
        for det in all_detections[i]:
            x1, y1, x2, y2 = det["bbox"]
            obj_cx = (x1 + x2) / 2
            obj_cy = (y1 + y2) / 2

            # Use COLMAP 3D points from GA (metric world coordinates)
            depth_m, pos_3d = _colmap_3d_position(
                img_to_points3d, fname, det["bbox"],
                cam_center.tolist() if cam_center is not None else None)

            if depth_m > 0:
                hit_count += 1
            else:
                miss_count += 1

            # Region label (screen-relative)
            h_region = "left" if obj_cx < img_w / 3 else ("right" if obj_cx > 2 * img_w / 3 else "center")
            v_region = "top" if obj_cy < img_h / 3 else ("bottom" if obj_cy > 2 * img_h / 3 else "middle")

            id_str = f"{det['label'].replace(' ', '_')}_{det['id']}"

            objects.append({
                "id": det["id"],
                "id_str": id_str,
                "label": det["label"],
                "bbox": det["bbox"],
                "mask": det.get("mask"),
                "depth_m": round(depth_m, 3),
                "position_3d": pos_3d,
                "region": f"{v_region}-{h_region}",
            })

        # Spatial relations using 3D world positions
        relations = compute_spatial_relations(objects, NEAR_THRESHOLD, FAR_THRESHOLD)
        hand_state = detect_hand_state(objects, HAND_OVERLAP_THRESHOLD, HAND_DEPTH_THRESHOLD)

        ts = timestamps[i]
        graph = {
            "frame_index": i,
            "original_frame": frame_indices[i],
            "timestamp": round(ts, 2),
            "timestamp_str": f"{int(ts // 60):02d}:{ts % 60:05.2f}",
            "camera_pose": {
                "position": [round(float(p), 4) for p in cam_center],
            } if cam_center is not None else None,
            "num_objects": len(objects),
            "objects": [{k: v for k, v in obj.items() if k != "mask"} for obj in objects],
            "spatial_relations": relations,
            "hand_state": hand_state,
            "colmap_frame": fname,
        }
        scene_graphs.append(graph)

    print(f"Built {len(scene_graphs)} scene graphs")
    print(f"  COLMAP 3D points: {hit_count} objects positioned, {miss_count} with no points in bbox")

    # Stats
    all_labels = set()
    for sg in scene_graphs:
        for obj in sg["objects"]:
            all_labels.add(obj["label"])
    print(f"Unique classes: {sorted(all_labels)}")
    print(f"Avg objects/frame: {np.mean([sg['num_objects'] for sg in scene_graphs]):.1f}")

    return scene_graphs

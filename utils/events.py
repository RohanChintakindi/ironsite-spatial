"""
Event Engine — extract structured events from the spatial graph.

Reads ALL frames (not a 5-frame sample) to detect:
- Block placements (worker near block over consecutive frames)
- Tool usage (hand holding tool objects)
- PPE compliance (safety equipment present/absent)
- Idle periods (no interactions for sustained time)
- Movement patterns (camera displacement)
- Worker-object interactions (proximity events)

Output: list of Event dicts, activity timeline, productivity stats.
"""

import numpy as np
from collections import defaultdict


# ---------------------------------------------------------------------------
# Label classification helpers
# ---------------------------------------------------------------------------

PPE_LABELS = {"safety vest", "hard hat", "safety helmet", "head protection",
              "hand protection", "gloves", "gloved hand", "safety"}
BLOCK_LABELS = {"concrete block", "cinder block", "brick"}
TOOL_LABELS = {"trowel", "bucket", "hammer", "wheelbarrow"}
WORKER_LABELS = {"worker", "person"}
EQUIPMENT_LABELS = {"crane", "scaffolding", "ladder", "machinery"}


def _classify(label):
    ll = label.lower()
    if ll in PPE_LABELS or any(p in ll for p in ("vest", "helmet", "hat", "glove", "safety")):
        return "ppe"
    if ll in BLOCK_LABELS or "block" in ll or "brick" in ll:
        return "block"
    if ll in TOOL_LABELS or "trowel" in ll or "bucket" in ll:
        return "tool"
    if ll in WORKER_LABELS or "worker" in ll or "person" in ll:
        return "worker"
    if ll in EQUIPMENT_LABELS or "crane" in ll or "scaffold" in ll:
        return "equipment"
    return "other"


# ---------------------------------------------------------------------------
# Core event extraction
# ---------------------------------------------------------------------------

def extract_events(scene_graphs):
    """Extract all events from scene graph sequence.

    Returns dict with:
        events: list of Event dicts
        timeline: activity timeline segments
        stats: productivity statistics
        ppe_report: per-frame PPE status
    """
    if not scene_graphs:
        return {"events": [], "timeline": [], "stats": {}, "ppe_report": []}

    events = []
    frame_dt = _estimate_frame_dt(scene_graphs)

    # Per-frame state tracking
    prev_hand_state = {}
    prev_worker_near_block = set()  # track_ids of blocks near worker
    idle_streak = 0
    active_streak = 0
    movement_segments = []
    ppe_per_frame = []

    # Accumulate for timeline
    frame_activities = []  # (frame_index, timestamp, activity_type)

    for sg in scene_graphs:
        fi = sg["frame_index"]
        ts = sg["timestamp"]
        ts_str = sg["timestamp_str"]
        objects = sg["objects"]
        relations = sg["spatial_relations"]
        hand_state = sg.get("hand_state", {})
        cam_pos = sg["camera_pose"]["position"] if sg["camera_pose"] else None

        # Classify objects in this frame
        obj_by_class = defaultdict(list)
        for obj in objects:
            cls = _classify(obj["label"])
            obj_by_class[cls].append(obj)

        workers = obj_by_class["worker"]
        blocks = obj_by_class["block"]
        tools = obj_by_class["tool"]
        ppe_items = obj_by_class["ppe"]

        # ---------------------------------------------------------------
        # 1. PPE compliance
        # ---------------------------------------------------------------
        ppe_labels_present = set(o["label"].lower() for o in ppe_items)
        has_vest = any("vest" in l for l in ppe_labels_present)
        has_helmet = any("hat" in l or "helmet" in l or l == "head protection" for l in ppe_labels_present)
        has_gloves = any("glove" in l or l == "hand protection" for l in ppe_labels_present)

        ppe_per_frame.append({
            "frame_index": fi,
            "timestamp": ts,
            "vest": has_vest,
            "helmet": has_helmet,
            "gloves": has_gloves,
            "items": list(ppe_labels_present),
        })

        # ---------------------------------------------------------------
        # 2. Hand state changes (tool pickup / putdown)
        # ---------------------------------------------------------------
        for hand_id, held in hand_state.items():
            prev_held = prev_hand_state.get(hand_id, "free")
            if held != "free" and prev_held == "free":
                # Picked up an object
                held_label = _find_label(objects, held)
                events.append({
                    "type": "tool_pickup",
                    "frame_index": fi,
                    "timestamp": ts,
                    "timestamp_str": ts_str,
                    "hand": hand_id,
                    "object": held,
                    "object_label": held_label,
                    "description": f"Picked up {held_label}",
                })
            elif held == "free" and prev_held != "free":
                prev_label = prev_held  # id_str
                events.append({
                    "type": "tool_putdown",
                    "frame_index": fi,
                    "timestamp": ts,
                    "timestamp_str": ts_str,
                    "hand": hand_id,
                    "object": prev_held,
                    "description": f"Put down object",
                })
        prev_hand_state = dict(hand_state)

        # ---------------------------------------------------------------
        # 3. Worker-block proximity (block placement detection)
        # ---------------------------------------------------------------
        current_near_blocks = set()
        for rel in relations:
            src, rel_type, tgt = rel[0], rel[1], rel[2]
            meta = rel[3] if len(rel) > 3 else {}

            if rel_type in ("very_near", "near"):
                src_cls = _classify_id(src)
                tgt_cls = _classify_id(tgt)

                # Worker near block
                if src_cls == "worker" and tgt_cls == "block":
                    current_near_blocks.add(tgt)
                elif tgt_cls == "worker" and src_cls == "block":
                    current_near_blocks.add(src)

                # Worker near tool
                if src_cls == "worker" and tgt_cls == "tool":
                    dist = meta.get("distance_m", 0)
                    if dist > 0 and dist < 0.5:
                        events.append({
                            "type": "tool_proximity",
                            "frame_index": fi,
                            "timestamp": ts,
                            "timestamp_str": ts_str,
                            "worker": src,
                            "tool": tgt,
                            "distance_m": dist,
                        })

        # New blocks appearing near worker = potential placement
        new_blocks = current_near_blocks - prev_worker_near_block
        for block_id in new_blocks:
            block_label = _find_label_by_id(objects, block_id)
            events.append({
                "type": "block_interaction",
                "frame_index": fi,
                "timestamp": ts,
                "timestamp_str": ts_str,
                "block": block_id,
                "block_label": block_label,
                "description": f"Worker near {block_label}",
            })
        prev_worker_near_block = current_near_blocks

        # ---------------------------------------------------------------
        # 4. Activity classification per frame
        # ---------------------------------------------------------------
        has_interaction = (
            any(h != "free" for h in hand_state.values()) or
            len(current_near_blocks) > 0 or
            any(rel[1] in ("very_near", "contacting") for rel in relations
                if _classify_id(rel[0]) == "worker" or _classify_id(rel[2]) == "worker")
        )

        has_tools_close = len(tools) > 0 and any(
            rel[1] in ("very_near", "near") for rel in relations
            if _classify_id(rel[0]) == "tool" or _classify_id(rel[2]) == "tool"
        )

        if has_interaction or has_tools_close:
            activity = "production" if len(current_near_blocks) > 0 else "prep"
            idle_streak = 0
            active_streak += 1
        else:
            idle_streak += 1
            active_streak = 0
            activity = "downtime" if idle_streak > 5 else "standby"

        frame_activities.append((fi, ts, ts_str, activity))

        # ---------------------------------------------------------------
        # 5. Movement tracking
        # ---------------------------------------------------------------
        if cam_pos is not None:
            movement_segments.append({
                "frame_index": fi,
                "timestamp": ts,
                "position": cam_pos,
            })

    # ---------------------------------------------------------------
    # Post-processing: build timeline, stats
    # ---------------------------------------------------------------
    timeline = _build_timeline(frame_activities, frame_dt)
    stats = _compute_stats(frame_activities, movement_segments, events, scene_graphs)
    ppe_report = _build_ppe_report(ppe_per_frame)

    # Idle period events
    idle_events = _detect_idle_periods(frame_activities, min_frames=8)
    events.extend(idle_events)

    # Movement events (significant relocations)
    move_events = _detect_relocations(movement_segments, min_distance=2.0)
    events.extend(move_events)

    # Sort all events by timestamp
    events.sort(key=lambda e: e.get("timestamp", 0))

    print(f"  Extracted {len(events)} events")
    print(f"  Timeline: {len(timeline)} segments")
    type_counts = defaultdict(int)
    for e in events:
        type_counts[e["type"]] += 1
    for etype, count in sorted(type_counts.items(), key=lambda x: -x[1]):
        print(f"    {etype}: {count}")

    return {
        "events": events,
        "timeline": timeline,
        "stats": stats,
        "ppe_report": ppe_report,
    }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _estimate_frame_dt(scene_graphs):
    """Estimate time between consecutive frames."""
    if len(scene_graphs) < 2:
        return 0.67
    dts = []
    for i in range(1, min(10, len(scene_graphs))):
        dt = scene_graphs[i]["timestamp"] - scene_graphs[i - 1]["timestamp"]
        if dt > 0:
            dts.append(dt)
    return np.median(dts) if dts else 0.67


def _find_label(objects, id_str):
    """Find label for an object by id_str."""
    for obj in objects:
        if obj.get("id_str") == id_str:
            return obj["label"]
    return id_str


def _find_label_by_id(objects, id_str):
    """Find label from id_str (e.g. concrete_block_5 -> concrete block)."""
    for obj in objects:
        if obj.get("id_str") == id_str:
            return obj["label"]
    # Parse from id_str: label_N -> label with underscores replaced
    parts = id_str.rsplit("_", 1)
    if len(parts) == 2:
        return parts[0].replace("_", " ")
    return id_str


def _classify_id(id_str):
    """Classify an object id_str by parsing the label from it."""
    label = id_str.rsplit("_", 1)[0].replace("_", " ")
    return _classify(label)


def _build_timeline(frame_activities, frame_dt):
    """Merge consecutive same-activity frames into timeline segments."""
    if not frame_activities:
        return []

    segments = []
    seg_start_fi, seg_start_ts, seg_start_str, seg_activity = frame_activities[0]

    for i in range(1, len(frame_activities)):
        fi, ts, ts_str, activity = frame_activities[i]

        if activity != seg_activity:
            segments.append({
                "start": seg_start_str,
                "end": frame_activities[i - 1][2],
                "start_sec": round(seg_start_ts, 2),
                "end_sec": round(frame_activities[i - 1][1], 2),
                "activity": seg_activity,
                "duration_sec": round(frame_activities[i - 1][1] - seg_start_ts, 2),
                "num_frames": fi - seg_start_fi,
            })
            seg_start_fi, seg_start_ts, seg_start_str, seg_activity = fi, ts, ts_str, activity

    # Final segment
    last = frame_activities[-1]
    segments.append({
        "start": seg_start_str,
        "end": last[2],
        "start_sec": round(seg_start_ts, 2),
        "end_sec": round(last[1], 2),
        "activity": seg_activity,
        "duration_sec": round(last[1] - seg_start_ts, 2),
        "num_frames": last[0] - seg_start_fi + 1,
    })

    # Merge very short segments (< 2 frames) into neighbors
    merged = []
    for seg in segments:
        if merged and seg["num_frames"] < 2 and merged[-1]["activity"] == seg["activity"]:
            merged[-1]["end"] = seg["end"]
            merged[-1]["end_sec"] = seg["end_sec"]
            merged[-1]["duration_sec"] = round(seg["end_sec"] - merged[-1]["start_sec"], 2)
            merged[-1]["num_frames"] += seg["num_frames"]
        else:
            merged.append(seg)

    return merged


def _compute_stats(frame_activities, movement_segments, events, scene_graphs):
    """Compute productivity statistics."""
    total_frames = len(frame_activities)
    if total_frames == 0:
        return {}

    activity_counts = defaultdict(int)
    for _, _, _, activity in frame_activities:
        activity_counts[activity] += 1

    total_time = frame_activities[-1][1] - frame_activities[0][1]
    if total_time <= 0:
        total_time = 1.0

    # Distance traveled
    total_distance = 0.0
    if len(movement_segments) > 1:
        for i in range(1, len(movement_segments)):
            p1 = np.array(movement_segments[i - 1]["position"])
            p2 = np.array(movement_segments[i]["position"])
            total_distance += float(np.linalg.norm(p2 - p1))

    # Count interactions
    tool_pickups = sum(1 for e in events if e["type"] == "tool_pickup")
    block_interactions = sum(1 for e in events if e["type"] == "block_interaction")
    relocations = sum(1 for e in events if e["type"] == "relocation")

    # Unique objects interacted with
    interacted_objects = set()
    for e in events:
        if e["type"] in ("tool_pickup", "block_interaction", "tool_proximity"):
            obj = e.get("object") or e.get("block") or e.get("tool")
            if obj:
                interacted_objects.add(obj)

    # Average objects per frame
    avg_objects = np.mean([sg["num_objects"] for sg in scene_graphs]) if scene_graphs else 0

    return {
        "total_time_sec": round(total_time, 1),
        "production_pct": round(100 * activity_counts.get("production", 0) / total_frames, 1),
        "prep_pct": round(100 * activity_counts.get("prep", 0) / total_frames, 1),
        "downtime_pct": round(100 * activity_counts.get("downtime", 0) / total_frames, 1),
        "standby_pct": round(100 * activity_counts.get("standby", 0) / total_frames, 1),
        "distance_traveled_m": round(total_distance, 2),
        "tool_pickups": tool_pickups,
        "block_interactions": block_interactions,
        "relocations": relocations,
        "unique_objects_interacted": len(interacted_objects),
        "avg_objects_per_frame": round(float(avg_objects), 1),
    }


def _build_ppe_report(ppe_per_frame):
    """Summarize PPE compliance across all frames."""
    if not ppe_per_frame:
        return {}

    n = len(ppe_per_frame)
    vest_frames = sum(1 for p in ppe_per_frame if p["vest"])
    helmet_frames = sum(1 for p in ppe_per_frame if p["helmet"])
    glove_frames = sum(1 for p in ppe_per_frame if p["gloves"])

    # All unique PPE items seen
    all_items = set()
    for p in ppe_per_frame:
        all_items.update(p["items"])

    concerns = []
    if vest_frames < n * 0.5:
        concerns.append(f"Safety vest only visible in {vest_frames}/{n} frames ({100*vest_frames/n:.0f}%)")
    if helmet_frames < n * 0.3:
        concerns.append(f"Hard hat only visible in {helmet_frames}/{n} frames ({100*helmet_frames/n:.0f}%)")

    return {
        "total_frames": n,
        "vest_visible_pct": round(100 * vest_frames / n, 1),
        "helmet_visible_pct": round(100 * helmet_frames / n, 1),
        "gloves_visible_pct": round(100 * glove_frames / n, 1),
        "all_ppe_items": sorted(all_items),
        "concerns": concerns,
    }


def _detect_idle_periods(frame_activities, min_frames=8):
    """Detect sustained idle periods."""
    events = []
    idle_start = None
    idle_count = 0

    for fi, ts, ts_str, activity in frame_activities:
        if activity in ("downtime", "standby"):
            if idle_start is None:
                idle_start = (fi, ts, ts_str)
            idle_count += 1
        else:
            if idle_start is not None and idle_count >= min_frames:
                events.append({
                    "type": "idle_period",
                    "frame_index": idle_start[0],
                    "timestamp": idle_start[1],
                    "timestamp_str": idle_start[2],
                    "end_frame": fi,
                    "end_timestamp": ts,
                    "duration_frames": idle_count,
                    "description": f"Idle for {idle_count} frames (~{idle_count * 0.67:.0f}s)",
                })
            idle_start = None
            idle_count = 0

    # Check final streak
    if idle_start is not None and idle_count >= min_frames:
        last = frame_activities[-1]
        events.append({
            "type": "idle_period",
            "frame_index": idle_start[0],
            "timestamp": idle_start[1],
            "timestamp_str": idle_start[2],
            "end_frame": last[0],
            "end_timestamp": last[1],
            "duration_frames": idle_count,
            "description": f"Idle for {idle_count} frames (~{idle_count * 0.67:.0f}s)",
        })

    return events


def _detect_relocations(movement_segments, min_distance=2.0):
    """Detect significant worker relocations (moved > min_distance meters)."""
    events = []
    if len(movement_segments) < 2:
        return events

    # Check displacement over sliding windows
    window = 15  # frames
    for i in range(0, len(movement_segments) - window, window // 2):
        j = min(i + window, len(movement_segments) - 1)
        p1 = np.array(movement_segments[i]["position"])
        p2 = np.array(movement_segments[j]["position"])
        dist = float(np.linalg.norm(p2 - p1))

        if dist >= min_distance:
            events.append({
                "type": "relocation",
                "frame_index": movement_segments[i]["frame_index"],
                "timestamp": movement_segments[i]["timestamp"],
                "timestamp_str": f"{int(movement_segments[i]['timestamp'] // 60):02d}:{movement_segments[i]['timestamp'] % 60:05.2f}",
                "end_frame": movement_segments[j]["frame_index"],
                "distance_m": round(dist, 2),
                "from_pos": movement_segments[i]["position"],
                "to_pos": movement_segments[j]["position"],
                "description": f"Moved {dist:.1f}m",
            })

    return events


# ---------------------------------------------------------------------------
# VLM narrator (optional — send compact event summary instead of raw data)
# ---------------------------------------------------------------------------

def events_to_vlm_context(event_result):
    """Convert event engine output to compact text for optional VLM narration."""
    lines = []

    stats = event_result.get("stats", {})
    if stats:
        lines.append("=== PRODUCTIVITY ===")
        lines.append(f"Total time: {stats.get('total_time_sec', 0):.0f}s")
        lines.append(f"Production: {stats.get('production_pct', 0):.0f}%")
        lines.append(f"Prep: {stats.get('prep_pct', 0):.0f}%")
        lines.append(f"Downtime: {stats.get('downtime_pct', 0):.0f}%")
        lines.append(f"Distance: {stats.get('distance_traveled_m', 0):.1f}m")
        lines.append(f"Tool pickups: {stats.get('tool_pickups', 0)}")
        lines.append(f"Block interactions: {stats.get('block_interactions', 0)}")
        lines.append("")

    ppe = event_result.get("ppe_report", {})
    if ppe:
        lines.append("=== PPE ===")
        lines.append(f"Vest: {ppe.get('vest_visible_pct', 0):.0f}% of frames")
        lines.append(f"Helmet: {ppe.get('helmet_visible_pct', 0):.0f}% of frames")
        lines.append(f"Gloves: {ppe.get('gloves_visible_pct', 0):.0f}% of frames")
        if ppe.get("concerns"):
            for c in ppe["concerns"]:
                lines.append(f"  ⚠ {c}")
        lines.append("")

    timeline = event_result.get("timeline", [])
    if timeline:
        lines.append("=== TIMELINE ===")
        for seg in timeline:
            lines.append(
                f"{seg['start']} → {seg['end']} | {seg['activity']:12s} | "
                f"{seg['duration_sec']:.0f}s ({seg['num_frames']} frames)"
            )
        lines.append("")

    events = event_result.get("events", [])
    key_events = [e for e in events if e["type"] in
                  ("tool_pickup", "tool_putdown", "block_interaction",
                   "idle_period", "relocation")]
    if key_events:
        lines.append(f"=== KEY EVENTS ({len(key_events)}) ===")
        for e in key_events[:50]:  # cap at 50
            desc = e.get("description", e["type"])
            lines.append(f"  [{e.get('timestamp_str', '??:??')}] {desc}")

    return "\n".join(lines)

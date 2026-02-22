"""
VLM Reasoning: send structured graph context + frame images to Grok.

Supports multimodal (vision) when keyframes are provided, falls back to
text-only structured graph context.
"""

import base64
import io
import json
import numpy as np
from openai import OpenAI


SYSTEM_PROMPT = """You are analyzing spatial scene data from a construction worker's chest-mounted body camera.

You receive:
1. A structured spatial graph showing objects detected at each timestamp with their 3D positions (in meters), spatial relations, and the worker's camera position.
2. Key frame images from the most interesting moments (highest object interaction).

Relation types:
- VERY_NEAR (<1m), NEAR (1-3m), FAR (>3m) — metric 3D distance
- LEFT_OF, RIGHT_OF, ABOVE, BELOW — spatial arrangement
- CONTACTING — mask overlap (physical contact)
- HELD_BY — hand holding an object

Your task:
1. ACTIVITY TIMELINE: For each time segment, classify the activity:
   - "production" = actively doing construction work (laying blocks, applying mortar, welding, etc.)
   - "prep" = preparing materials or tools (carrying, mixing, measuring, organizing)
   - "downtime" = idle, waiting, standing around
   - "standby" = on-site but not at workstation

2. SPECIFIC ACTIONS: Describe what the worker is doing at each segment. Use the images to confirm object identities and actions.

3. PRODUCTIVITY METRICS:
   - Total active work time vs idle time
   - Objects interacted with (from HELD_BY and CONTACTING relations)
   - Distance traveled (from camera positions)
   - Estimated blocks placed (if masonry work)

4. SAFETY: Note any PPE observations (hard hats, safety vests detected or missing).

Output as JSON with this structure:
{
  "activity_timeline": [{"start": "MM:SS", "end": "MM:SS", "activity": "...", "description": "..."}],
  "summary": {"production_pct": X, "prep_pct": X, "downtime_pct": X, "standby_pct": X},
  "productivity": {"objects_interacted": [...], "distance_traveled_m": X, "key_actions": [...]},
  "safety": {"ppe_observed": [...], "concerns": [...]}
}"""


def _frame_to_base64(frame_rgb, max_size=768):
    """Encode RGB numpy array as base64 JPEG, resized for API efficiency."""
    from PIL import Image
    img = Image.fromarray(frame_rgb)

    # Resize if too large
    w, h = img.size
    if max(w, h) > max_size:
        scale = max_size / max(w, h)
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=80)
    return base64.b64encode(buf.getvalue()).decode("utf-8")


def run_vlm_analysis(scene_graphs, video_path, api_key, model="grok-3-fast",
                     base_url="https://api.x.ai/v1", num_samples=30,
                     temperature=0.3, max_tokens=4000,
                     spatial_graph=None, keyframes=None, num_images=5,
                     event_context=None):
    """Run VLM analysis with structured graph context and optional frame images.

    Args:
        spatial_graph: SpatialGraph instance (from utils.graph). If provided,
            uses structured graph serialization instead of raw JSON.
        event_context: Pre-computed event engine text (from events_to_vlm_context).
            If provided, this is used as the primary context (much more compact).
        keyframes: List of RGB numpy arrays. If provided with spatial_graph,
            sends the most interesting frames as images (multimodal).
        num_images: Number of frame images to send (default 5).
    """
    client = OpenAI(api_key=api_key, base_url=base_url)

    # Build context: prefer event summary > graph serialization > raw JSON
    if event_context is not None:
        context_str = event_context
        context_type = "events"
    elif spatial_graph is not None:
        graph_text = spatial_graph.serialize_for_vlm(max_frames=num_samples)
        context_str = graph_text
        context_type = "graph"
    else:
        # Legacy: raw JSON
        indices = np.linspace(0, len(scene_graphs) - 1,
                              min(num_samples, len(scene_graphs)), dtype=int)
        sampled = [scene_graphs[i] for i in indices]
        compact = []
        for sg in sampled:
            compact.append({
                "t": sg["timestamp_str"],
                "objects": [
                    {"id": o["id_str"], "class": o["label"], "depth_m": o["depth_m"],
                     "pos": o["position_3d"], "region": o["region"]}
                    for o in sg["objects"]
                ],
                "relations": sg["spatial_relations"],
                "hands": sg["hand_state"],
                "cam_pos": sg["camera_pose"]["position"] if sg["camera_pose"] else None,
            })
        context_str = json.dumps(compact, default=str)
        context_type = "json"

    # Build multimodal message content
    content_parts = []

    # Add frame images if available
    image_frame_indices = []
    if keyframes is not None and spatial_graph is not None:
        interesting = spatial_graph.get_interesting_frames(top_k=num_images)
        if not interesting:
            # Fall back to evenly spaced
            interesting = np.linspace(0, len(keyframes) - 1, num_images, dtype=int).tolist()

        for fi in interesting:
            if 0 <= fi < len(keyframes):
                b64 = _frame_to_base64(keyframes[fi])
                ts_str = scene_graphs[fi]["timestamp_str"] if fi < len(scene_graphs) else "?"
                content_parts.append({
                    "type": "text",
                    "text": f"[Frame {fi} at t={ts_str}]"
                })
                content_parts.append({
                    "type": "image_url",
                    "image_url": {"url": f"data:image/jpeg;base64,{b64}"}
                })
                image_frame_indices.append(fi)

        print(f"  Sending {len(image_frame_indices)} frame images (frames: {image_frame_indices})")

    # Add text context
    if context_type == "events":
        text_prompt = (
            f"Below is an automated event analysis from a construction worker's body camera. "
            f"The images show key moments. Use both to write a detailed narration of the "
            f"worker's activity, confirm or correct the automated findings, and note anything "
            f"the automation may have missed.\n\n"
            f"EVENT ENGINE OUTPUT:\n{context_str}\n\n"
            f"Video: {video_path}\n"
            f"Provide your full analysis as JSON."
        )
    elif context_type == "graph":
        text_prompt = (
            f"Analyze this construction worker's activity from structured spatial graph data "
            f"spanning the full video.\n\n"
            f"SPATIAL GRAPH (each line = object at timestamp with relations):\n"
            f"{context_str}\n\n"
            f"Video: {video_path}\n"
            f"Provide your full analysis as JSON."
        )
    else:
        text_prompt = (
            f"Analyze this construction worker's activity from {len(json.loads(context_str))} "
            f"scene graph snapshots spanning the full video:\n\n"
            f"{context_str}\n\n"
            f"Video: {video_path}\n"
            f"Provide your full analysis as JSON."
        )

    content_parts.append({"type": "text", "text": text_prompt})

    estimated_tokens = len(context_str) // 4
    print(f"  Sending {context_type} context to {model} (~{estimated_tokens} text tokens)")

    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": content_parts},
        ],
        temperature=temperature,
        max_tokens=max_tokens,
    )

    result = response.choices[0].message.content
    print("\n" + "=" * 60)
    print("VLM ANALYSIS")
    print("=" * 60)
    print(result)

    # Try to parse JSON (handle markdown code blocks)
    json_str = result
    if "```json" in json_str:
        json_str = json_str.split("```json")[1].split("```")[0].strip()
    elif "```" in json_str:
        json_str = json_str.split("```")[1].split("```")[0].strip()

    try:
        analysis = json.loads(json_str)
        if "summary" in analysis:
            s = analysis["summary"]
            print(f"\n--- Summary ---")
            print(f"Production: {s.get('production_pct', '?')}%")
            print(f"Prep: {s.get('prep_pct', '?')}%")
            print(f"Downtime: {s.get('downtime_pct', '?')}%")
            print(f"Standby: {s.get('standby_pct', '?')}%")
    except json.JSONDecodeError:
        analysis = {"raw": result}

    return analysis

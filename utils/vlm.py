"""
VLM Reasoning: send scene graphs to Grok for activity analysis.
"""

import json
import numpy as np
from openai import OpenAI


SYSTEM_PROMPT = """You are analyzing spatial scene data from a construction worker's chest-mounted body camera.

The data is a sequence of scene graph snapshots at different timestamps. Each contains:
- Detected objects with class, metric depth (meters), 3D position, and screen region
- Spatial relations between objects (near, contacting, left_of, above, etc.)
- Hand state: what the worker's hands are holding ("free" or object ID)
- Camera position: the worker's location in 3D space

Your task:
1. ACTIVITY TIMELINE: For each time segment, classify the activity:
   - "production" = actively doing construction work (laying blocks, applying mortar, welding, etc.)
   - "prep" = preparing materials or tools (carrying, mixing, measuring, organizing)
   - "downtime" = idle, waiting, standing around
   - "standby" = on-site but not at workstation

2. SPECIFIC ACTIONS: Describe what the worker is doing at each segment.

3. PRODUCTIVITY METRICS:
   - Total active work time vs idle time
   - Objects interacted with
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


def run_vlm_analysis(scene_graphs, video_path, api_key, model="grok-3-fast",
                     base_url="https://api.x.ai/v1", num_samples=30,
                     temperature=0.3, max_tokens=4000):
    client = OpenAI(api_key=api_key, base_url=base_url)

    # Sample scene graphs evenly across the video
    indices = np.linspace(0, len(scene_graphs) - 1, min(num_samples, len(scene_graphs)), dtype=int)
    sampled = [scene_graphs[i] for i in indices]

    # Compact format to save tokens
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

    user_prompt = (
        f"Analyze this construction worker's activity from {len(compact)} scene graph "
        f"snapshots spanning the full video:\n\n"
        f"{json.dumps(compact, default=str)}\n\n"
        f"The video filename suggests this is: {video_path}\n"
        f"Provide your full analysis."
    )

    estimated_tokens = len(json.dumps(compact)) // 4
    print(f"Sending {len(compact)} scene graphs to {model} (~{estimated_tokens} tokens)...")

    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        temperature=temperature,
        max_tokens=max_tokens,
    )

    result = response.choices[0].message.content
    print("\n" + "=" * 60)
    print("VLM ANALYSIS")
    print("=" * 60)
    print(result)

    # Try to parse JSON
    try:
        analysis = json.loads(result)
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

"""
Visualization and export utilities.
"""

import json
import os
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import plotly.graph_objects as go
from collections import Counter


def plot_annotated_frames(keyframes, scene_graphs, depth_maps, timestamps, output_dir):
    os.makedirs(output_dir, exist_ok=True)

    fig, axes = plt.subplots(2, 5, figsize=(25, 10))
    sample_idx = np.linspace(0, len(keyframes) - 1, 5, dtype=int)

    for col, si in enumerate(sample_idx):
        axes[0, col].imshow(keyframes[si])
        for obj in scene_graphs[si]["objects"]:
            x1, y1, x2, y2 = obj["bbox"]
            rect = plt.Rectangle((x1, y1), x2 - x1, y2 - y1, linewidth=2,
                                 edgecolor='lime', facecolor='none')
            axes[0, col].add_patch(rect)
            axes[0, col].text(x1, y1 - 3, f"{obj['label']} {obj['depth_m']}m",
                              color='yellow', fontsize=6, weight='bold',
                              bbox=dict(boxstyle='round,pad=0.1', facecolor='black', alpha=0.7))
        axes[0, col].set_title(f"t={timestamps[si]:.1f}s ({scene_graphs[si]['num_objects']} objs)")
        axes[0, col].axis("off")

        if si < len(depth_maps) and depth_maps[si] is not None:
            axes[1, col].imshow(depth_maps[si], cmap='turbo')
            axes[1, col].set_title(f"Depth: {depth_maps[si].min():.1f}-{depth_maps[si].max():.1f}m")
        else:
            axes[1, col].text(0.5, 0.5, "No depth", ha='center', va='center',
                              transform=axes[1, col].transAxes)
        axes[1, col].axis("off")

    plt.suptitle("Annotated Frames + Depth Maps", fontsize=14)
    plt.tight_layout()
    plt.savefig(os.path.join(output_dir, "annotated_frames.png"), dpi=150, bbox_inches='tight')
    plt.close()
    print(f"Saved annotated_frames.png")


def plot_3d_scene(point_cloud, cam_positions_smooth, output_dir):
    os.makedirs(output_dir, exist_ok=True)

    # Subsample for plotting
    if len(point_cloud) > 20000:
        idx = np.random.choice(len(point_cloud), 20000, replace=False)
        viz_pts = point_cloud[idx]
    else:
        viz_pts = point_cloud

    fig = go.Figure()
    if len(viz_pts) > 0:
        fig.add_trace(go.Scatter3d(
            x=viz_pts[:, 0], y=viz_pts[:, 1], z=viz_pts[:, 2],
            mode='markers', marker=dict(size=1, color='gray', opacity=0.3),
            name='Point Cloud'
        ))
    if len(cam_positions_smooth) > 0:
        fig.add_trace(go.Scatter3d(
            x=cam_positions_smooth[:, 0], y=cam_positions_smooth[:, 1], z=cam_positions_smooth[:, 2],
            mode='lines+markers', marker=dict(size=3, color='red'),
            line=dict(color='red', width=3), name='Worker Trajectory'
        ))
    fig.update_layout(title="3D Workspace + Worker Trajectory", width=900, height=700)
    fig.write_html(os.path.join(output_dir, "3d_scene.html"))
    print(f"Saved 3d_scene.html")
    return fig


def plot_trajectory_topdown(cam_positions_smooth, output_dir):
    os.makedirs(output_dir, exist_ok=True)

    if len(cam_positions_smooth) < 2:
        print("Not enough camera positions for trajectory plot")
        return

    fig, ax = plt.subplots(figsize=(10, 10))
    ax.plot(cam_positions_smooth[:, 0], cam_positions_smooth[:, 2], 'b-', alpha=0.5, linewidth=1)
    ax.scatter(cam_positions_smooth[0, 0], cam_positions_smooth[0, 2], c='green', s=100, zorder=5, label='Start')
    ax.scatter(cam_positions_smooth[-1, 0], cam_positions_smooth[-1, 2], c='red', s=100, zorder=5, label='End')
    scatter = ax.scatter(cam_positions_smooth[:, 0], cam_positions_smooth[:, 2],
                         c=np.arange(len(cam_positions_smooth)), cmap='viridis', s=10, zorder=3)
    plt.colorbar(scatter, label='Frame index')
    ax.set_xlabel("X (meters)")
    ax.set_ylabel("Z (meters)")
    ax.set_title("Worker Trajectory (Top-Down View)")
    ax.legend()
    ax.set_aspect('equal')
    plt.tight_layout()
    plt.savefig(os.path.join(output_dir, "trajectory_topdown.png"), dpi=150, bbox_inches='tight')
    plt.close()
    print(f"Saved trajectory_topdown.png")


def plot_activity_timeline(analysis_json, output_dir):
    os.makedirs(output_dir, exist_ok=True)

    if "activity_timeline" not in analysis_json:
        print("No activity timeline in VLM analysis")
        return

    timeline = analysis_json["activity_timeline"]
    colors = {"production": "#2ecc71", "prep": "#3498db", "downtime": "#e74c3c", "standby": "#f39c12"}

    fig, ax = plt.subplots(figsize=(20, 3))
    for entry in timeline:
        try:
            start_parts = entry["start"].split(":")
            end_parts = entry["end"].split(":")
            start_sec = int(start_parts[0]) * 60 + float(start_parts[1])
            end_sec = int(end_parts[0]) * 60 + float(end_parts[1])
            duration = end_sec - start_sec
            color = colors.get(entry.get("activity", ""), "#95a5a6")
            ax.barh(0, duration, left=start_sec, height=0.6, color=color, edgecolor='white', linewidth=0.5)
        except (ValueError, KeyError):
            continue

    patches = [mpatches.Patch(color=c, label=l) for l, c in colors.items()]
    ax.legend(handles=patches, loc='upper right')
    ax.set_xlabel("Time (seconds)")
    ax.set_yticks([])
    ax.set_title("Worker Activity Timeline")
    plt.tight_layout()
    plt.savefig(os.path.join(output_dir, "activity_timeline.png"), dpi=150, bbox_inches='tight')
    plt.close()
    print(f"Saved activity_timeline.png")


def plot_object_frequency(scene_graphs, output_dir):
    os.makedirs(output_dir, exist_ok=True)

    label_counts = Counter()
    for sg in scene_graphs:
        for obj in sg["objects"]:
            label_counts[obj["label"]] += 1

    top = label_counts.most_common(15)
    fig, ax = plt.subplots(figsize=(12, 5))
    ax.barh([l for l, _ in top], [c for _, c in top], color='steelblue')
    ax.set_xlabel("Total appearances across all frames")
    ax.set_title("Object Detection Frequency")
    plt.tight_layout()
    plt.savefig(os.path.join(output_dir, "object_frequency.png"), dpi=150, bbox_inches='tight')
    plt.close()
    print(f"Saved object_frequency.png")


def export_results(scene_graphs, analysis_json, cam_positions_smooth, object_labels,
                   timestamps, video_path, output_dir):
    os.makedirs(output_dir, exist_ok=True)

    # Scene graphs
    with open(os.path.join(output_dir, "scene_graphs.json"), "w") as f:
        json.dump(scene_graphs, f, indent=2, default=str)

    # VLM analysis
    with open(os.path.join(output_dir, "vlm_analysis.json"), "w") as f:
        json.dump(analysis_json, f, indent=2, default=str)

    # Trajectory
    np.save(os.path.join(output_dir, "camera_trajectory.npy"), cam_positions_smooth)

    # Summary
    all_labels = set()
    for sg in scene_graphs:
        for obj in sg["objects"]:
            all_labels.add(obj["label"])

    total_dist = 0.0
    if len(cam_positions_smooth) > 1:
        total_dist = float(np.sum(np.linalg.norm(np.diff(cam_positions_smooth, axis=0), axis=1)))

    summary = {
        "video": video_path,
        "duration_sec": round(timestamps[-1] - timestamps[0], 1) if timestamps else 0,
        "total_keyframes": len(scene_graphs),
        "unique_objects_tracked": len(object_labels),
        "unique_classes": sorted(list(all_labels)),
        "total_distance_m": round(total_dist, 2),
        "avg_objects_per_frame": round(float(np.mean([sg["num_objects"] for sg in scene_graphs])), 1),
    }
    with open(os.path.join(output_dir, "summary.json"), "w") as f:
        json.dump(summary, f, indent=2)

    print(f"\nExported to {output_dir}/:")
    for k, v in summary.items():
        print(f"  {k}: {v}")

    return summary

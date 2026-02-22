"""
Spatial Scene Graph — NetworkX graph from pipeline scene graphs.

Nodes: TrackedObject, Frame, Observation
Edges: OBSERVED_AS, IN_FRAME, NEXT, spatial relations, HELD_BY

Provides GraphRAG queries and VLM serialization.
"""

import json
import os
import numpy as np

try:
    import networkx as nx
except ImportError:
    raise ImportError("pip install networkx")


# Node/edge colors for visualization
NODE_COLORS = {
    "frame": "#3498db",
    "worker": "#2ecc71",
    "concrete block": "#e67e22",
    "safety vest": "#f39c12",
    "hand protection": "#e74c3c",
    "head protection": "#1abc9c",
    "crane": "#9b59b6",
    "ladder": "#e74c3c",
    "safety": "#f1c40f",
    "default": "#95a5a6",
}

EDGE_COLORS = {
    "VERY_NEAR": "#e74c3c",
    "NEAR": "#f39c12",
    "FAR": "#3498db",
    "HELD_BY": "#e74c3c",
    "CONTACTING": "#e67e22",
    "LEFT_OF": "#95a5a6",
    "RIGHT_OF": "#95a5a6",
    "ABOVE": "#95a5a6",
    "BELOW": "#95a5a6",
    "NEXT": "#2c3e50",
    "IN_FRAME": "#7f8c8d",
    "OBSERVED_AS": "#bdc3c7",
}


class SpatialGraph:
    """Build and query a NetworkX graph from pipeline scene graphs."""

    def __init__(self):
        self.G = nx.DiGraph()
        self._tracked_objects = {}  # label_id -> first_seen, last_seen

    def build(self, scene_graphs):
        """Build graph from list of scene graph dicts."""
        G = self.G

        prev_frame_id = None

        for sg in scene_graphs:
            fi = sg["frame_index"]
            ts = sg["timestamp"]
            ts_str = sg["timestamp_str"]
            cam_pos = sg["camera_pose"]["position"] if sg["camera_pose"] else None

            # Frame node
            frame_id = f"frame_{fi}"
            G.add_node(frame_id, type="frame", timestamp=ts, timestamp_str=ts_str,
                       camera_position=cam_pos, num_objects=sg["num_objects"])

            # Temporal edge
            if prev_frame_id is not None:
                prev_ts = G.nodes[prev_frame_id]["timestamp"]
                G.add_edge(prev_frame_id, frame_id, relation="NEXT",
                           dt=round(ts - prev_ts, 2))
            prev_frame_id = frame_id

            # Observation nodes for each detected object
            obs_map = {}  # id_str -> obs_node_id
            for obj in sg["objects"]:
                id_str = obj["id_str"]
                obs_id = f"obs_{id_str}_f{fi}"

                # TrackedObject node (persistent across frames)
                if id_str not in self._tracked_objects:
                    G.add_node(id_str, type="tracked_object", label=obj["label"],
                               first_seen=ts, last_seen=ts, first_frame=fi, last_frame=fi)
                    self._tracked_objects[id_str] = True
                else:
                    G.nodes[id_str]["last_seen"] = ts
                    G.nodes[id_str]["last_frame"] = fi

                # Observation node (per-frame snapshot)
                G.add_node(obs_id, type="observation", label=obj["label"],
                           depth_m=obj["depth_m"], position_3d=obj["position_3d"],
                           bbox=obj["bbox"], region=obj.get("region", ""),
                           frame_index=fi, timestamp=ts)

                # TrackedObject -> Observation
                G.add_edge(id_str, obs_id, relation="OBSERVED_AS")
                # Observation -> Frame
                G.add_edge(obs_id, frame_id, relation="IN_FRAME")

                obs_map[id_str] = obs_id

            # Spatial relation edges (between observations in same frame)
            for rel in sg["spatial_relations"]:
                src_str, rel_type, tgt_str = rel[0], rel[1].upper(), rel[2]
                meta = rel[3] if len(rel) > 3 else {}

                src_obs = obs_map.get(src_str)
                tgt_obs = obs_map.get(tgt_str)
                if src_obs and tgt_obs:
                    G.add_edge(src_obs, tgt_obs, relation=rel_type, **meta)

            # Hand state edges
            for hand_id, held in sg.get("hand_state", {}).items():
                if held != "free":
                    hand_obs = obs_map.get(hand_id)
                    held_obs = obs_map.get(held)
                    if hand_obs and held_obs:
                        G.add_edge(held_obs, hand_obs, relation="HELD_BY")

        # Stats
        n_frames = sum(1 for _, d in G.nodes(data=True) if d.get("type") == "frame")
        n_tracked = sum(1 for _, d in G.nodes(data=True) if d.get("type") == "tracked_object")
        n_obs = sum(1 for _, d in G.nodes(data=True) if d.get("type") == "observation")
        n_spatial = sum(1 for _, _, d in G.edges(data=True)
                        if d.get("relation") not in ("OBSERVED_AS", "IN_FRAME", "NEXT"))

        print(f"  Graph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges")
        print(f"    {n_frames} frames, {n_tracked} tracked objects, {n_obs} observations")
        print(f"    {n_spatial} spatial relation edges")

        return self

    # ------------------------------------------------------------------
    # GraphRAG queries
    # ------------------------------------------------------------------

    def query_time_window(self, t_start, t_end):
        """Subgraph for a time range."""
        nodes = set()
        for n, d in self.G.nodes(data=True):
            if d.get("type") == "frame" and t_start <= d.get("timestamp", 0) <= t_end:
                nodes.add(n)
            elif d.get("type") == "observation" and t_start <= d.get("timestamp", 0) <= t_end:
                nodes.add(n)
        # Add tracked objects connected to these observations
        for n in list(nodes):
            for pred in self.G.predecessors(n):
                if self.G.nodes[pred].get("type") == "tracked_object":
                    nodes.add(pred)
        return self.G.subgraph(nodes)

    def query_object_history(self, object_id_str):
        """All observations of a tracked object across time."""
        if object_id_str not in self.G:
            return []
        history = []
        for succ in self.G.successors(object_id_str):
            edge = self.G.edges[object_id_str, succ]
            if edge.get("relation") == "OBSERVED_AS":
                obs_data = self.G.nodes[succ]
                history.append({
                    "obs_id": succ,
                    "frame_index": obs_data.get("frame_index"),
                    "timestamp": obs_data.get("timestamp"),
                    "depth_m": obs_data.get("depth_m"),
                    "position_3d": obs_data.get("position_3d"),
                    "region": obs_data.get("region"),
                })
        return sorted(history, key=lambda x: x.get("timestamp", 0))

    def query_interactions(self, relation="HELD_BY"):
        """All edges of a given relation type."""
        results = []
        for u, v, d in self.G.edges(data=True):
            if d.get("relation") == relation:
                results.append({
                    "from": u,
                    "to": v,
                    "frame_index": self.G.nodes[u].get("frame_index"),
                    "timestamp": self.G.nodes[u].get("timestamp"),
                    **{k: v for k, v in d.items() if k != "relation"},
                })
        return results

    def get_interesting_frames(self, top_k=5):
        """Find frames with most spatial interactions (for VLM image selection)."""
        frame_scores = {}
        for u, v, d in self.G.edges(data=True):
            rel = d.get("relation", "")
            if rel in ("VERY_NEAR", "NEAR", "CONTACTING", "HELD_BY"):
                fi = self.G.nodes[u].get("frame_index")
                if fi is not None:
                    frame_scores[fi] = frame_scores.get(fi, 0) + 1
        ranked = sorted(frame_scores.items(), key=lambda x: x[1], reverse=True)
        return [fi for fi, _ in ranked[:top_k]]

    # ------------------------------------------------------------------
    # VLM serialization
    # ------------------------------------------------------------------

    def serialize_for_vlm(self, max_frames=30):
        """Structured text for VLM consumption."""
        frames = [(n, d) for n, d in self.G.nodes(data=True) if d.get("type") == "frame"]
        frames.sort(key=lambda x: x[1].get("timestamp", 0))

        # Sample evenly
        if len(frames) > max_frames:
            indices = np.linspace(0, len(frames) - 1, max_frames, dtype=int)
            frames = [frames[i] for i in indices]

        lines = []
        for frame_id, frame_data in frames:
            ts_str = frame_data.get("timestamp_str", "??:??")
            cam_pos = frame_data.get("camera_position")
            cam_str = f"[{cam_pos[0]:.2f}, {cam_pos[1]:.2f}, {cam_pos[2]:.2f}]" if cam_pos else "unknown"

            lines.append(f"[t={ts_str}] Camera at {cam_str}")

            # Get observations in this frame
            obs_in_frame = []
            for pred in self.G.predecessors(frame_id):
                if self.G.nodes[pred].get("type") == "observation":
                    obs_in_frame.append((pred, self.G.nodes[pred]))

            for obs_id, obs_data in obs_in_frame:
                label = obs_data.get("label", "?")
                depth = obs_data.get("depth_m", 0)
                pos = obs_data.get("position_3d", [0, 0, 0])
                pos_str = f"[{pos[0]:.1f}, {pos[1]:.1f}, {pos[2]:.1f}]"

                lines.append(f"  {obs_id.split('_f')[0]}: depth={depth:.1f}m, pos={pos_str}")

                # Relations from this observation
                for _, tgt, edata in self.G.out_edges(obs_id, data=True):
                    rel = edata.get("relation", "")
                    if rel in ("IN_FRAME", "OBSERVED_AS", "NEXT"):
                        continue
                    tgt_label = self.G.nodes[tgt].get("label", tgt)
                    dist = edata.get("distance_m", "")
                    dist_str = f" ({dist}m)" if dist else ""
                    lines.append(f"    -> {rel} {tgt_label}{dist_str}")

                # Incoming HELD_BY
                for src, _, edata in self.G.in_edges(obs_id, data=True):
                    if edata.get("relation") == "HELD_BY":
                        src_label = self.G.nodes[src].get("label", src)
                        lines.append(f"    -> HELD_BY {src_label}")

            lines.append("")

        return "\n".join(lines)

    # ------------------------------------------------------------------
    # Export for frontend
    # ------------------------------------------------------------------

    def to_frontend_json(self, max_nodes=2000):
        """Export graph as JSON for frontend visualization.

        Returns compact node/edge lists suitable for force-directed rendering.
        """
        # Only include tracked objects and their relations (skip observations for compactness)
        tracked = [(n, d) for n, d in self.G.nodes(data=True)
                    if d.get("type") == "tracked_object"]
        frames = [(n, d) for n, d in self.G.nodes(data=True)
                   if d.get("type") == "frame"]

        nodes = []
        for n, d in tracked:
            nodes.append({
                "id": n,
                "type": "object",
                "label": d.get("label", ""),
                "first_seen": d.get("first_seen", 0),
                "last_seen": d.get("last_seen", 0),
                "color": NODE_COLORS.get(d.get("label", ""), NODE_COLORS["default"]),
            })

        # Sample frames evenly
        frame_sample = frames
        if len(frames) > 50:
            idx = np.linspace(0, len(frames) - 1, 50, dtype=int)
            frame_sample = [frames[i] for i in idx]

        for n, d in frame_sample:
            nodes.append({
                "id": n,
                "type": "frame",
                "label": d.get("timestamp_str", ""),
                "timestamp": d.get("timestamp", 0),
                "camera_position": d.get("camera_position"),
                "color": NODE_COLORS["frame"],
            })

        node_ids = {n["id"] for n in nodes}

        # Edges: aggregate spatial relations between tracked objects
        edge_counts = {}  # (src_tracked, tgt_tracked, rel) -> count
        for u, v, d in self.G.edges(data=True):
            rel = d.get("relation", "")
            if rel in ("OBSERVED_AS", "IN_FRAME"):
                continue

            # Map observations back to tracked objects
            u_type = self.G.nodes[u].get("type")
            v_type = self.G.nodes[v].get("type")

            if u_type == "observation" and v_type == "observation":
                # Find tracked object parents
                u_tracked = None
                v_tracked = None
                for pred in self.G.predecessors(u):
                    if self.G.nodes[pred].get("type") == "tracked_object":
                        u_tracked = pred
                        break
                for pred in self.G.predecessors(v):
                    if self.G.nodes[pred].get("type") == "tracked_object":
                        v_tracked = pred
                        break
                if u_tracked and v_tracked and u_tracked != v_tracked:
                    key = (u_tracked, v_tracked, rel)
                    edge_counts[key] = edge_counts.get(key, 0) + 1

            elif rel == "NEXT" and u in node_ids and v in node_ids:
                key = (u, v, "NEXT")
                edge_counts[key] = edge_counts.get(key, 0) + 1

        edges = []
        for (src, tgt, rel), count in edge_counts.items():
            if src in node_ids and tgt in node_ids:
                edges.append({
                    "source": src,
                    "target": tgt,
                    "relation": rel,
                    "weight": count,
                    "color": EDGE_COLORS.get(rel, "#95a5a6"),
                })

        return {"nodes": nodes, "edges": edges}

    def stats(self):
        """Return graph statistics."""
        type_counts = {}
        for _, d in self.G.nodes(data=True):
            t = d.get("type", "unknown")
            type_counts[t] = type_counts.get(t, 0) + 1

        rel_counts = {}
        for _, _, d in self.G.edges(data=True):
            r = d.get("relation", "unknown")
            rel_counts[r] = rel_counts.get(r, 0) + 1

        return {
            "total_nodes": self.G.number_of_nodes(),
            "total_edges": self.G.number_of_edges(),
            "node_types": type_counts,
            "edge_types": rel_counts,
        }

    # ------------------------------------------------------------------
    # Interactive HTML visualization
    # ------------------------------------------------------------------

    def export_html(self, output_path, title="Ironsite Spatial Graph"):
        """Export interactive graph visualization as standalone HTML."""
        graph_data = self.to_frontend_json()
        stats = self.stats()

        html = _build_graph_html(graph_data, stats, title)
        with open(output_path, "w") as f:
            f.write(html)
        print(f"Saved {output_path}")

    def save_json(self, output_path):
        """Save graph data as JSON for the frontend."""
        data = self.to_frontend_json()
        data["stats"] = self.stats()
        with open(output_path, "w") as f:
            json.dump(data, f, indent=2, default=str)
        print(f"Saved {output_path}")


def _build_graph_html(graph_data, stats, title):
    """Build a standalone HTML page with vis.js force-directed graph."""
    nodes_json = json.dumps(graph_data["nodes"], default=str)
    edges_json = json.dumps(graph_data["edges"], default=str)
    stats_json = json.dumps(stats, default=str)

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>{title}</title>
<script src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  body {{ background: #0d1117; color: #c9d1d9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', monospace; }}
  #header {{ padding: 16px 24px; background: #161b22; border-bottom: 1px solid #30363d; display: flex; justify-content: space-between; align-items: center; }}
  #header h1 {{ font-size: 18px; color: #58a6ff; }}
  #stats {{ font-size: 12px; color: #8b949e; }}
  #stats span {{ color: #58a6ff; font-weight: bold; margin: 0 8px; }}
  #legend {{ position: absolute; top: 70px; right: 16px; background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 12px; font-size: 11px; z-index: 10; }}
  .legend-item {{ display: flex; align-items: center; gap: 8px; margin: 4px 0; }}
  .legend-dot {{ width: 10px; height: 10px; border-radius: 50%; }}
  .legend-line {{ width: 20px; height: 2px; }}
  #graph {{ width: 100%; height: calc(100vh - 56px); }}
  #tooltip {{ position: absolute; display: none; background: #1c2128; border: 1px solid #30363d; border-radius: 6px; padding: 10px 14px; font-size: 12px; max-width: 300px; z-index: 20; pointer-events: none; }}
  #tooltip .tt-label {{ color: #58a6ff; font-weight: bold; font-size: 14px; }}
  #tooltip .tt-row {{ margin: 3px 0; color: #8b949e; }}
</style>
</head>
<body>
<div id="header">
  <h1>{title}</h1>
  <div id="stats"></div>
</div>
<div id="legend"></div>
<div id="graph"></div>
<div id="tooltip"></div>

<script>
const rawNodes = {nodes_json};
const rawEdges = {edges_json};
const stats = {stats_json};

// Stats bar
document.getElementById('stats').innerHTML =
  '<span>' + stats.total_nodes + '</span> nodes' +
  '<span>' + stats.total_edges + '</span> edges' +
  '<span>' + (stats.node_types.tracked_object || 0) + '</span> objects' +
  '<span>' + (stats.node_types.frame || 0) + '</span> frames';

// Legend
const legendItems = [
  {{color: '#3498db', label: 'Frame', type: 'dot'}},
  {{color: '#2ecc71', label: 'Worker', type: 'dot'}},
  {{color: '#e67e22', label: 'Block', type: 'dot'}},
  {{color: '#f39c12', label: 'Safety Vest', type: 'dot'}},
  {{color: '#e74c3c', label: 'VERY_NEAR', type: 'line'}},
  {{color: '#f39c12', label: 'NEAR', type: 'line'}},
  {{color: '#2c3e50', label: 'NEXT (temporal)', type: 'line'}},
];
const legendEl = document.getElementById('legend');
legendItems.forEach(item => {{
  const div = document.createElement('div');
  div.className = 'legend-item';
  const shape = item.type === 'dot'
    ? '<div class="legend-dot" style="background:' + item.color + '"></div>'
    : '<div class="legend-line" style="background:' + item.color + '"></div>';
  div.innerHTML = shape + '<span>' + item.label + '</span>';
  legendEl.appendChild(div);
}});

// Build vis.js nodes
const visNodes = rawNodes.map(n => {{
  const isFrame = n.type === 'frame';
  return {{
    id: n.id,
    label: isFrame ? n.label : n.id.replace(/_/g, ' '),
    color: {{
      background: n.color,
      border: isFrame ? '#1a5276' : '#2c3e50',
      highlight: {{ background: '#fff', border: n.color }}
    }},
    shape: isFrame ? 'diamond' : 'dot',
    size: isFrame ? 8 : 15,
    font: {{ color: '#c9d1d9', size: isFrame ? 8 : 11 }},
    title: JSON.stringify(n, null, 2),
    _data: n
  }};
}});

// Build vis.js edges
const visEdges = rawEdges.map((e, i) => {{
  const isNext = e.relation === 'NEXT';
  return {{
    id: 'e' + i,
    from: e.source,
    to: e.target,
    color: {{ color: e.color, opacity: isNext ? 0.15 : 0.6 }},
    width: isNext ? 0.5 : Math.min(1 + Math.log2(e.weight + 1), 4),
    arrows: {{ to: {{ enabled: !isNext, scaleFactor: 0.4 }} }},
    title: e.relation + (e.weight > 1 ? ' (x' + e.weight + ')' : ''),
    smooth: {{ type: 'continuous' }},
    _data: e
  }};
}});

// Render
const container = document.getElementById('graph');
const data = {{ nodes: new vis.DataSet(visNodes), edges: new vis.DataSet(visEdges) }};
const options = {{
  physics: {{
    solver: 'forceAtlas2Based',
    forceAtlas2Based: {{ gravitationalConstant: -60, centralGravity: 0.008, springLength: 120, springConstant: 0.02, damping: 0.4 }},
    stabilization: {{ iterations: 200 }}
  }},
  interaction: {{ hover: true, tooltipDelay: 100, zoomSpeed: 0.5 }},
  layout: {{ improvedLayout: true }}
}};

const network = new vis.Network(container, data, options);

// Custom tooltip
const tooltip = document.getElementById('tooltip');
network.on('hoverNode', function(params) {{
  const nodeData = visNodes.find(n => n.id === params.node);
  if (!nodeData) return;
  const d = nodeData._data;
  let html = '<div class="tt-label">' + (d.label || d.id) + '</div>';
  if (d.type === 'frame') {{
    html += '<div class="tt-row">Frame at t=' + d.label + '</div>';
    if (d.camera_position) html += '<div class="tt-row">Camera: [' + d.camera_position.map(v => v.toFixed(2)).join(', ') + ']</div>';
  }} else {{
    html += '<div class="tt-row">Type: ' + d.type + '</div>';
    html += '<div class="tt-row">Seen: t=' + (d.first_seen||0).toFixed(1) + 's → ' + (d.last_seen||0).toFixed(1) + 's</div>';
  }}
  tooltip.innerHTML = html;
  tooltip.style.display = 'block';
  tooltip.style.left = params.event.center.x + 15 + 'px';
  tooltip.style.top = params.event.center.y + 15 + 'px';
}});
network.on('blurNode', () => {{ tooltip.style.display = 'none'; }});
network.on('dragStart', () => {{ tooltip.style.display = 'none'; }});
</script>
</body>
</html>"""

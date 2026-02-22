"""
FAISS-backed spatial memory store.
Enables fast queries like "find frames where person is within 2m of block".
"""

import os
import json
import uuid
import numpy as np
from collections import defaultdict
from datetime import datetime
from pathlib import Path

try:
    import faiss
    HAS_FAISS = True
except ImportError:
    HAS_FAISS = False
    print("WARNING: faiss not installed. Memory store will use brute-force search.")


class SpatialMemory:
    EMBED_DIM = 32

    def __init__(self, store_dir):
        os.makedirs(store_dir, exist_ok=True)
        self.jsonl = os.path.join(store_dir, "memory.jsonl")
        self.faiss_path = os.path.join(store_dir, "memory.faiss")
        self.meta_path = os.path.join(store_dir, "meta.json")
        self.id_map = []

        if HAS_FAISS:
            self.index = faiss.IndexFlatL2(self.EMBED_DIM)
        else:
            self.index = None

    def _embed(self, dets):
        """Create a compact embedding from detections for similarity search."""
        v = np.zeros(self.EMBED_DIM, dtype=np.float32)

        # Depth histogram (bins 0-12m)
        depths = [d["depth_m"] for d in dets if d.get("depth_m", 0) > 0]
        if depths:
            h, _ = np.histogram(depths, bins=16, range=(0, 12))
            v[:16] = h.astype(np.float32)

        # Class hash features
        for d in dets:
            v[(hash(d["label"]) % 8) + 16] += d.get("confidence", 1.0)

        # Position stats
        if dets:
            positions = [d["position_3d"] for d in dets if any(p != 0 for p in d["position_3d"])]
            if positions:
                pos = np.array(positions)
                v[24:27] = pos.mean(0).clip(-10, 10)
                v[27:30] = pos.std(0).clip(0, 10)

        # Normalize
        n = np.linalg.norm(v)
        if n > 0:
            v /= n
        return v

    def ingest(self, scene_graphs, video_path, image_data=None, img_to_points3d=None):
        """Ingest scene graphs into the memory store."""
        entries = []
        embs = []

        # Overwrite (not append) to avoid accumulating duplicates across re-runs
        with open(self.jsonl, "w") as f:
            for sg in scene_graphs:
                # Build detection list for embedding
                dets = sg["objects"]
                cam_pose = sg.get("camera_pose")

                entry = {
                    "entry_id": str(uuid.uuid4()),
                    "video_source": Path(video_path).stem,
                    "frame_idx": sg["original_frame"],
                    "timestamp_sec": sg["timestamp"],
                    "timestamp_str": sg["timestamp_str"],
                    "colmap_frame": sg.get("colmap_frame", ""),
                    "detections": dets,
                    "camera": {
                        "world_position": cam_pose["position"] if cam_pose else None,
                    },
                    "scene_summary": {
                        "n_objects": sg["num_objects"],
                        "labels": dict(defaultdict(int, {d["label"]: 1 for d in dets})),
                        "relations": sg["spatial_relations"],
                        "hand_state": sg["hand_state"],
                    },
                    "created_at": datetime.utcnow().isoformat(),
                }

                emb = self._embed(dets)
                entries.append(entry)
                embs.append(emb)
                self.id_map.append(entry["entry_id"])
                f.write(json.dumps(entry, default=str) + "\n")

        if self.index is not None and embs:
            self.index.add(np.stack(embs))

        print(f"Ingested {len(entries)} entries into spatial memory")
        return entries

    def save(self):
        if self.index is not None:
            faiss.write_index(self.index, self.faiss_path)
        with open(self.meta_path, "w") as f:
            json.dump({"id_map": self.id_map, "total": len(self.id_map)}, f)
        print(f"Memory saved ({len(self.id_map)} entries)")

    def _iter(self):
        if not os.path.exists(self.jsonl):
            return
        with open(self.jsonl) as f:
            for line in f:
                if line.strip():
                    yield json.loads(line)

    def query_label(self, label):
        """Find all frames containing objects with this label."""
        return [r for r in self._iter()
                if any(label.lower() in d["label"].lower() for d in r["detections"])]

    def query_depth_range(self, min_m, max_m, label=None):
        """Find frames where objects are within a depth range."""
        out = []
        for r in self._iter():
            for d in r["detections"]:
                if label and label.lower() not in d["label"].lower():
                    continue
                if min_m <= d.get("depth_m", 0) <= max_m:
                    out.append(r)
                    break
        return out

    def query_proximity(self, label_a, label_b, max_m=2.0):
        """Find frames where label_a is within max_m meters of label_b (3D distance)."""
        out = []
        for r in self._iter():
            da = [d for d in r["detections"] if label_a.lower() in d["label"].lower()]
            db = [d for d in r["detections"] if label_b.lower() in d["label"].lower()]
            for a in da:
                for b in db:
                    pa = np.array(a["position_3d"])
                    pb = np.array(b["position_3d"])
                    if np.all(pa == 0) or np.all(pb == 0):
                        continue
                    dist = float(np.linalg.norm(pa - pb))
                    if dist <= max_m:
                        out.append({**r, "_dist": round(dist, 3)})
                        break
        return out

    def stats(self):
        sz = os.path.getsize(self.jsonl) if os.path.exists(self.jsonl) else 0
        n = self.index.ntotal if self.index else len(self.id_map)
        return {"entries": n, "size_kb": round(sz / 1024, 1)}

# IronVision

**Spatial Intelligence for Construction Sites**

IronVision turns standard body-cam footage into a structured 3D intelligence layer for construction sites. Upload a video, and a 9-stage AI pipeline automatically detects workers, tools, and PPE, reconstructs the scene in 3D, builds a spatial knowledge graph, and delivers real-time productivity and safety reports.

No sensors. No hardware. Just one camera.

---

## Architecture

```
Body-Cam Video
     │
     ▼
┌─────────────────────────────────────────────────────┐
│  1. Preprocess     Fisheye undistort + keyframes     │
│  2. DINO           Open-vocab object detection       │
│  3. SAM2           Pixel-perfect tracking             │
│  4. VGGT-X         Metric depth + 3D reconstruction  │
│  5. Scene Graphs   Per-frame structured 3D scenes    │
│  6. Spatial Graph  NetworkX knowledge graph           │
│  7. Event Engine   Activity + PPE + performance       │
│  8. FAISS Memory   Queryable spatial index            │
│  9. VLM Narrator   Grok-powered site report           │
└─────────────────────────────────────────────────────┘
     │
     ▼
  React Dashboard (real-time WebSocket updates)
```

### Pipeline Steps

| # | Step | What it does |
|---|------|-------------|
| 1 | **Preprocess** | Fisheye lens undistortion, adaptive keyframe extraction |
| 2 | **Grounding DINO** | Zero-shot object detection — detects workers, blocks, tools, PPE without a fixed class list |
| 3 | **SAM2 Tracking** | Propagates detections across frames with segmentation masks |
| 4 | **3D Reconstruction** | Reverse-engineered VGGT-X to extract metric depth maps, camera poses, and dense point clouds from a single moving camera |
| 5 | **Scene Graphs** | Per-frame structured representations fusing detections with 3D coordinates, spatial relations, and hand state |
| 6 | **Spatial Graph** | NetworkX graph encoding object relationships, proximity, and temporal co-occurrence |
| 7 | **Event Engine** | Rule-based activity classification (production/prep/downtime/standby), PPE auditing, performance scoring |
| 8 | **Spatial Memory** | FAISS vector indexing for sub-millisecond spatial queries ("find all frames where hand is within 1m of tool") |
| 9 | **VLM Narrator** | Optional Grok AI synthesis into a human-readable site intelligence report |

All steps support **pickle-based caching** — re-runs with the same video skip completed steps instantly.

---

## Tech Stack

### Backend
- **FastAPI** + WebSocket for real-time progress broadcasting
- **PyTorch** + **Transformers** for model inference
- **Grounding DINO** (IDEA-Research) for open-vocabulary detection
- **SAM2** (Meta) for video object segmentation
- **VGGT-X** for monocular 3D reconstruction (reverse-engineered for depth extraction)
- **FastVGGT** with token merging for ~4x speedup
- **NetworkX** for spatial knowledge graphs
- **FAISS** for vector-indexed spatial memory
- **OpenAI-compatible API** (Grok) for VLM reasoning

### Frontend
- **React 19** + **TypeScript** + **Vite**
- **Three.js** (React Three Fiber + Drei) for 3D point cloud and trajectory visualization
- **Recharts** for analytics charts
- **Framer Motion** for animations
- **Zustand** for state management
- **Tailwind CSS 4** for styling
- **Lucide React** for icons

---

## Getting Started

### Prerequisites

- Python 3.10+
- Node.js 18+
- CUDA-capable GPU (recommended for real-time inference)

### Installation

```bash
# Clone the repo
git clone https://github.com/RohanChintakindi/ironsite-spatial.git
cd ironsite-spatial

# Install Python dependencies
pip install -r requirements.txt
pip install -r backend/requirements.txt

# Install frontend dependencies
cd frontend
npm install
cd ..
```

### Running

**Backend** (port 8000):
```bash
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

**Frontend** (port 5173):
```bash
cd frontend
npm run dev
```

Open `http://localhost:5173` in your browser. Upload a body-cam video and watch the pipeline process it in real-time.

### Configuration

Edit `config.py` to tune:

| Setting | Default | Description |
|---------|---------|-------------|
| `KEYFRAME_INTERVAL` | 10 | Extract every Nth frame |
| `MAX_FRAMES` | 0 | Max keyframes (0 = unlimited) |
| `DETECTION_THRESHOLD` | 0.20 | Grounding DINO confidence threshold |
| `FISHEYE_BALANCE` | 0.5 | Fisheye undistortion strength |
| `FASTVGGT_MERGING` | 6 | Token merge level (higher = faster, less accurate) |
| `NEAR_THRESHOLD` | 1.0m | Scene graph "near" spatial relation |
| `FAR_THRESHOLD` | 3.0m | Scene graph "far" spatial relation |

---

## Project Structure

```
ironsite-spatial/
├── backend/
│   ├── main.py              # FastAPI app + WebSocket
│   ├── routers/
│   │   ├── pipeline.py      # Upload, run, status endpoints
│   │   ├── results.py       # Frame, detection, VLM endpoints
│   │   └── memory.py        # Spatial memory query endpoint
│   └── services/
│       ├── runner.py         # Pipeline orchestrator
│       └── serializer.py     # JPEG/binary serialization
├── frontend/
│   └── src/
│       ├── api/              # API client + types
│       ├── components/
│       │   ├── chapters/     # Pipeline step chapters
│       │   ├── layout/       # Header, Sidebar, Chapter wrapper
│       │   ├── upload/       # Video upload form
│       │   ├── ui/           # StatusBadge, AnimatedNumber, ProgressRing
│       │   └── viz/          # 3D viewer, Dashboard, QueryPanel
│       ├── hooks/            # usePipelineWs, useStepData
│       └── store/            # Zustand pipeline store
├── utils/
│   ├── preprocess.py         # Fisheye undistort + keyframe extraction
│   ├── detection.py          # DINO + SAM2 inference
│   ├── depth.py              # VGGT-X 3D reconstruction
│   ├── scene_graph.py        # Scene graph builder
│   ├── graph.py              # NetworkX spatial graph
│   ├── events.py             # Event engine
│   ├── memory.py             # FAISS spatial memory
│   └── vlm.py                # Grok VLM narrator
└── config.py                 # All pipeline configuration
```

---

## Features

- **Single-camera 3D reconstruction** — no LiDAR, depth sensors, or multi-camera rigs
- **Open-vocabulary detection** — detects any object class via natural language prompts
- **Real-time WebSocket updates** — each pipeline stage unlocks a new dashboard chapter as it completes
- **Spatial queries** — "find all frames where a hand was within 1m of a tool" via FAISS
- **PPE compliance scoring** — automatic vest, helmet, and gloves detection per frame
- **Activity classification** — production, prep, downtime, standby with efficiency scoring
- **Interactive 3D viewer** — point cloud + camera trajectory rendered in Three.js
- **Pickle caching** — re-runs with the same video skip all cached steps

---

## License

MIT

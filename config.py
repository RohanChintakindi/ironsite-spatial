"""
Configuration for the Ironsite Spatial Awareness Pipeline.
"""

# --- Video Preprocessing ---
KEYFRAME_INTERVAL = 10  # Extract every Nth frame (10 = ~1.5s at 15fps)
MAX_FRAMES = 0          # 0 = no cap, otherwise limit keyframes

# Fisheye undistortion parameters (estimated for body cam barrel distortion)
FISHEYE_K_SCALE = 0.8
FISHEYE_D = [-0.3, 0.1, 0.0, 0.0]
FISHEYE_BALANCE = 0.5

# --- Grounded SAM 2 ---
GDINO_MODEL_ID = "IDEA-Research/grounding-dino-base"
TEXT_PROMPT = (
    "person . worker . concrete block . cinder block . brick . rebar . "
    "trowel . bucket . hard hat . safety helmet . safety vest . "
    "gloves . gloved hand . work gloves . scaffolding . crane . "
    "mortar . pipe . wall . ladder . wheelbarrow . machinery"
)
DETECTION_THRESHOLD = 0.25
REDETECT_EVERY = 50

# SAM2 model config
SAM2_CHECKPOINT = "Grounded-SAM-2/checkpoints/sam2.1_hiera_small.pt"
SAM2_CONFIG = "configs/sam2.1/sam2.1_hiera_s.yaml"

# --- Analytic Taxonomy ---
# Maps noisy detection labels to clean analytic categories
ANALYTIC_TAXONOMY = {
    "head protection": ["hard hat", "safety helmet", "hat"],
    "hand protection": ["gloves", "gloved hand", "work gloves", "glove"],
    "concrete block":  ["cinder block", "concrete block", "brick"],
    "worker":          ["person", "worker"],
}
LABEL_TO_ANALYTIC = {}
for _analytic, _fine_labels in ANALYTIC_TAXONOMY.items():
    for _fl in _fine_labels:
        LABEL_TO_ANALYTIC[_fl.lower()] = _analytic

# --- VGGT-X ---
VGGTX_DIR = "VGGT-X"
VGGTX_CHUNK_SIZE = 512   # reduce to 128-256 if OOM
VGGTX_MAX_QUERY_PTS = 2048
VGGTX_SHARED_CAMERA = True
VGGTX_USE_GA = True       # global alignment — consistent world coords
VGGTX_SAVE_DEPTH = True

# --- Scene Graph ---
NEAR_THRESHOLD = 1.0  # meters
FAR_THRESHOLD = 3.0
HAND_OVERLAP_THRESHOLD = 0.2
HAND_DEPTH_THRESHOLD = 0.5
DIRECTION_THRESHOLD_X = 50  # pixels
DIRECTION_THRESHOLD_Y = 30

# --- VLM Reasoning ---
GROK_MODEL = "grok-3-fast"
GROK_BASE_URL = "https://api.x.ai/v1"
VLM_NUM_SAMPLES = 30
VLM_TEMPERATURE = 0.3
VLM_MAX_TOKENS = 4000

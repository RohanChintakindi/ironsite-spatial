"""
Configuration for the Ironsite Spatial Awareness Pipeline.
"""

# --- Video Preprocessing ---
KEYFRAME_INTERVAL = 30  # Extract every Nth frame (30 = ~2s at 15fps, ~64 frames)
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
TRACK_CHUNK_SIZE = 500  # frames per SAM2 tracking chunk

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

# --- FastVGGT ---
FASTVGGT_MERGING = 0       # token merging off (merging has input size constraints)
FASTVGGT_MERGE_RATIO = 0.9 # how aggressively to merge tokens (0.9 = 4x speedup)
FASTVGGT_DEPTH_CONF = 3.0  # depth confidence threshold
FASTVGGT_MAX_POINTS = 100000

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

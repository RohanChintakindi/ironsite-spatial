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
TEXT_PROMPT = (
    "person . concrete block . cinder block . rebar . trowel . bucket . "
    "hard hat . safety vest . gloved hand . scaffolding . crane . "
    "mortar . pipe . wall . ladder . wheelbarrow"
)
DETECTION_THRESHOLD = 0.3
REDETECT_EVERY = 50
TRACK_CHUNK_SIZE = 100  # frames per SAM2 tracking chunk (prevents OOM)

# SAM2 model config
SAM2_CHECKPOINT = "Grounded-SAM-2/checkpoints/sam2.1_hiera_small.pt"
SAM2_CONFIG = "configs/sam2.1/sam2.1_hiera_s.yaml"

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

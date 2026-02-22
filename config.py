"""
Configuration for the Ironsite Spatial Awareness Pipeline.
"""

# --- Video Preprocessing ---
KEYFRAME_INTERVAL = 10  # Extract every Nth frame (10 = ~1.5s at 15fps)

# Fisheye undistortion parameters (estimated for body cam barrel distortion)
FISHEYE_K_SCALE = 0.8  # Focal length scale factor
FISHEYE_D = [-0.3, 0.1, 0.0, 0.0]  # Distortion coefficients
FISHEYE_BALANCE = 0.5  # Undistortion balance (0=full crop, 1=full view)

# --- Grounded SAM 2 ---
TEXT_PROMPT = (
    "person . concrete block . cinder block . rebar . trowel . bucket . "
    "hard hat . safety vest . gloved hand . scaffolding . crane . "
    "mortar . pipe . wall . ladder . wheelbarrow"
)
DETECTION_THRESHOLD = 0.3
REDETECT_EVERY = 50  # Re-run Grounding DINO every N keyframes for new objects

# SAM2 model config
SAM2_CHECKPOINT = "Grounded-SAM-2/checkpoints/sam2.1_hiera_small.pt"
SAM2_CONFIG = "configs/sam2.1/sam2.1_hiera_s.yaml"

# --- VGGT ---
VGGT_MODEL = "facebook/VGGT-1B"
VGGT_CHUNK_SIZE = 20  # Frames per chunk (increase for more VRAM)

# --- Scene Graph ---
NEAR_THRESHOLD = 1.0  # meters
FAR_THRESHOLD = 3.0   # meters
HAND_OVERLAP_THRESHOLD = 0.2  # bbox overlap ratio for hand-object contact
HAND_DEPTH_THRESHOLD = 0.5    # meters, max depth diff for hand-object contact
DIRECTION_THRESHOLD_X = 50    # pixels
DIRECTION_THRESHOLD_Y = 30    # pixels

# --- VLM Reasoning ---
GROK_MODEL = "grok-3-fast"
GROK_BASE_URL = "https://api.x.ai/v1"
VLM_NUM_SAMPLES = 30  # Scene graphs to sample for VLM analysis
VLM_TEMPERATURE = 0.3
VLM_MAX_TOKENS = 4000

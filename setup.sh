#!/bin/bash
# ============================================
# Ironsite Spatial Pipeline — Setup Script
# Run once on a fresh GPU instance (Vast.ai, etc.)
# ============================================
set -e

echo "=== Installing Python dependencies ==="
pip install -q torch torchvision torchaudio
pip install -q transformers supervision opencv-python-headless numpy plotly matplotlib
pip install -q huggingface_hub openai scipy Pillow
pip install -q pycolmap
pip install -q faiss-gpu 2>/dev/null || pip install -q faiss-cpu
pip install -q einops safetensors trimesh

echo "=== Installing Grounded SAM 2 ==="
if [ ! -d "Grounded-SAM-2" ]; then
    git clone https://github.com/IDEA-Research/Grounded-SAM-2.git
    cd Grounded-SAM-2
    SAM2_BUILD_CUDA=0 pip install -e ".[notebooks]" -q
    cd checkpoints && bash download_ckpts.sh && cd ..
    cd ..
else
    echo "Grounded-SAM-2 already installed"
fi

echo "=== Installing VGGT-X (metric depth via global alignment) ==="
if [ ! -d "VGGT-X" ]; then
    git clone --recursive https://github.com/Linketic/VGGT-X.git
    pip install -q -r VGGT-X/requirements.txt
else
    echo "VGGT-X already installed"
fi

echo "=== Installing FastVGGT ==="
if [ ! -d "FastVGGT" ]; then
    git clone https://github.com/mystorm16/FastVGGT.git
    pip install -q -r FastVGGT/requirements.txt
else
    echo "FastVGGT already installed"
fi

echo "=== Downloading VGGT checkpoint ==="
if [ ! -f "FastVGGT/model_tracker_fixed_e20.pt" ]; then
    python -c "
from huggingface_hub import hf_hub_download
hf_hub_download(
    repo_id='facebook/VGGT_tracker_fixed',
    filename='model_tracker_fixed_e20.pt',
    local_dir='FastVGGT',
)
print('Checkpoint downloaded!')
"
else
    echo "VGGT checkpoint already exists"
fi

echo "=== GPU Check ==="
python -c "
import torch
if torch.cuda.is_available():
    name = torch.cuda.get_device_name(0)
    vram = torch.cuda.get_device_properties(0).total_memory / 1e9
    bf16 = torch.cuda.is_bf16_supported()
    print(f'GPU: {name} | VRAM: {vram:.1f} GB | BF16: {bf16}')
else:
    print('WARNING: No GPU detected!')
print(f'PyTorch: {torch.__version__}')
"

echo "=== Setup complete! ==="
echo "Usage: python pipeline.py --video path/to/video.mp4"

#!/bin/bash
# ============================================
# Ironsite Spatial Pipeline — Setup Script
# Run this once on a fresh GPU instance (Vast.ai, Colab, etc.)
# ============================================
set -e

echo "=== Installing Python dependencies ==="
pip install -q torch torchvision torchaudio
pip install -q transformers supervision opencv-python-headless numpy plotly matplotlib huggingface_hub openai scipy Pillow

echo "=== Installing Grounded SAM 2 ==="
if [ ! -d "Grounded-SAM-2" ]; then
    git clone https://github.com/IDEA-Research/Grounded-SAM-2.git
    cd Grounded-SAM-2
    SAM2_BUILD_CUDA=0 pip install -e ".[notebooks]" -q
    # Grounding DINO loaded from HuggingFace Transformers (no CUDA build needed)
    cd checkpoints && bash download_ckpts.sh && cd ..
    cd ..
else
    echo "Grounded-SAM-2 already installed"
fi

echo "=== Installing VGGT ==="
pip install -q vggt

echo "=== GPU Check ==="
python -c "
import torch
if torch.cuda.is_available():
    name = torch.cuda.get_device_name(0)
    vram = torch.cuda.get_device_properties(0).total_mem / 1e9
    bf16 = torch.cuda.is_bf16_supported()
    print(f'GPU: {name} | VRAM: {vram:.1f} GB | BF16: {bf16}')
else:
    print('WARNING: No GPU detected!')
print(f'PyTorch: {torch.__version__}')
"

echo "=== Setup complete! ==="
echo "Usage: python pipeline.py --video path/to/video.mp4"

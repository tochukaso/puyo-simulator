# Python training environment (Phase 5a)

## Setup

    cd python
    python3.11 -m venv .venv
    source .venv/bin/activate
    pip install -r requirements.txt

## Test

    pytest

## Train

    python train.py --data ../data/selfplay --out checkpoints/policy-v1.pt

## Export to TF.js

    python -m puyo_train.export --ckpt checkpoints/policy-v1.pt --out ../public/models/policy-v1

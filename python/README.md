# Python training environment (Phase 5a)

## Setup

    cd python
    python3.11 -m venv .venv
    source .venv/bin/activate
    pip install -r requirements.txt

`requirements.txt` と `pip.conf` は [Takumi Guard](https://flatt.tech/takumi/features/guard)
のプロキシ (`https://pypi.flatt.tech/simple/`) を `index-url` に指定しているため、
インストール時に既知の悪性パッケージは自動でブロックされます。

## Test

    pytest

## Train

    python train.py --data ../data/selfplay --out checkpoints/policy-v1.pt

## Export to TF.js

    python -m puyo_train.export --ckpt checkpoints/policy-v1.pt --out ../public/models/policy-v1

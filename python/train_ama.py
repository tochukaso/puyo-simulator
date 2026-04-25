from __future__ import annotations

import argparse
from pathlib import Path

from puyo_train.distill import run_distillation


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--data", type=Path, default=Path("../data/ama-selfplay"))
    p.add_argument("--out", type=Path, default=Path("checkpoints/policy-ama-v1.pt"))
    p.add_argument("--epochs", type=int, default=30)
    p.add_argument("--batch", type=int, default=256)
    p.add_argument("--lr", type=float, default=1e-3)
    p.add_argument("--val", type=float, default=0.1)
    p.add_argument("--device", type=str, default="mps")
    p.add_argument("--temperature", type=float, default=100.0)
    args = p.parse_args()

    run_distillation(
        data_dir=args.data,
        out_path=args.out,
        epochs=args.epochs,
        batch_size=args.batch,
        lr=args.lr,
        device=args.device,
        val_fraction=args.val,
        temperature=args.temperature,
    )


if __name__ == "__main__":
    main()

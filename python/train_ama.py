from __future__ import annotations

import argparse
from pathlib import Path

from puyo_train.distill import run_distillation


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--data", type=Path, default=Path("../data/ama-selfplay"))
    p.add_argument("--out", type=Path, default=Path("checkpoints/policy-ama-v2.pt"))
    p.add_argument("--epochs", type=int, default=30)
    p.add_argument("--batch", type=int, default=256)
    p.add_argument("--lr", type=float, default=1e-3)
    p.add_argument("--val", type=float, default=0.1)
    p.add_argument("--device", type=str, default="mps")
    p.add_argument("--temperature", type=float, default=20.0)
    p.add_argument("--no-augment", action="store_true")
    p.add_argument(
        "--value-source",
        choices=["final_score", "topk_score"],
        default="final_score",
    )
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
        augment=not args.no_augment,
        value_source=args.value_source,
    )


if __name__ == "__main__":
    main()

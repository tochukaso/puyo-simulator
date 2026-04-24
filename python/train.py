from __future__ import annotations

import argparse
import random
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import DataLoader, Subset

from puyo_train.dataset import load_all
from puyo_train.model import PolicyValueNet


@dataclass
class EpochStat:
    epoch: int
    train_loss: float
    val_loss: float
    val_top1: float


def run_training(
    *,
    data_dir: Path,
    out_path: Path,
    epochs: int,
    batch_size: int,
    lr: float,
    device: str,
    val_fraction: float,
    seed: int = 0,
    alpha: float = 1.0,
) -> list[dict]:
    torch.manual_seed(seed)
    random.seed(seed)
    np.random.seed(seed)

    ds = load_all(data_dir)
    n = len(ds)
    idx = list(range(n))
    random.shuffle(idx)
    split = max(1, int(n * (1.0 - val_fraction)))
    train_ds = Subset(ds, idx[:split])
    val_ds = Subset(ds, idx[split:]) if split < n else Subset(ds, idx[:1])

    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True)
    val_loader = DataLoader(val_ds, batch_size=batch_size, shuffle=False)

    net = PolicyValueNet().to(device)
    opt = torch.optim.Adam(net.parameters(), lr=lr, weight_decay=1e-4)

    history: list[EpochStat] = []
    best_val = float("inf")
    for epoch in range(epochs):
        net.train()
        tr_losses: list[float] = []
        for board, queue, action, value in train_loader:
            board = board.to(device)
            queue = queue.to(device)
            action = action.to(device)
            value = value.to(device)
            opt.zero_grad()
            p_logits, v_pred = net(board, queue)
            l_p = torch.nn.functional.cross_entropy(p_logits, action)
            l_v = torch.nn.functional.mse_loss(v_pred, value)
            loss = l_p + alpha * l_v
            loss.backward()
            opt.step()
            tr_losses.append(float(loss.item()))

        net.eval()
        v_losses: list[float] = []
        top1_correct = 0
        top1_total = 0
        with torch.no_grad():
            for board, queue, action, value in val_loader:
                board = board.to(device)
                queue = queue.to(device)
                action = action.to(device)
                value = value.to(device)
                p_logits, v_pred = net(board, queue)
                l_p = torch.nn.functional.cross_entropy(p_logits, action)
                l_v = torch.nn.functional.mse_loss(v_pred, value)
                v_losses.append(float((l_p + alpha * l_v).item()))
                pred = p_logits.argmax(dim=1)
                top1_correct += int((pred == action).sum().item())
                top1_total += int(action.numel())

        stat = EpochStat(
            epoch=epoch,
            train_loss=sum(tr_losses) / max(1, len(tr_losses)),
            val_loss=sum(v_losses) / max(1, len(v_losses)),
            val_top1=top1_correct / max(1, top1_total),
        )
        history.append(stat)
        print(
            f"epoch={stat.epoch} train={stat.train_loss:.4f} "
            f"val={stat.val_loss:.4f} top1={stat.val_top1:.3f}"
        )

        if stat.val_loss < best_val:
            best_val = stat.val_loss
            out_path.parent.mkdir(parents=True, exist_ok=True)
            torch.save(net.state_dict(), out_path)

    return [h.__dict__ for h in history]


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--data", type=Path, default=Path("../data/selfplay"))
    p.add_argument("--out", type=Path, default=Path("checkpoints/policy-v1.pt"))
    p.add_argument("--epochs", type=int, default=30)
    p.add_argument("--batch", type=int, default=256)
    p.add_argument("--lr", type=float, default=1e-3)
    p.add_argument("--val", type=float, default=0.1)
    p.add_argument("--device", type=str, default="mps")
    args = p.parse_args()

    run_training(
        data_dir=args.data,
        out_path=args.out,
        epochs=args.epochs,
        batch_size=args.batch,
        lr=args.lr,
        device=args.device,
        val_fraction=args.val,
    )


if __name__ == "__main__":
    main()

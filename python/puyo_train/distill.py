from __future__ import annotations

import random
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import DataLoader, Subset

from .dataset_ama import load_all
from .model_v2 import PolicyValueNetV2


@dataclass
class EpochStat:
    epoch: int
    train_loss: float
    val_loss: float
    val_top1: float


def _soft_cross_entropy(logits: torch.Tensor, target: torch.Tensor) -> torch.Tensor:
    log_p = torch.log_softmax(logits, dim=1)
    return -(target * log_p).sum(dim=1).mean()


def run_distillation(
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
    temperature: float = 100.0,
) -> list[dict]:
    torch.manual_seed(seed)
    random.seed(seed)
    np.random.seed(seed)

    ds = load_all(data_dir, temperature=temperature)
    n = len(ds)
    idx = list(range(n))
    random.shuffle(idx)
    split = max(1, int(n * (1.0 - val_fraction)))
    train_ds = Subset(ds, idx[:split])
    val_ds = Subset(ds, idx[split:]) if split < n else Subset(ds, idx[:1])

    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True)
    val_loader = DataLoader(val_ds, batch_size=batch_size, shuffle=False)

    net = PolicyValueNetV2().to(device)
    opt = torch.optim.Adam(net.parameters(), lr=lr, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=epochs)

    history: list[EpochStat] = []
    best_val = float("inf")
    for epoch in range(epochs):
        net.train()
        tr_losses: list[float] = []
        for board, queue, policy_target, value_target in train_loader:
            board = board.to(device); queue = queue.to(device)
            policy_target = policy_target.to(device); value_target = value_target.to(device)
            opt.zero_grad()
            p_logits, v_pred = net(board, queue)
            l_p = _soft_cross_entropy(p_logits, policy_target)
            l_v = torch.nn.functional.mse_loss(v_pred, value_target)
            loss = l_p + alpha * l_v
            loss.backward()
            opt.step()
            tr_losses.append(float(loss.item()))
        sched.step()

        net.eval()
        v_losses: list[float] = []
        top1_correct = 0; top1_total = 0
        with torch.no_grad():
            for board, queue, policy_target, value_target in val_loader:
                board = board.to(device); queue = queue.to(device)
                policy_target = policy_target.to(device); value_target = value_target.to(device)
                p_logits, v_pred = net(board, queue)
                l_p = _soft_cross_entropy(p_logits, policy_target)
                l_v = torch.nn.functional.mse_loss(v_pred, value_target)
                v_losses.append(float((l_p + alpha * l_v).item()))
                pred = p_logits.argmax(dim=1)
                gold = policy_target.argmax(dim=1)
                top1_correct += int((pred == gold).sum().item())
                top1_total += int(gold.numel())

        stat = EpochStat(
            epoch=epoch,
            train_loss=sum(tr_losses) / max(1, len(tr_losses)),
            val_loss=sum(v_losses) / max(1, len(v_losses)),
            val_top1=top1_correct / max(1, top1_total),
        )
        history.append(stat)
        print(f"epoch={stat.epoch} train={stat.train_loss:.4f} val={stat.val_loss:.4f} top1={stat.val_top1:.3f}")

        if stat.val_loss < best_val:
            best_val = stat.val_loss
            out_path.parent.mkdir(parents=True, exist_ok=True)
            torch.save(net.state_dict(), out_path)

    return [h.__dict__ for h in history]

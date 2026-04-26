"""Dataset for ama distillation: reads JSONL with top-K teacher candidates,
returns (board, queue, soft_policy, value_target) tensors."""
from __future__ import annotations

import json
import math
import random
from itertools import permutations
from pathlib import Path
from typing import Sequence

import numpy as np
import torch
from torch.utils.data import Dataset

from .action import move_to_action_index
from .augmentation import apply_lr_flip, apply_color_permutation
from .encoding import encode_state

VALUE_SCALE = 50000.0


def value_target_from_score(score: float) -> float:
    return float(math.tanh(score / VALUE_SCALE))


def make_soft_policy(
    scores: Sequence[float],
    indices: Sequence[int],
    temperature: float = 100.0,
) -> np.ndarray:
    p = np.zeros(22, dtype=np.float32)
    s = np.array(scores, dtype=np.float32)
    s = (s - s.max()) / max(temperature, 1e-3)
    e = np.exp(s)
    e /= e.sum()
    for idx, prob in zip(indices, e):
        p[idx] = prob
    return p


def _row_to_state(row: dict) -> dict:
    field_rows = row["field"]
    field = []
    for r in range(13):
        row_chars = field_rows[r]
        row_cells = []
        for c in range(6):
            ch = row_chars[c]
            row_cells.append(ch if ch in ("R", "B", "Y", "P") else None)
        field.append(row_cells)
    return {
        "field": field,
        "current": {
            "axis": row["current_axis"],
            "child": row["current_child"],
            "axisRow": 1, "axisCol": 2, "rotation": 0,
        },
        "next_queue": [
            {"axis": row["next1_axis"], "child": row["next1_child"]},
            {"axis": row["next2_axis"], "child": row["next2_child"]},
        ],
    }


class AmaDataset(Dataset):
    def __init__(self, files: list[Path], temperature: float = 100.0, augment: bool = False):
        rows: list[dict] = []
        skipped = 0
        for f in files:
            with open(f) as fp:
                for line in fp:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        rows.append(json.loads(line))
                    except json.JSONDecodeError:
                        skipped += 1
        if skipped:
            print(f"AmaDataset: skipped {skipped} malformed lines")
        self.rows = rows
        self.temperature = temperature
        self.augment = augment

    def __len__(self) -> int:
        return len(self.rows)

    def __getitem__(self, idx: int):
        row = self.rows[idx]
        state = _row_to_state(row)
        board, queue, _ = encode_state(state)
        topk = row["topk"]
        scores = [c["score"] for c in topk]
        indices = [move_to_action_index(c["axisCol"], c["rotation"]) for c in topk]
        soft_policy = make_soft_policy(scores, indices, self.temperature)
        value = value_target_from_score(float(row.get("final_score", 0.0)))
        if self.augment:
            if random.random() < 0.5:
                board, queue, soft_policy = apply_lr_flip(board, queue, soft_policy)
            perm = random.choice(list(permutations((0, 1, 2, 3))))
            board, queue, soft_policy = apply_color_permutation(board, queue, soft_policy, perm)
        return (
            torch.from_numpy(board),
            torch.from_numpy(queue),
            torch.from_numpy(soft_policy),
            torch.tensor(value, dtype=torch.float32),
        )


def load_all(data_dir: Path, temperature: float = 100.0, augment: bool = False) -> AmaDataset:
    files = sorted(Path(data_dir).glob("*.jsonl"))
    if not files:
        raise FileNotFoundError(f"no JSONL files in {data_dir}")
    return AmaDataset(files, temperature=temperature, augment=augment)

"""Dataset for ama distillation: reads JSONL with top-K teacher candidates,
returns (board, queue, soft_policy, value_target) tensors."""
from __future__ import annotations

import json
import math
import random
from itertools import permutations
from pathlib import Path
from typing import Literal, Sequence

import numpy as np
import torch
from torch.utils.data import Dataset

from .action import move_to_action_index
from .augmentation import apply_lr_flip, apply_color_permutation
from .encoding import encode_state

VALUE_SCALE = 50000.0
VALUE_SCALE_TOPK = 200000.0
_COLOR_PERMS = list(permutations((0, 1, 2, 3)))


def value_target_from_score(score: float, scale: float = VALUE_SCALE) -> float:
    return float(math.tanh(score / scale))


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
    """Dataset for ama distillation with optional augmentation and value-source switch.

    Args:
        files: list of JSONL paths to read.
        temperature: soft-policy temperature for top-K teacher candidates.
        augment: when True, apply random LR-flip + color permutation per sample.
        value_source: 'final_score' (default, v2 reproducibility) uses the
            per-game final score; 'topk_score' (v3) uses the per-position ama
            beam search top1 score with scale=200000.
    """

    def __init__(
        self,
        files: list[Path],
        temperature: float = 100.0,
        augment: bool = False,
        value_source: Literal["final_score", "topk_score"] = "final_score",
    ):
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
        if value_source not in ("final_score", "topk_score"):
            raise ValueError(
                f"value_source must be 'final_score' or 'topk_score', got {value_source!r}"
            )
        self.value_source = value_source

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
        if self.value_source == "topk_score":
            top_score = float(topk[0].get("score", 0.0)) if topk else 0.0
            value = value_target_from_score(top_score, scale=VALUE_SCALE_TOPK)
        else:
            value = value_target_from_score(float(row.get("final_score", 0.0)))
        if self.augment:
            if random.random() < 0.5:
                board, queue, soft_policy = apply_lr_flip(board, queue, soft_policy)
            perm = random.choice(_COLOR_PERMS)
            board, queue, soft_policy = apply_color_permutation(board, queue, soft_policy, perm)
        return (
            torch.from_numpy(board),
            torch.from_numpy(queue),
            torch.from_numpy(soft_policy),
            torch.tensor(value, dtype=torch.float32),
        )


def load_all(
    data_dir: Path,
    temperature: float = 100.0,
    augment: bool = False,
    value_source: Literal["final_score", "topk_score"] = "final_score",
) -> AmaDataset:
    """Load all JSONL files from a directory and return an AmaDataset.

    Args:
        data_dir: directory containing JSONL files.
        temperature: soft-policy temperature for top-K teacher candidates.
        augment: when True, apply random LR-flip + color permutation per sample.
        value_source: 'final_score' (default, v2 reproducibility) uses the
            per-game final score; 'topk_score' (v3) uses the per-position ama
            beam search top1 score with scale=200000.

    Raises:
        FileNotFoundError: if no JSONL files are found in data_dir.
    """
    files = sorted(Path(data_dir).glob("*.jsonl"))
    if not files:
        raise FileNotFoundError(f"no JSONL files in {data_dir}")
    return AmaDataset(files, temperature=temperature, augment=augment, value_source=value_source)

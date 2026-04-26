import json
from pathlib import Path

import numpy as np
import torch

from puyo_train.dataset_ama import (
    AmaDataset,
    make_soft_policy,
    value_target_from_score,
)


def _row(game_id=0, move_index=0, action_top1=2, score=18000, chain=4):
    field = [["." for _ in range(6)] for _ in range(13)]
    return {
        "game_id": game_id,
        "move_index": move_index,
        "field": ["".join(row) for row in field],
        "current_axis": "R", "current_child": "B",
        "next1_axis": "Y", "next1_child": "P",
        "next2_axis": "R", "next2_child": "R",
        "topk": [
            {"axisCol": action_top1, "rotation": 0, "score": 1000},
            {"axisCol": (action_top1 + 1) % 6, "rotation": 0, "score": 800},
            {"axisCol": (action_top1 + 2) % 6, "rotation": 0, "score": 600},
        ],
        "final_score": score,
        "final_max_chain": chain,
        "esport_seed": 1,
    }


def _write(tmp_path: Path, rows):
    p = tmp_path / "mini.jsonl"
    with p.open("w") as f:
        for r in rows:
            f.write(json.dumps(r) + "\n")
    return p


def test_make_soft_policy_sums_to_one():
    p = make_soft_policy([1000, 800, 600], [2, 3, 4], temperature=100.0)
    assert p.shape == (22,)
    assert abs(p.sum() - 1.0) < 1e-5
    assert p.argmax() == 2
    assert p[0] == 0.0
    assert p[5] == 0.0


def test_value_target_monotonic():
    a = value_target_from_score(1000)
    b = value_target_from_score(20000)
    c = value_target_from_score(80000)
    assert -1.0 <= a < b < c <= 1.0


def test_dataset_loads(tmp_path: Path):
    rows = [_row(action_top1=i % 6) for i in range(8)]
    p = _write(tmp_path, rows)
    ds = AmaDataset([p])
    assert len(ds) == 8
    board, queue, policy, value = ds[3]
    assert board.shape == (13, 6, 7)
    assert queue.shape == (16,)
    assert policy.shape == (22,)
    assert abs(float(policy.sum()) - 1.0) < 1e-5
    assert -1.0 <= float(value) <= 1.0


def test_dataloader_batches(tmp_path: Path):
    rows = [_row(action_top1=i % 6) for i in range(13)]
    p = _write(tmp_path, rows)
    ds = AmaDataset([p])
    loader = torch.utils.data.DataLoader(ds, batch_size=4, shuffle=False)
    batches = list(loader)
    assert len(batches) == 4
    b, q, pol, v = batches[0]
    assert b.shape == (4, 13, 6, 7)
    assert q.shape == (4, 16)
    assert pol.shape == (4, 22)
    assert v.shape == (4,)

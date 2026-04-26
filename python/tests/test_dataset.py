import json
from pathlib import Path

import torch

from puyo_train.dataset import SelfPlayDataset, value_target_from_score


def _write_jsonl(tmp_path: Path, rows: list[dict]) -> Path:
    p = tmp_path / "mini.jsonl"
    with p.open("w") as f:
        for r in rows:
            f.write(json.dumps(r) + "\n")
    return p


def _make_row(seed=1, game_id=0, move_index=0, action=0, score=10000, chain=2):
    return {
        "seed": seed,
        "game_id": game_id,
        "move_index": move_index,
        "field": [[None] * 6 for _ in range(13)],
        "current_axis": "R",
        "current_child": "B",
        "next1_axis": "Y",
        "next1_child": "P",
        "next2_axis": "R",
        "next2_child": "R",
        "teacher_move": {"axisCol": 2, "rotation": 0},
        "teacher_action_index": action,
        "final_score": score,
        "final_max_chain": chain,
    }


def test_value_target_from_score_monotonic():
    a = value_target_from_score(1000)
    b = value_target_from_score(10000)
    c = value_target_from_score(100000)
    assert -1.0 <= a < b < c <= 1.0


def test_dataset_loads_jsonl(tmp_path: Path):
    rows = [_make_row(action=i, score=5000 + 100 * i) for i in range(5)]
    path = _write_jsonl(tmp_path, rows)
    ds = SelfPlayDataset([path])
    assert len(ds) == 5
    board, queue, action, value = ds[3]
    assert board.shape == (13, 6, 7)
    assert queue.shape == (16,)
    assert isinstance(action.item(), int)
    assert action.item() == 3
    assert isinstance(value.item(), float)
    assert -1.0 <= value.item() <= 1.0


def test_dataloader_batches(tmp_path: Path):
    rows = [_make_row(action=i % 22, score=5000 + i) for i in range(17)]
    path = _write_jsonl(tmp_path, rows)
    ds = SelfPlayDataset([path])
    loader = torch.utils.data.DataLoader(ds, batch_size=4, shuffle=False)
    batches = list(loader)
    assert len(batches) == 5
    b, q, a, v = batches[0]
    assert b.shape == (4, 13, 6, 7)
    assert q.shape == (4, 16)
    assert a.shape == (4,)
    assert v.shape == (4,)

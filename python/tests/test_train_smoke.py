import json
from pathlib import Path

from train import run_training


def _write_jsonl(tmp_path: Path, n: int = 40) -> Path:
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    p = data_dir / "mini.jsonl"
    with p.open("w") as f:
        for i in range(n):
            row = {
                "seed": 1,
                "game_id": i // 10,
                "move_index": i % 10,
                "field": [[None] * 6 for _ in range(13)],
                "current_axis": "R",
                "current_child": "B",
                "next1_axis": "Y",
                "next1_child": "P",
                "next2_axis": "R",
                "next2_child": "R",
                "teacher_move": {"axisCol": i % 6, "rotation": 0},
                "teacher_action_index": i % 22,
                "final_score": 5000 + 100 * i,
                "final_max_chain": 2,
            }
            f.write(json.dumps(row) + "\n")
    return data_dir


def test_smoke_training(tmp_path: Path):
    data_dir = _write_jsonl(tmp_path, n=40)
    ckpt = tmp_path / "policy.pt"
    history = run_training(
        data_dir=data_dir,
        out_path=ckpt,
        epochs=2,
        batch_size=8,
        lr=1e-3,
        device="cpu",
        val_fraction=0.25,
        seed=0,
    )
    assert ckpt.exists()
    assert len(history) == 2
    for h in history:
        assert "train_loss" in h and "val_loss" in h
        assert h["train_loss"] >= 0

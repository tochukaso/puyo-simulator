import json
from pathlib import Path

from puyo_train.distill import run_distillation


def _write_jsonl(tmp_path: Path, n: int = 32) -> Path:
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    p = data_dir / "mini.jsonl"
    with p.open("w") as f:
        for i in range(n):
            row = {
                "game_id": i // 8,
                "move_index": i % 8,
                "field": ["......"] * 13,
                "current_axis": "R", "current_child": "B",
                "next1_axis": "Y", "next1_child": "P",
                "next2_axis": "R", "next2_child": "R",
                "topk": [
                    {"axisCol": i % 6, "rotation": 0, "score": 1000},
                    {"axisCol": (i + 1) % 6, "rotation": 0, "score": 800},
                ],
                "final_score": 5000 + 100 * i,
                "final_max_chain": 3,
                "esport_seed": 1,
            }
            f.write(json.dumps(row) + "\n")
    return data_dir


def test_smoke_distill(tmp_path: Path):
    data_dir = _write_jsonl(tmp_path, n=32)
    ckpt = tmp_path / "policy-ama.pt"
    history = run_distillation(
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
        assert h["train_loss"] >= 0
        assert h["val_loss"] >= 0

from __future__ import annotations

import json
import math
from pathlib import Path

import torch
from torch.utils.data import Dataset

from .encoding import encode_state

VALUE_SCALE = 20000.0


def value_target_from_score(score: float) -> float:
    return float(math.tanh(score / VALUE_SCALE))


class SelfPlayDataset(Dataset):
    """JSONL 形式(1 行 1 局面)の self-play ログを PyTorch Dataset 化。

    返り値: (board[13,6,7] float32, queue[16] float32, action[int64], value[float32])
    """

    def __init__(self, files: list[Path]):
        rows: list[dict] = []
        for f in files:
            with open(f) as fp:
                for line in fp:
                    line = line.strip()
                    if not line:
                        continue
                    rows.append(json.loads(line))
        self.rows = rows

    def __len__(self) -> int:
        return len(self.rows)

    def __getitem__(self, idx: int):
        row = self.rows[idx]
        state = {
            "field": row["field"],
            "current": {
                "axis": row["current_axis"],
                "child": row["current_child"],
                "axisRow": 1,
                "axisCol": 2,
                "rotation": 0,
            },
            "next_queue": [
                {"axis": row["next1_axis"], "child": row["next1_child"]},
                {"axis": row["next2_axis"], "child": row["next2_child"]},
            ],
        }
        board, queue, _ = encode_state(state)
        action = int(row["teacher_action_index"])
        value = value_target_from_score(float(row["final_score"]))
        return (
            torch.from_numpy(board),
            torch.from_numpy(queue),
            torch.tensor(action, dtype=torch.int64),
            torch.tensor(value, dtype=torch.float32),
        )


def load_all(data_dir: Path) -> SelfPlayDataset:
    files = sorted(Path(data_dir).glob("*.jsonl"))
    if not files:
        raise FileNotFoundError(f"no JSONL files in {data_dir}")
    return SelfPlayDataset(files)

import json
from pathlib import Path

import numpy as np

from puyo_train.encoding import (
    BOARD_CHANNELS,
    COLOR_ORDER,
    QUEUE_DIM,
    encode_state,
)

SPEC_PATH = Path(__file__).resolve().parents[2] / "src/shared/specs/encoding_spec.json"
ROWS = 13
COLS = 6


def load_spec():
    with SPEC_PATH.open() as f:
        return json.load(f)


def build_state(spec_state):
    field = [[None for _ in range(COLS)] for _ in range(ROWS)]
    if spec_state["field"] is not None:
        for cell in spec_state["field"]:
            field[cell["row"]][cell["col"]] = cell["color"]
    current = spec_state["current"]
    next_queue = spec_state["nextQueue"]
    return {
        "field": field,
        "current": {
            "axis": current["axis"],
            "child": current["child"],
            "axisRow": current["axisRow"],
            "axisCol": current["axisCol"],
            "rotation": current["rotation"],
        },
        "next_queue": next_queue,
    }


def test_constants():
    assert BOARD_CHANNELS == 7
    assert QUEUE_DIM == 16
    assert COLOR_ORDER == ("R", "B", "Y", "P")


def test_spec_cases():
    spec = load_spec()
    for case in spec["cases"]:
        state = build_state(case["state"])
        board, queue, legal = encode_state(state)
        exp = case["expected"]
        assert tuple(board.shape) == tuple(exp["board_shape"])
        assert tuple(queue.shape) == tuple(exp["queue_shape"])
        for s in exp["board_samples"]:
            v = board[s["r"], s["c"], s["ch"]]
            assert abs(float(v) - s["value"]) < 1e-6, (
                f"case={case['name']} r={s['r']} c={s['c']} ch={s['ch']} "
                f"got={v} want={s['value']}"
            )
        assert np.allclose(queue, np.array(exp["queue_values"], dtype=np.float32))
        assert int(legal.sum()) == exp["legal_mask_sum"]

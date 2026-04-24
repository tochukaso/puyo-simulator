import json
from pathlib import Path

import pytest

from puyo_train.action import (
    ACTION_COUNT,
    action_index_to_move,
    move_to_action_index,
)

SPEC_PATH = Path(__file__).resolve().parents[2] / "src/shared/specs/action_spec.json"


def load_spec():
    with SPEC_PATH.open() as f:
        return json.load(f)


def test_action_count():
    spec = load_spec()
    assert ACTION_COUNT == spec["action_count"] == 22


def test_spec_round_trip():
    spec = load_spec()
    for e in spec["entries"]:
        idx = move_to_action_index(e["axisCol"], e["rotation"])
        assert idx == e["index"]
        col, rot = action_index_to_move(e["index"])
        assert (col, rot) == (e["axisCol"], e["rotation"])


def test_out_of_range_raises():
    with pytest.raises(ValueError):
        action_index_to_move(-1)
    with pytest.raises(ValueError):
        action_index_to_move(22)
    with pytest.raises(ValueError):
        move_to_action_index(5, 1)
    with pytest.raises(ValueError):
        move_to_action_index(0, 3)

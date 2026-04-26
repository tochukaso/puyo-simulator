import numpy as np
from puyo_train.encoding import (
    BOARD_CHANNELS,
    BOARD_H,
    BOARD_W,
    QUEUE_DIM,
    encode_state,
)


def _empty_field():
    return [[None] * 6 for _ in range(13)]


def _state(field=None, current=None, queue=None):
    return {
        "field": field or _empty_field(),
        "current": current,
        "next_queue": queue or [],
    }


def test_board_shape_is_11ch():
    s = _state(current={"axis": "R", "child": "B", "axisRow": 1, "axisCol": 2, "rotation": 0})
    board, queue, legal = encode_state(s)
    assert board.shape == (13, 6, 11)
    assert queue.shape == (16,)
    assert legal.shape == (22,)


def test_empty_cells_set_channel_4():
    s = _state(current={"axis": "R", "child": "R", "axisRow": 1, "axisCol": 2, "rotation": 0})
    board, _, _ = encode_state(s)
    # All 78 cells empty → ch 4 == 1
    assert np.all(board[:, :, 4] == 1.0)


def test_height_channel_reflects_column_heights():
    field = _empty_field()
    field[12][0] = "R"  # height 1 in col 0
    field[12][3] = "B"
    field[11][3] = "B"  # height 2 in col 3
    s = _state(field=field, current={"axis": "R", "child": "R", "axisRow": 1, "axisCol": 2, "rotation": 0})
    board, _, _ = encode_state(s)
    assert np.isclose(board[0, 0, 7], 1.0 / 13.0)  # col 0, height 1
    assert np.isclose(board[0, 3, 7], 2.0 / 13.0)  # col 3, height 2
    assert board[0, 1, 7] == 0.0  # col 1, height 0


def test_four_connected_mask():
    field = _empty_field()
    # Vertical 4-stack at col 0 rows 9..12 (canonicalize will rename Y → 'R')
    for r in range(9, 13):
        field[r][0] = "R"
    s = _state(field=field, current={"axis": "B", "child": "B", "axisRow": 1, "axisCol": 2, "rotation": 0})
    board, _, _ = encode_state(s)
    for r in range(9, 13):
        assert board[r, 0, 8] == 1.0
    # Cells outside the group are 0
    assert board[8, 0, 8] == 0.0


def test_ceiling_and_danger_flags():
    field = _empty_field()
    field[0][1] = "R"  # ceiling row, col 1
    field[1][2] = "B"  # danger row, col 2
    s = _state(field=field, current={"axis": "R", "child": "R", "axisRow": 1, "axisCol": 2, "rotation": 0})
    board, _, _ = encode_state(s)
    assert np.all(board[:, 1, 9] == 1.0)
    assert np.all(board[:, 1, 10] == 0.0)  # row 1 of col 1 is empty
    assert np.all(board[:, 2, 10] == 1.0)


def test_color_canonicalization_applied():
    """Place Y in field, then current=(R, R). After canonicalize, Y→0(R), R→1(B).
    Channel 0 should mark the Y position, channel 5 (axis) should be B's id (1/3)."""
    field = _empty_field()
    field[12][0] = "Y"
    s = _state(field=field, current={"axis": "R", "child": "R", "axisRow": 1, "axisCol": 2, "rotation": 0})
    board, _, _ = encode_state(s)
    # Y at field[12][0] becomes canonical 'R' (id 0)
    assert board[12, 0, 0] == 1.0
    # axis was R → canonical 'B' (id 1) → broadcast value 1/3
    assert np.allclose(board[:, :, 5], 1.0 / 3.0)

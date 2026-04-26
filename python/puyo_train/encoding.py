from __future__ import annotations

import numpy as np

ROWS = 13
COLS = 6
BOARD_CHANNELS = 7
QUEUE_DIM = 16
COLOR_ORDER = ("R", "B", "Y", "P")
_COLOR_INDEX = {c: i for i, c in enumerate(COLOR_ORDER)}


def encode_state(state: dict) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """state = {"field": [[color or None]], "current": {...}, "next_queue": [{...}]}"""
    board = np.zeros((ROWS, COLS, BOARD_CHANNELS), dtype=np.float32)
    field = state["field"]
    for r in range(ROWS):
        for c in range(COLS):
            cell = field[r][c]
            if cell is None:
                board[r, c, 4] = 1.0
            else:
                board[r, c, _COLOR_INDEX[cell]] = 1.0

    current = state.get("current")
    if current is not None:
        ax = _COLOR_INDEX[current["axis"]] / 3.0
        ch = _COLOR_INDEX[current["child"]] / 3.0
        board[:, :, 5] = ax
        board[:, :, 6] = ch

    queue = np.zeros((QUEUE_DIM,), dtype=np.float32)
    nq = state.get("next_queue", [])
    if len(nq) >= 1:
        n1 = nq[0]
        queue[_COLOR_INDEX[n1["axis"]]] = 1.0
        queue[4 + _COLOR_INDEX[n1["child"]]] = 1.0
    if len(nq) >= 2:
        n2 = nq[1]
        queue[8 + _COLOR_INDEX[n2["axis"]]] = 1.0
        queue[12 + _COLOR_INDEX[n2["child"]]] = 1.0

    legal = _legal_mask(field, current)
    return board, queue, legal


def _legal_mask(field, current) -> np.ndarray:
    from .action import ACTION_COUNT, action_index_to_move

    mask = np.zeros((ACTION_COUNT,), dtype=np.uint8)
    if current is None:
        return mask
    for i in range(ACTION_COUNT):
        col, rot = action_index_to_move(i)
        dc = 1 if rot == 1 else -1 if rot == 3 else 0
        if 0 <= col < COLS and 0 <= col + dc < COLS:
            mask[i] = 1
    return mask

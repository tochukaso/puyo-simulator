from __future__ import annotations

import numpy as np

ROWS = 13
COLS = 6
BOARD_H = ROWS
BOARD_W = COLS
BOARD_CHANNELS = 11
QUEUE_DIM = 16
COLOR_ORDER = ("R", "B", "Y", "P")
_COLOR_INDEX = {c: i for i, c in enumerate(COLOR_ORDER)}


def encode_state(state: dict) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """state = {"field": [[color or None]], "current": {...}, "next_queue": [{...}]}

    Apply color canonicalization first, then build an 11ch board tensor:
      ch 0..3  one-hot per canonical color
      ch 4     empty cell
      ch 5     axis color (broadcast across all cells, scaled to [0,1])
      ch 6     child color (broadcast, scaled)
      ch 7     column heightmap (height / ROWS, broadcast across that column)
      ch 8     same-color 4-connected mask (1 where the cell already belongs
               to a 4-connected same-color group, else 0)
      ch 9     ceiling-row-occupied flag for the column (broadcast)
      ch 10    danger-row (row 1) occupied flag for the column (broadcast)
    """
    canon_state, _perm = canonicalize_colors(state)

    board = np.zeros((ROWS, COLS, BOARD_CHANNELS), dtype=np.float32)
    field = canon_state["field"]
    for r in range(ROWS):
        for c in range(COLS):
            cell = field[r][c]
            if cell is None:
                board[r, c, 4] = 1.0
            else:
                board[r, c, _COLOR_INDEX[cell]] = 1.0

    current = canon_state.get("current")
    if current is not None:
        ax = _COLOR_INDEX[current["axis"]] / 3.0
        ch = _COLOR_INDEX[current["child"]] / 3.0
        board[:, :, 5] = ax
        board[:, :, 6] = ch

    # ch 7: heightmap per column
    heights = _column_heights(field)
    for c in range(COLS):
        board[:, c, 7] = heights[c] / float(ROWS)

    # ch 8: 4-connected mask
    mask = _four_connected_mask(field)
    for r in range(ROWS):
        for c in range(COLS):
            if mask[r][c]:
                board[r, c, 8] = 1.0

    # ch 9: ceiling occupancy (row 0)
    for c in range(COLS):
        if field[0][c] is not None:
            board[:, c, 9] = 1.0
    # ch 10: danger row occupancy (row 1)
    for c in range(COLS):
        if field[1][c] is not None:
            board[:, c, 10] = 1.0

    queue = np.zeros((QUEUE_DIM,), dtype=np.float32)
    nq = canon_state.get("next_queue", [])
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


def _column_heights(field) -> list[int]:
    heights = [0] * COLS
    for c in range(COLS):
        for r in range(ROWS):
            if field[r][c] is not None:
                heights[c] = ROWS - r
                break
    return heights


def _four_connected_mask(field) -> list[list[bool]]:
    """Mark cells that already belong to a same-color group of size >= 4."""
    seen = [[False] * COLS for _ in range(ROWS)]
    out = [[False] * COLS for _ in range(ROWS)]
    for r in range(ROWS):
        for c in range(COLS):
            if seen[r][c] or field[r][c] is None:
                continue
            color = field[r][c]
            stack = [(r, c)]
            group = []
            while stack:
                y, x = stack.pop()
                if (
                    y < 0 or y >= ROWS or x < 0 or x >= COLS
                    or seen[y][x] or field[y][x] != color
                ):
                    continue
                seen[y][x] = True
                group.append((y, x))
                stack.extend([(y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)])
            if len(group) >= 4:
                for y, x in group:
                    out[y][x] = True
    return out


def canonicalize_colors(state: dict) -> tuple[dict, dict[str, int]]:
    """Renames colors so that they appear in canonical order (R, B, Y, P) by
    first-appearance scan: field bottom→top + left→right, then current.axis,
    current.child, next1.axis, next1.child, next2.axis, next2.child.

    Returns (canonical_state, perm) where perm maps original color → canonical id.
    """
    perm: dict[str, int] = {}

    def _see(c):
        if c is None or c not in ("R", "B", "Y", "P"):
            return
        if c not in perm and len(perm) < 4:
            perm[c] = len(perm)

    field = state["field"]
    for r in range(12, -1, -1):
        for c in range(6):
            _see(field[r][c])

    cur = state.get("current")
    if cur is not None:
        _see(cur.get("axis"))
        _see(cur.get("child"))
    for pair in state.get("next_queue", []):
        _see(pair.get("axis"))
        _see(pair.get("child"))

    def _remap(c):
        if c is None or c not in perm:
            return c
        return COLOR_ORDER[perm[c]]

    canon_field = [[_remap(c) for c in row] for row in field]
    canon_state = {
        "field": canon_field,
        "current": (
            None
            if cur is None
            else {**cur, "axis": _remap(cur.get("axis")), "child": _remap(cur.get("child"))}
        ),
        "next_queue": [
            {**p, "axis": _remap(p.get("axis")), "child": _remap(p.get("child"))}
            for p in state.get("next_queue", [])
        ],
    }
    return canon_state, perm


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

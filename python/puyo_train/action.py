from __future__ import annotations

ACTION_COUNT = 22


def move_to_action_index(axis_col: int, rotation: int) -> int:
    if not isinstance(axis_col, int) or axis_col < 0 or axis_col > 5:
        raise ValueError(f"invalid axis_col: {axis_col}")
    if rotation == 0:
        return axis_col
    if rotation == 2:
        return 6 + axis_col
    if rotation == 1:
        if axis_col < 0 or axis_col > 4:
            raise ValueError(f"rot=1 axis_col out of range: {axis_col}")
        return 12 + axis_col
    if rotation == 3:
        if axis_col < 1 or axis_col > 5:
            raise ValueError(f"rot=3 axis_col out of range: {axis_col}")
        return 17 + axis_col - 1
    raise ValueError(f"invalid rotation: {rotation}")


def action_index_to_move(index: int) -> tuple[int, int]:
    if not isinstance(index, int) or index < 0 or index >= ACTION_COUNT:
        raise ValueError(f"invalid action index: {index}")
    if index < 6:
        return (index, 0)
    if index < 12:
        return (index - 6, 2)
    if index < 17:
        return (index - 12, 1)
    return (index - 17 + 1, 3)

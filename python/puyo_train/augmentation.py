"""Data augmentation for puyo distillation.

LR flip mirrors the field horizontally (col 0..5 → 5..0), and remaps actions
since rotations 1 ↔ 3 swap when the axis swings to the other side.

Color permutation reshuffles canonical colors 0..3, exploiting puyo's full
4-color symmetry. Combined with LR flip this gives 24 × 2 = 48× augmentation.
"""
from __future__ import annotations

import numpy as np

# Action layout (matches action.py):
#   0..5   rot 0, axis_col 0..5
#   6..11  rot 2, axis_col 0..5
#   12..16 rot 1, axis_col 0..4
#   17..21 rot 3, axis_col 1..5


def flip_action_index(i: int) -> int:
    if i < 6:
        return 5 - i
    if i < 12:
        return 6 + (5 - (i - 6))
    if i < 17:
        # rot 1, axis_col c → rot 3, axis_col 5-c. rot3 col v has index 17+(v-1).
        c = i - 12
        v = 5 - c
        return 17 + (v - 1)
    # rot 3, axis_col v (1..5) → rot 1, axis_col 5-v (0..4).
    v = (i - 17) + 1
    c = 5 - v
    return 12 + c


def apply_lr_flip(
    board: np.ndarray, queue: np.ndarray, policy: np.ndarray
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    fb = board[:, ::-1, :].copy()  # mirror columns
    fq = queue.copy()  # queue is per-color one-hot, no spatial index to flip
    ft = np.zeros_like(policy)
    for i in range(policy.shape[0]):
        ft[flip_action_index(i)] = policy[i]
    return fb, fq, ft


def apply_color_permutation(
    board: np.ndarray,
    queue: np.ndarray,
    policy: np.ndarray,
    perm: tuple[int, int, int, int],
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """perm[i] = new index that color i should be mapped to."""
    assert len(perm) == 4 and sorted(perm) == [0, 1, 2, 3]
    new = np.zeros_like(board)
    # Permute color channels 0..3, leave 4..10 alone.
    for old in range(4):
        new[:, :, perm[old]] = board[:, :, old]
    new[:, :, 4:] = board[:, :, 4:]

    # Queue layout: [n1.axis(4), n1.child(4), n2.axis(4), n2.child(4)]
    fq = np.zeros_like(queue)
    for block_start in (0, 4, 8, 12):
        for old in range(4):
            fq[block_start + perm[old]] = queue[block_start + old]

    return new, fq, policy.copy()

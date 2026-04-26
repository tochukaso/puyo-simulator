import numpy as np
from puyo_train.augmentation import (
    apply_lr_flip,
    apply_color_permutation,
    flip_action_index,
)


def test_flip_action_index_is_involution():
    for i in range(22):
        assert flip_action_index(flip_action_index(i)) == i


def test_flip_action_index_known_pairs():
    # rot 0, axis_col 0 ↔ rot 0, axis_col 5
    assert flip_action_index(0) == 5
    assert flip_action_index(5) == 0
    # rot 2, axis_col 1 ↔ rot 2, axis_col 4
    assert flip_action_index(7) == 10
    # rot 1, axis_col 0 ↔ rot 3, axis_col 5
    # rot 1 indices: 12..16 (col 0..4); rot 3 indices: 17..21 (col 1..5)
    # rot1 col 0 (index 12) ↔ rot3 col 5 (index 21)
    assert flip_action_index(12) == 21
    assert flip_action_index(21) == 12
    # rot1 col 4 (index 16) ↔ rot3 col 1 (index 17)
    assert flip_action_index(16) == 17


def test_apply_lr_flip_board_columns():
    board = np.zeros((13, 6, 11), dtype=np.float32)
    board[12, 0, 0] = 1.0  # mark col 0
    queue = np.zeros((16,), dtype=np.float32)
    target = np.zeros((22,), dtype=np.float32)
    target[0] = 1.0  # rot0 col 0
    fb, fq, ft = apply_lr_flip(board, queue, target)
    assert fb[12, 5, 0] == 1.0  # column 0 → 5
    assert fb[12, 0, 0] == 0.0
    assert ft[5] == 1.0  # action 0 → action 5
    assert ft[0] == 0.0


def test_apply_color_permutation_swaps_channels_and_queue():
    board = np.zeros((13, 6, 11), dtype=np.float32)
    board[12, 0, 0] = 1.0  # color 0
    board[12, 1, 1] = 1.0  # color 1
    queue = np.zeros((16,), dtype=np.float32)
    queue[0] = 1.0  # n1.axis = color 0
    queue[5] = 1.0  # n1.child = color 1
    target = np.zeros((22,), dtype=np.float32)
    target[3] = 1.0
    perm = (1, 0, 2, 3)  # swap colors 0 and 1
    fb, fq, ft = apply_color_permutation(board, queue, target, perm)
    # Channel 0 cell becomes channel 1
    assert fb[12, 0, 1] == 1.0
    assert fb[12, 0, 0] == 0.0
    # Queue index 0 ('n1.axis = color 0') becomes index 1 ('n1.axis = color 1')
    assert fq[1] == 1.0
    assert fq[0] == 0.0
    # action target unchanged
    assert ft[3] == 1.0

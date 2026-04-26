from __future__ import annotations

import torch
from torch import nn


class PolicyValueNet(nn.Module):
    """CNN + FC dual-head (policy 22 + value scalar).

    Input:
      board: (B, 13, 6, 7)   NHWC
      queue: (B, 16)
    Output:
      policy_logits: (B, 22)
      value:         (B,)      tanh in [-1, 1]
    """

    BOARD_C = 11
    BOARD_H = 13
    BOARD_W = 6

    def __init__(self) -> None:
        super().__init__()
        self.conv1 = nn.Conv2d(self.BOARD_C, 32, kernel_size=3, padding=1)
        self.conv2 = nn.Conv2d(32, 64, kernel_size=3, padding=1)
        self.conv3 = nn.Conv2d(64, 64, kernel_size=3, padding=1)

        self.queue_fc = nn.Linear(16, 32)

        self.trunk = nn.Linear(self.BOARD_H * self.BOARD_W * 64 + 32, 64)
        self.policy_head = nn.Linear(64, 22)
        self.value_head = nn.Linear(64, 1)

    def forward(
        self, board: torch.Tensor, queue: torch.Tensor
    ) -> tuple[torch.Tensor, torch.Tensor]:
        x = board.permute(0, 3, 1, 2).contiguous()
        x = torch.relu(self.conv1(x))
        x = torch.relu(self.conv2(x))
        x = torch.relu(self.conv3(x))
        x = x.flatten(start_dim=1)

        q = torch.relu(self.queue_fc(queue))

        h = torch.relu(self.trunk(torch.cat([x, q], dim=1)))
        policy = self.policy_head(h)
        value = torch.tanh(self.value_head(h)).squeeze(-1)
        return policy, value

from __future__ import annotations

import torch
from torch import nn


class ResBlock(nn.Module):
    def __init__(self, ch: int) -> None:
        super().__init__()
        self.conv1 = nn.Conv2d(ch, ch, kernel_size=3, padding=1, bias=False)
        self.bn1 = nn.BatchNorm2d(ch)
        self.conv2 = nn.Conv2d(ch, ch, kernel_size=3, padding=1, bias=False)
        self.bn2 = nn.BatchNorm2d(ch)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        y = torch.relu(self.bn1(self.conv1(x)))
        y = self.bn2(self.conv2(y))
        return torch.relu(x + y)


class PolicyValueNetV2(nn.Module):
    """ResNet 10 blocks × 64ch dual-head (policy 22 + value scalar).

    Input:  board (B, 13, 6, 11) NHWC, queue (B, 16)
    Output: policy_logits (B, 22), value (B,) tanh
    """

    BOARD_C = 11
    BOARD_H = 13
    BOARD_W = 6
    BLOCKS = 10
    CHANNELS = 64

    def __init__(self) -> None:
        super().__init__()
        self.stem = nn.Conv2d(self.BOARD_C, self.CHANNELS, kernel_size=3, padding=1, bias=False)
        self.stem_bn = nn.BatchNorm2d(self.CHANNELS)
        self.body = nn.ModuleList([ResBlock(self.CHANNELS) for _ in range(self.BLOCKS)])

        self.queue_fc = nn.Linear(16, 32)

        flat = self.BOARD_H * self.BOARD_W * self.CHANNELS
        self.trunk = nn.Linear(flat + 32, 128)
        self.policy_head = nn.Linear(128, 22)
        self.value_head = nn.Linear(128, 1)

    def forward(
        self, board: torch.Tensor, queue: torch.Tensor
    ) -> tuple[torch.Tensor, torch.Tensor]:
        x = board.permute(0, 3, 1, 2).contiguous()
        x = torch.relu(self.stem_bn(self.stem(x)))
        for blk in self.body:
            x = blk(x)
        x = x.flatten(start_dim=1)

        q = torch.relu(self.queue_fc(queue))

        h = torch.relu(self.trunk(torch.cat([x, q], dim=1)))
        policy = self.policy_head(h)
        value = torch.tanh(self.value_head(h)).squeeze(-1)
        return policy, value

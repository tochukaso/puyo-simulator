from __future__ import annotations

import argparse
import subprocess
import tempfile
from pathlib import Path

import torch
from torch import nn

from .model import PolicyValueNet
from .model_v2 import PolicyValueNetV2


def _detect_model_cls(state_dict: dict) -> type:
    """Pick model class by sniffing state_dict keys."""
    if any("body." in k for k in state_dict.keys()):
        return PolicyValueNetV2
    return PolicyValueNet


class _NCHWExport(nn.Module):
    """Wrapper that accepts NCHW board directly so the exported ONNX has no
    leading Transpose — onnx2tf then preserves the natural NHWC shape
    [B, 13, 6, 7] on the TF side instead of permuting it to [B, 6, 7, 13]."""

    def __init__(self, net: nn.Module) -> None:
        super().__init__()
        self.net = net

    def forward(
        self, board_nchw: torch.Tensor, queue: torch.Tensor
    ) -> tuple[torch.Tensor, torch.Tensor]:
        if isinstance(self.net, PolicyValueNetV2):
            x = torch.relu(self.net.stem_bn(self.net.stem(board_nchw)))
            for blk in self.net.body:
                x = blk(x)
            x = x.flatten(start_dim=1)
            q = torch.relu(self.net.queue_fc(queue))
            h = torch.relu(self.net.trunk(torch.cat([x, q], dim=1)))
            policy = self.net.policy_head(h)
            value = torch.tanh(self.net.value_head(h)).squeeze(-1)
            return policy, value
        x = torch.relu(self.net.conv1(board_nchw))
        x = torch.relu(self.net.conv2(x))
        x = torch.relu(self.net.conv3(x))
        x = x.flatten(start_dim=1)
        q = torch.relu(self.net.queue_fc(queue))
        h = torch.relu(self.net.trunk(torch.cat([x, q], dim=1)))
        policy = self.net.policy_head(h)
        value = torch.tanh(self.net.value_head(h)).squeeze(-1)
        return policy, value


def export_to_onnx(ckpt_path: Path, onnx_path: Path) -> None:
    state = torch.load(ckpt_path, map_location="cpu")
    cls = _detect_model_cls(state)
    net = cls()
    net.load_state_dict(state)
    net.eval()
    wrapped = _NCHWExport(net).eval()

    # NCHW dummy input: [B, C=BOARD_C, H=13, W=6]
    dummy_board = torch.zeros(1, cls.BOARD_C, 13, 6)
    dummy_queue = torch.zeros(1, 16)

    onnx_path.parent.mkdir(parents=True, exist_ok=True)
    torch.onnx.export(
        wrapped,
        (dummy_board, dummy_queue),
        str(onnx_path),
        input_names=["board", "queue"],
        output_names=["policy", "value"],
        dynamic_axes={
            "board": {0: "batch"},
            "queue": {0: "batch"},
            "policy": {0: "batch"},
            "value": {0: "batch"},
        },
        opset_version=17,
    )


def onnx_to_tfjs(onnx_path: Path, out_dir: Path) -> None:
    """ONNX → TF SavedModel (onnx2tf) → TF.js GraphModel (tensorflowjs_converter)."""
    out_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as td:
        tf_saved = Path(td) / "tf_model"
        subprocess.run(
            [
                "onnx2tf",
                "-i", str(onnx_path),
                "-o", str(tf_saved),
                "-osd",
                "-kat", "board",
                "-kat", "queue",
            ],
            check=True,
        )
        subprocess.run(
            [
                "tensorflowjs_converter",
                "--input_format=tf_saved_model",
                "--output_format=tfjs_graph_model",
                str(tf_saved),
                str(out_dir),
            ],
            check=True,
        )


def export_full(ckpt_path: Path, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    onnx_path = out_dir / "policy.onnx"
    export_to_onnx(ckpt_path, onnx_path)
    onnx_to_tfjs(onnx_path, out_dir)
    if onnx_path.exists():
        onnx_path.unlink()


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--ckpt", type=Path, required=True)
    p.add_argument("--out", type=Path, required=True)
    args = p.parse_args()
    export_full(args.ckpt, args.out)


if __name__ == "__main__":
    main()

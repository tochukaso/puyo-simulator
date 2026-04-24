from pathlib import Path

import torch

from puyo_train.export import export_to_onnx
from puyo_train.model import PolicyValueNet


def test_export_to_onnx(tmp_path: Path):
    net = PolicyValueNet()
    ckpt = tmp_path / "net.pt"
    torch.save(net.state_dict(), ckpt)
    out = tmp_path / "net.onnx"
    export_to_onnx(ckpt, out)
    assert out.exists()
    assert out.stat().st_size > 0

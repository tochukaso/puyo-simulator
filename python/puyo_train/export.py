from __future__ import annotations

import argparse
import subprocess
import tempfile
from pathlib import Path

import torch

from .model import PolicyValueNet


def export_to_onnx(ckpt_path: Path, onnx_path: Path) -> None:
    net = PolicyValueNet()
    net.load_state_dict(torch.load(ckpt_path, map_location="cpu"))
    net.eval()

    dummy_board = torch.zeros(1, 13, 6, 7)
    dummy_queue = torch.zeros(1, 16)

    onnx_path.parent.mkdir(parents=True, exist_ok=True)
    torch.onnx.export(
        net,
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

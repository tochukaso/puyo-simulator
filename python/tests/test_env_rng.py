import json
from pathlib import Path

from puyo_train.env_rng import get_esport_queue, make_esport_queue, COLOR_MAP

SPEC_PATH = Path(__file__).resolve().parents[2] / "src/shared/specs/rng_spec.json"


def load_spec():
    with SPEC_PATH.open() as f:
        return json.load(f)


def test_color_map():
    assert COLOR_MAP == ("R", "Y", "P", "B")


def test_returns_128_pairs():
    q = make_esport_queue(42)
    assert len(q) == 128


def test_first_2_pairs_use_3_colors():
    q = make_esport_queue(123456)
    colors = set()
    for p in q[:2]:
        colors.add(p[0])
        colors.add(p[1])
    assert len(colors) <= 3


def test_cross_spec_matches_ts():
    spec = load_spec()
    for case in spec["cases"]:
        q = get_esport_queue(case["seed"])
        first8 = [{"axis": p[0], "child": p[1]} for p in q[:8]]
        assert first8 == case["first8"], f"seed {case['seed']} mismatch"


def test_get_esport_queue_caches():
    a = get_esport_queue(99)
    b = get_esport_queue(99)
    assert a is b

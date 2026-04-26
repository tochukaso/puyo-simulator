from puyo_train.encoding import canonicalize_colors


def _empty_field():
    return [["." for _ in range(6)] for _ in range(13)]


def _state(field=None, current=None, queue=None):
    return {
        "field": [
            [c if c in ("R", "B", "Y", "P") else None for c in row]
            for row in (field or _empty_field())
        ],
        "current": current,
        "next_queue": queue or [],
    }


def test_canonicalize_idempotent_on_empty():
    s = _state()
    out, perm = canonicalize_colors(s)
    assert perm == {}
    assert out["field"] == s["field"]


def test_canonicalize_uses_first_appearance_order_in_field():
    # bottom row left→right: Y first, then R
    field = _empty_field()
    field[12][0] = "Y"
    field[12][1] = "R"
    s = _state(field=field)
    out, perm = canonicalize_colors(s)
    # Y → canonical id 0 → label 'R', R → id 1 → label 'B'
    assert perm == {"Y": 0, "R": 1}
    assert out["field"][12][0] == "R"
    assert out["field"][12][1] == "B"


def test_canonicalize_continues_into_current_then_queue():
    field = _empty_field()
    field[12][0] = "B"  # B first → id 0
    s = _state(
        field=field,
        current={"axis": "Y", "child": "P", "axisRow": 1, "axisCol": 2, "rotation": 0},
        queue=[{"axis": "R", "child": "B"}],
    )
    out, perm = canonicalize_colors(s)
    # Order: B(field) → Y(curr.axis) → P(curr.child) → R(queue.axis); B reuses id 0
    assert perm == {"B": 0, "Y": 1, "P": 2, "R": 3}
    assert out["current"]["axis"] == "B"  # Y → 1 → 'B'
    assert out["current"]["child"] == "Y"  # P → 2 → 'Y'
    assert out["next_queue"][0]["axis"] == "P"  # R → 3 → 'P'
    assert out["next_queue"][0]["child"] == "R"  # B → 0 → 'R'


def test_canonicalize_idempotent_on_canonical_input():
    field = _empty_field()
    field[12][0] = "Y"
    field[12][1] = "R"
    s = _state(field=field)
    out1, _ = canonicalize_colors(s)
    out2, _ = canonicalize_colors(out1)
    assert out1 == out2

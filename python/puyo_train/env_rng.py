"""Puyo eSport-compatible queue generation. Mirrors src/game/rng.ts exactly."""
from __future__ import annotations

COLOR_MAP = ("R", "Y", "P", "B")  # ama: R Y G B → ours: R Y P B


def _lcg(seed: int):
    s = [seed & 0xFFFFFFFF]

    def rng() -> int:
        s[0] = ((s[0] * 0x5D588B65) + 0x269EC3) & 0xFFFFFFFF
        return s[0]

    return rng


def make_esport_queue(seed: int) -> list[tuple[str, str]]:
    rng = _lcg(seed)
    for _ in range(5):
        rng()

    queues = [
        [i % 3 for i in range(256)],
        [i % 4 for i in range(256)],
        [i % 5 for i in range(256)],
    ]

    for mode in range(3):
        q = queues[mode]
        for col in range(15):
            for _ in range(8):
                n1 = (rng() >> 28) + col * 16
                n2 = (rng() >> 28) + (col + 1) * 16
                q[n1], q[n2] = q[n2], q[n1]
        for col in range(7):
            for _ in range(16):
                n1 = (rng() >> 27) + col * 32
                n2 = (rng() >> 27) + (col + 1) * 32
                q[n1], q[n2] = q[n2], q[n1]
        for col in range(3):
            for _ in range(32):
                n1 = (rng() >> 26) + col * 64
                n2 = (rng() >> 26) + (col + 1) * 64
                q[n1], q[n2] = q[n2], q[n1]

    for i in range(4):
        queues[1][i] = queues[0][i]
        queues[2][i] = queues[0][i]

    m1 = queues[1]
    result: list[tuple[str, str]] = []
    for i in range(128):
        result.append((COLOR_MAP[m1[i * 2]], COLOR_MAP[m1[i * 2 + 1]]))
    return result


_cache: dict[int, list[tuple[str, str]]] = {}


def get_esport_queue(seed: int) -> list[tuple[str, str]]:
    key = seed & 0xFFFFFFFF
    if key not in _cache:
        _cache[key] = make_esport_queue(key)
    return _cache[key]

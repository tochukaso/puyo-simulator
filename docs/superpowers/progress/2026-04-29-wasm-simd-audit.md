# wasm-simd128 opcode audit

**Date:** 2026-04-29
**Branch:** feat/web-ama-wasm-optimization
**Artifact:** public/wasm/ama.wasm

`wasm-objdump -d ama.wasm | grep -cE "v128|f32x4|i32x4|i16x8|i8x16"` returned: **987**.

## Conclusion

The artifact contains 987 wasm-simd128 opcodes — confirming Emscripten built it
with `-msimd128` (and presumably `-msse4.1`) effective. No rebuild needed.

## Sample of distinct SIMD instructions observed

- `v128.const`, `v128.load`, `v128.store`, `v128.and`, `v128.andnot`, `v128.or`, `v128.not`
- `i8x16.shuffle`
- `i16x8.shl`, `i16x8.shr_u`, `i16x8.extract_lane_u`, `i16x8.replace_lane`

These are exactly the kind of bit-board / bit-shift heavy ops we expect ama's
move generator and reachability code to use, so the SIMD lane width and family
mix looks consistent with the source.

## Verdict

PASS — ama.wasm is shipping with the wasm-simd128 instruction set baked in.
No action item.

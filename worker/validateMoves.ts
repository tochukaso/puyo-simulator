// サーバ側でクライアントから来た手順 (seed + moves) を再シミュレートし、
// 報告されたスコアと完全一致するかを検証する。一致しない / 物理的にあり得ない
// 手順の場合は POST を 400 で弾いて、改造データがリーダーボードに混入する
// のを防ぐ。
//
// 実装は `src/share/encodeReplay.ts:replayDataToRecord` と同じ流れ
// (createInitialState → 各手で lockActive + resolveChain + spawnNext)。
// ただし以下の追加チェックを入れる:
//   1. canPlace で配置可能性を検証 (overlap / 範囲外を弾く)。
//   2. ターン上限超過の手を弾く。
//   3. すでに current=null (gameover or 上限到達後) の状態で更に手があれば弾く。
//   4. 最終スコアが claimedScore と完全一致するかを検証。
//
// `src/game/*` は DOM 非依存の純粋ロジックなので、Cloudflare Workers ランタイム
// (V8 isolate, fetch API のみ) でも問題なく動く。

import { createInitialState, spawnNext } from '../src/game/state';
import { lockActive } from '../src/game/landing';
import { resolveChain } from '../src/game/chain';
import { canPlace } from '../src/game/pair';
import type { Move } from '../src/game/types';

export type ValidationResult =
  | { ok: true; score: number; turnsPlayed: number }
  | { ok: false; reason: string };

export interface ValidateInput {
  seed: number;
  moves: ReadonlyArray<Move>;
  claimedScore: number;
  /** 0 = unlimited (score モードの '無制限' センチネル)。それ以外は 30/50/100/200。 */
  turnLimit: number;
}

export function simulateAndValidate(input: ValidateInput): ValidationResult {
  const { seed, moves, claimedScore, turnLimit } = input;
  const limit = turnLimit <= 0 ? Infinity : turnLimit;

  // 上限を超えて手が送られていたら受け付けない (= 改造の疑い)。
  if (moves.length > limit) {
    return {
      ok: false,
      reason: `moves (${moves.length}) exceeds turnLimit (${turnLimit})`,
    };
  }

  let state = createInitialState(seed);
  for (let i = 0; i < moves.length; i++) {
    if (!state.current) {
      // 直前の spawnNext で gameover か、turnLimit に達して current=null。
      // それ以降の手は物理的に打てないので弾く。
      return { ok: false, reason: `move ${i}: game already ended` };
    }
    const move = moves[i]!;
    const placed = {
      ...state.current,
      axisCol: move.axisCol,
      rotation: move.rotation,
    };
    if (!canPlace(state.field, placed)) {
      return {
        ok: false,
        reason: `move ${i}: cannot place (col=${move.axisCol}, rot=${move.rotation})`,
      };
    }
    const locked = lockActive(state.field, placed);
    const { finalField, steps, totalScore } = resolveChain(locked);
    const resolved = {
      ...state,
      field: finalField,
      current: null,
      score: state.score + totalScore,
      chainCount: steps.length,
      totalChains: state.totalChains + steps.length,
      maxChain: Math.max(state.maxChain, steps.length),
      status: 'resolving' as const,
    };
    const atLimit = i + 1 >= limit;
    state = atLimit ? resolved : spawnNext(resolved);
  }

  // claimedScore は client が計算した値。Number 同士の単純比較で判定する
  // (連鎖計算は整数演算しか伴わないので浮動小数誤差は出ない)。
  if (state.score !== claimedScore) {
    return {
      ok: false,
      reason: `score mismatch: claimed=${claimedScore}, simulated=${state.score}`,
    };
  }

  return { ok: true, score: state.score, turnsPlayed: moves.length };
}

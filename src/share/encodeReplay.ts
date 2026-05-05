// Score モードのリプレイを URL に乗せるためのエンコード / デコード。
// (seed + turnLimit + moves[]) を base64url 化した固定スキーマで扱う。
//
// バイナリレイアウト (little-endian):
//   [0]    version (uint8) = 1
//   [1]    mode    (uint8)  0='score', 1='match'(将来用)
//   [2..3] turnLimit (uint16)  0='unlimited', それ以外は数値そのまま
//   [4..7] seed (int32)
//   [8..9] moveCount (uint16)
//   [10..] moves (1 byte each)
//          上位 3 bit axisCol (0..5) / 中位 2 bit rotation (0..3) / 下位 3 bit unused
//
// 200 手で合計 210 byte → base64url で約 280 文字。`?replay=` で運ぶ。

import type { Move } from '../game/types';
import type { MatchRecord } from '../match/records';
import { createInitialState, spawnNext } from '../game/state';
import { lockActive } from '../game/landing';
import { resolveChain } from '../game/chain';

export const REPLAY_PARAM = 'replay';

export interface ReplayData {
  version: number;
  mode: 'score' | 'match';
  /** 0 = unlimited、それ以外は手数。 */
  turnLimit: number;
  seed: number;
  moves: Move[];
}

const HEADER_BYTES = 10;
const VERSION = 1;

function packMove(m: Move): number {
  // axisCol: 0..5 (3 bits), rotation: 0..3 (2 bits)。範囲外はマスクで丸める。
  const c = m.axisCol & 0b111;
  const r = m.rotation & 0b11;
  return (c << 5) | (r << 3);
}

function unpackMove(b: number): Move {
  const c = (b >> 5) & 0b111;
  const r = (b >> 3) & 0b11;
  return { axisCol: c, rotation: r as Move['rotation'] };
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  // base64 → URL-safe: '+' → '-', '/' → '_', パディング '=' は除去。
  return btoa(bin).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function base64UrlToBytes(s: string): Uint8Array {
  // 逆変換 + パディング復元。長さが 4 の倍数になるよう '=' を補う。
  const b64 = s.replaceAll('-', '+').replaceAll('_', '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function encodeReplay(data: ReplayData): string {
  const moveCount = data.moves.length;
  const buf = new Uint8Array(HEADER_BYTES + moveCount);
  const view = new DataView(buf.buffer);
  view.setUint8(0, VERSION);
  view.setUint8(1, data.mode === 'match' ? 1 : 0);
  view.setUint16(2, data.turnLimit, true);
  view.setInt32(4, data.seed, true);
  view.setUint16(8, moveCount, true);
  for (let i = 0; i < moveCount; i++) {
    buf[HEADER_BYTES + i] = packMove(data.moves[i]!);
  }
  return bytesToBase64Url(buf);
}

export function decodeReplay(encoded: string): ReplayData | null {
  try {
    const buf = base64UrlToBytes(encoded);
    if (buf.length < HEADER_BYTES) return null;
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const version = view.getUint8(0);
    if (version !== VERSION) return null; // 将来拡張の足がかり。今は v1 のみ。
    const modeByte = view.getUint8(1);
    const turnLimit = view.getUint16(2, true);
    const seed = view.getInt32(4, true);
    const moveCount = view.getUint16(8, true);
    if (buf.length < HEADER_BYTES + moveCount) return null;
    const moves: Move[] = [];
    for (let i = 0; i < moveCount; i++) {
      moves.push(unpackMove(buf[HEADER_BYTES + i]!));
    }
    return {
      version,
      mode: modeByte === 1 ? 'match' : 'score',
      turnLimit,
      seed,
      moves,
    };
  } catch {
    return null;
  }
}

// URL 経由で受け取った ReplayData を、`store.loadRecord` がそのまま食える
// 形の MatchRecord に変換する。実プレイのスコア・連鎖回数を再現するために
// playerMoves を順に適用して最終スコアを計算する。MatchRecord の必須フィールド
// (id / createdAt / buildSha) はリプレイ識別用の合成値で埋める。
export function replayDataToRecord(data: ReplayData): MatchRecord {
  // turnLimit=0 は 'unlimited' のセンチネル (records.ts 仕様)。Infinity に。
  const limit = data.turnLimit === 0 ? Infinity : data.turnLimit;
  let state = createInitialState(data.seed);
  for (let i = 0; i < data.moves.length; i++) {
    if (!state.current) break;
    const move = data.moves[i]!;
    const placed = {
      ...state.current,
      axisCol: move.axisCol,
      rotation: move.rotation,
    };
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
    // turnLimit に達したターンは spawn しない (ライブ進行と一致させる)。
    const atLimit = i + 1 >= limit;
    state = atLimit ? resolved : spawnNext(resolved);
  }
  return {
    id: 'url-replay-' + Date.now().toString(36),
    createdAt: new Date().toISOString(),
    buildSha: 'replay',
    mode: data.mode,
    turnLimit: data.turnLimit,
    preset: '',
    seed: data.seed,
    playerScore: state.score,
    aiScore: 0,
    winner: 'player',
    playerMoves: data.moves,
    aiMoves: [],
  };
}

export function buildReplayUrl(encoded: string): string {
  const url = new URL(window.location.href);
  // `?share=` 等の他のクエリは温存しないで、replay 単体の URL にする
  // (受け取り側で「これはリプレイ URL」とすぐ分かる方が誤解が少ない)。
  const out = new URL(url.origin + url.pathname);
  out.searchParams.set(REPLAY_PARAM, encoded);
  return out.toString();
}

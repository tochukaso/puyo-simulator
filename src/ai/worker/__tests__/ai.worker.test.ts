import { describe, it, expect } from 'vitest';
import { handleMessage } from '../ai.worker';
import { createInitialState } from '../../../game/state';

describe('ai.worker handleMessage', () => {
  it('suggest with default (heuristic) returns moves', async () => {
    const sent: unknown[] = [];
    const state = createInitialState(1);
    await handleMessage({ type: 'suggest', id: 7, state, topK: 3 }, (r) => sent.push(r));
    expect(sent).toHaveLength(1);
    const r = sent[0] as { type: string; id: number; moves: unknown[] };
    expect(r.type).toBe('suggest');
    expect(r.id).toBe(7);
    expect(r.moves.length).toBeGreaterThan(0);
  });

  it('set-ai heuristic always succeeds', async () => {
    const sent: unknown[] = [];
    await handleMessage({ type: 'set-ai', kind: 'heuristic' }, (r) => sent.push(r));
    const r = sent[0] as { type: string; ok: boolean };
    expect(r.type).toBe('set-ai');
    expect(r.ok).toBe(true);
  });

  it('set-ai ml falls back to heuristic on load error and reports ok=false', async () => {
    const sent: unknown[] = [];
    await handleMessage({ type: 'set-ai', kind: 'ml' }, (r) => sent.push(r));
    const r = sent[0] as { type: string; ok: boolean; error?: string };
    expect(r.type).toBe('set-ai');
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
    const state = createInitialState(1);
    await handleMessage({ type: 'suggest', id: 1, state, topK: 1 }, (r2) => sent.push(r2));
    const r2 = sent[1] as { type: string; moves: unknown[] };
    expect(r2.moves.length).toBeGreaterThan(0);
  });
});

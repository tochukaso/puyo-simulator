import { describe, it, expect } from 'vitest';
import { handleMessage } from '../ai.worker';
import { createInitialState } from '../../../game/state';

describe('ai.worker handleMessage', () => {
  it('suggest with default (heuristic) returns moves', async () => {
    const sent: unknown[] = [];
    const state = createInitialState(1);
    await handleMessage({ type: 'suggest', id: 7, state, topK: 3 }, (r) => sent.push(r));
    const r = sent[0] as { type: string; moves: unknown[] };
    expect(r.type).toBe('suggest');
    expect(r.moves.length).toBeGreaterThan(0);
  });

  it('set-ai heuristic always succeeds', async () => {
    const sent: unknown[] = [];
    await handleMessage({ type: 'set-ai', kind: 'heuristic' }, (r) => sent.push(r));
    expect((sent[0] as { ok: boolean }).ok).toBe(true);
  });

  it('set-ai ml-v1 falls back to heuristic on load error', async () => {
    const sent: unknown[] = [];
    await handleMessage({ type: 'set-ai', kind: 'ml-v1' }, (r) => sent.push(r));
    const r = sent[0] as { ok: boolean; error?: string };
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it('set-ai ml-ama-v1 falls back to heuristic on load error', async () => {
    const sent: unknown[] = [];
    await handleMessage({ type: 'set-ai', kind: 'ml-ama-v1' }, (r) => sent.push(r));
    const r = sent[0] as { ok: boolean; error?: string };
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
  });
});

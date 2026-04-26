import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync } from 'node:fs';
import { createInitialState } from '../../../game/state';
import type { createNodeMlSearchAI } from '../../../../scripts/ml-ai-node';

const MODEL_OK = existsSync('public/models/policy-ama-v2/model.json');

type NodeMlSearchAI = Awaited<ReturnType<typeof createNodeMlSearchAI>>;

// MlSearchAI uses TF.js via dynamic import; in vitest jsdom it picks up
// `@tensorflow/tfjs` which can't load a graph model from a relative path
// without a fetch impl. Use the `createNodeMlSearchAI` factory which wires
// `@tensorflow/tfjs-node` instead.
describe.runIf(MODEL_OK)('MlSearchAI (via Node factory)', () => {
  let ai: NodeMlSearchAI;

  beforeAll(async () => {
    const { createNodeMlSearchAI } = await import('../../../../scripts/ml-ai-node');
    ai = await createNodeMlSearchAI('public/models/policy-ama-v2/model.json');
  }, 120_000);

  it('returns one legal move on the empty board', async () => {
    const state = createInitialState(7);
    const moves = await ai.suggest(state, 1);
    expect(moves.length).toBe(1);
    expect(moves[0]!.axisCol).toBeGreaterThanOrEqual(0);
    expect(moves[0]!.axisCol).toBeLessThanOrEqual(5);
  }, 60_000);
});

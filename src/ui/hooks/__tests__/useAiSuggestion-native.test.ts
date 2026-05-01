import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../ai/native-ama/native-ama-ai', () => {
  const suggest = vi.fn().mockResolvedValue([
    { axisCol: 3, rotation: 1, score: 999 },
  ]);
  const setPreset = vi.fn().mockResolvedValue(undefined);
  class FakeNativeAmaAI {
    static isAvailable = vi.fn().mockReturnValue(true);
    preset = 'build';
    async init() {}
    async setPreset(p: string) {
      this.preset = p;
      return setPreset(p);
    }
    async suggest(...args: unknown[]) { return suggest(...args); }
    async suggestWithScores() { return []; }
    dispose() {}
  }
  return { NativeAmaAI: FakeNativeAmaAI, __suggest: suggest, __setPreset: setPreset };
});

describe('useAiSuggestion native dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('setAiKind("ama-native") does not throw', async () => {
    const { setAiKind } = await import('../useAiSuggestion');
    expect(() => setAiKind('ama-native')).not.toThrow();
  });
});

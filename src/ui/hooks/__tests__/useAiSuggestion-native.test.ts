import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../ai/native-ama/native-ama-ai', () => {
  const suggest = vi.fn().mockResolvedValue([
    { axisCol: 3, rotation: 1, score: 999 },
  ]);
  class FakeNativeAmaAI {
    static isAvailable = vi.fn().mockReturnValue(true);
    async init() {}
    async suggest(...args: unknown[]) { return suggest(...args); }
    async suggestWithScores() { return []; }
    dispose() {}
  }
  return { NativeAmaAI: FakeNativeAmaAI, __suggest: suggest };
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

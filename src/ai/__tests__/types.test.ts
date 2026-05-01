import { describe, it, expect } from 'vitest';
import type { AiKind } from '../types';

describe('AiKind', () => {
  it('includes ama-native', () => {
    const k: AiKind = 'ama-native';
    expect(k).toBe('ama-native');
  });
});

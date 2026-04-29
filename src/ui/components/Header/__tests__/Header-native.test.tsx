import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Header } from '../Header';

vi.mock('../../../hooks/useAiSuggestion', () => ({
  setAiKind: vi.fn(),
  useAiSuggestion: () => ({ moves: [], loading: false }),
}));

vi.mock('../../../../ai/native-ama/native-ama-ai', () => ({
  NativeAmaAI: { isAvailable: vi.fn() },
}));

describe('Header ama-native option', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does NOT render ama-native option in non-Tauri env', async () => {
    const { NativeAmaAI } = await import('../../../../ai/native-ama/native-ama-ai');
    (NativeAmaAI.isAvailable as ReturnType<typeof vi.fn>).mockReturnValue(false);
    render(<Header />);
    expect(screen.queryByRole('option', { name: /ama \(Native\)/ })).toBeNull();
  });

  it('renders ama-native option in Tauri env', async () => {
    const { NativeAmaAI } = await import('../../../../ai/native-ama/native-ama-ai');
    (NativeAmaAI.isAvailable as ReturnType<typeof vi.fn>).mockReturnValue(true);
    render(<Header />);
    expect(screen.queryByRole('option', { name: /ama \(Native\)/ })).not.toBeNull();
  });
});

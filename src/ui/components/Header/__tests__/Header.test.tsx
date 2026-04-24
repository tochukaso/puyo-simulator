import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Header } from '../Header';

vi.mock('../../../hooks/useAiSuggestion', () => ({
  setAiKind: vi.fn(),
  useAiSuggestion: () => ({ moves: [], loading: false }),
}));

describe('Header AI selector', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to heuristic when localStorage is empty', () => {
    render(<Header />);
    const select = screen.getByLabelText('AI') as HTMLSelectElement;
    expect(select.value).toBe('heuristic');
  });

  it('reads saved choice from localStorage', () => {
    localStorage.setItem('puyo.ai.kind', 'ml');
    render(<Header />);
    const select = screen.getByLabelText('AI') as HTMLSelectElement;
    expect(select.value).toBe('ml');
  });

  it('persists change to localStorage and calls setAiKind', async () => {
    const { setAiKind } = (await import('../../../hooks/useAiSuggestion')) as unknown as {
      setAiKind: ReturnType<typeof vi.fn>;
    };
    render(<Header />);
    await userEvent.selectOptions(screen.getByLabelText('AI'), 'ml');
    expect(localStorage.getItem('puyo.ai.kind')).toBe('ml');
    expect(setAiKind).toHaveBeenCalledWith('ml');
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Header } from '../Header';

vi.mock('../../../hooks/useAiSuggestion', () => ({
  setAiKind: vi.fn(),
  useAiSuggestion: () => ({ moves: [], loading: false }),
}));

describe('Header AI selector (3-way)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to ml-ama-v1 when localStorage is empty', () => {
    render(<Header />);
    const select = screen.getByLabelText('AI') as HTMLSelectElement;
    expect(select.value).toBe('ml-ama-v1');
  });

  it('reads ml-v1 from localStorage', () => {
    localStorage.setItem('puyo.ai.kind', 'ml-v1');
    render(<Header />);
    const select = screen.getByLabelText('AI') as HTMLSelectElement;
    expect(select.value).toBe('ml-v1');
  });

  it('reads heuristic from localStorage', () => {
    localStorage.setItem('puyo.ai.kind', 'heuristic');
    render(<Header />);
    const select = screen.getByLabelText('AI') as HTMLSelectElement;
    expect(select.value).toBe('heuristic');
  });

  it('persists change to localStorage and calls setAiKind', async () => {
    const { setAiKind } = (await import('../../../hooks/useAiSuggestion')) as unknown as {
      setAiKind: ReturnType<typeof vi.fn>;
    };
    render(<Header />);
    await userEvent.selectOptions(screen.getByLabelText('AI'), 'ml-v1');
    expect(localStorage.getItem('puyo.ai.kind')).toBe('ml-v1');
    expect(setAiKind).toHaveBeenCalledWith('ml-v1');
  });
});

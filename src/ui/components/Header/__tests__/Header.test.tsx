import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Header } from '../Header';
import { setTrainerMode } from '../../../hooks/useTrainerMode';

vi.mock('../../../hooks/useAiSuggestion', () => ({
  setAiKind: vi.fn(),
  useAiSuggestion: () => ({ moves: [], loading: false }),
}));

describe('Header', () => {
  beforeEach(() => {
    localStorage.clear();
    setTrainerMode('gtr');
  });

  it('does not render an AI model selector', () => {
    render(<Header />);
    // 訓練ラベルも AI 選択もないので、AI / 訓練 という aria-label の <select> は存在しない
    expect(screen.queryByLabelText('AI')).toBeNull();
    expect(screen.queryByLabelText('訓練')).toBeNull();
  });

  it('renders Ghost and Ceiling checkboxes', () => {
    render(<Header />);
    expect(screen.getByLabelText('Ghost')).toBeInTheDocument();
    expect(screen.getByLabelText('Ceiling')).toBeInTheDocument();
  });

  it('defaults trainer template select to GTR', () => {
    render(<Header />);
    const select = screen.getByLabelText('Template') as HTMLSelectElement;
    expect(select.value).toBe('gtr');
  });

  it('switches AI engine variant when trainer template changes', async () => {
    const { setAiKind } = (await import('../../../hooks/useAiSuggestion')) as unknown as {
      setAiKind: ReturnType<typeof vi.fn>;
    };
    setAiKind.mockClear();
    render(<Header />);
    // 初回 effect で gtr-only が呼ばれる
    expect(setAiKind).toHaveBeenLastCalledWith('ama-wasm', 'gtr', 'gtr-only');
    await userEvent.selectOptions(screen.getByLabelText('Template'), 'off');
    expect(setAiKind).toHaveBeenLastCalledWith('ama-wasm', 'build', 'default');
  });
});

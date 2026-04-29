import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Header } from '../Header';
import { setTrainerMode } from '../../../hooks/useTrainerMode';

vi.mock('../../../hooks/useAiSuggestion', () => ({
  setAiKind: vi.fn(),
  useAiSuggestion: () => ({ moves: [], loading: false }),
}));

// Header refactor: ghost/ceiling/trainer/language controls were moved into the
// HamburgerMenu dropdown. These tests render Header (which mounts the menu)
// and open the hamburger first before asserting on the moved controls.
describe('Header', () => {
  beforeEach(() => {
    localStorage.clear();
    setTrainerMode('gtr');
  });

  it('does not render an AI model selector', () => {
    render(<Header />);
    expect(screen.queryByLabelText('AI')).toBeNull();
    expect(screen.queryByLabelText('訓練')).toBeNull();
  });

  it('renders Ghost and Ceiling checkboxes inside the hamburger menu', async () => {
    render(<Header />);
    await userEvent.click(screen.getByLabelText('Menu'));
    expect(screen.getByLabelText('Ghost')).toBeInTheDocument();
    expect(screen.getByLabelText('Ceiling')).toBeInTheDocument();
  });

  it('defaults trainer template select to GTR', async () => {
    render(<Header />);
    await userEvent.click(screen.getByLabelText('Menu'));
    const select = screen.getByLabelText('Template') as HTMLSelectElement;
    expect(select.value).toBe('gtr');
  });

  it('switches preset on the unified ama-wasm when trainer template changes', async () => {
    const { setAiKind } = (await import('../../../hooks/useAiSuggestion')) as unknown as {
      setAiKind: ReturnType<typeof vi.fn>;
    };
    setAiKind.mockClear();
    render(<Header />);
    // Initial effect should call setAiKind with preset='gtr' (no menu open needed).
    expect(setAiKind).toHaveBeenLastCalledWith('ama-wasm', 'gtr');

    await userEvent.click(screen.getByLabelText('Menu'));
    await userEvent.selectOptions(screen.getByLabelText('Template'), 'off');
    expect(setAiKind).toHaveBeenLastCalledWith('ama-wasm', 'build');
    await userEvent.selectOptions(screen.getByLabelText('Template'), 'kaidan');
    expect(setAiKind).toHaveBeenLastCalledWith('ama-wasm', 'kaidan');
  });
});

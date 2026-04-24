import { useEffect } from 'react';
import { useGameStore } from '../store';

export function useKeyboard() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const { dispatch, commit, game, undo } = useGameStore.getState();
      switch (e.key) {
        case 'ArrowLeft':
          dispatch({ type: 'moveLeft' });
          break;
        case 'ArrowRight':
          dispatch({ type: 'moveRight' });
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (game.current)
            commit({ axisCol: game.current.axisCol, rotation: game.current.rotation });
          break;
        case 'x':
        case 'X':
          dispatch({ type: 'rotateCW' });
          break;
        case 'z':
        case 'Z':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            undo(1);
          } else {
            dispatch({ type: 'rotateCCW' });
          }
          break;
        case 'u':
        case 'U':
          undo(1);
          break;
        case 'ArrowDown':
          dispatch({ type: 'softDrop' });
          break;
        case ' ':
          e.preventDefault();
          if (game.current)
            commit({ axisCol: game.current.axisCol, rotation: game.current.rotation });
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}

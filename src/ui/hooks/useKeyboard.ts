import { useEffect } from 'react';
import { useGameStore } from '../store';

export function useKeyboard() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const { dispatch, commit, game } = useGameStore.getState();
      switch (e.key) {
        case 'ArrowLeft': dispatch({ type: 'moveLeft' }); break;
        case 'ArrowRight': dispatch({ type: 'moveRight' }); break;
        case 'ArrowUp': case 'x': case 'X':
          dispatch({ type: 'rotateCW' }); break;
        case 'z': case 'Z':
          dispatch({ type: 'rotateCCW' }); break;
        case 'ArrowDown': dispatch({ type: 'softDrop' }); break;
        case ' ':
          e.preventDefault();
          if (game.current) commit({ axisCol: game.current.axisCol, rotation: game.current.rotation });
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}

import { useEffect, useRef } from 'react';
import { useGameStore } from '../store';
import { vibrateCommit, vibrateChain } from '../feedback/haptics';

// Subscribes to the game store and emits haptic feedback at two events:
//   - The active pair just locked into the field (game.current went from
//     non-null → null while resolving the next chain).
//   - chainCount incremented during the resolveChain animation.
//
// Mounted once near the top of the React tree (App.tsx).
export function useHaptics(): void {
  const lastChainCountRef = useRef(0);
  const lastCurrentNullRef = useRef<boolean>(
    useGameStore.getState().game.current === null,
  );

  useEffect(() => {
    const unsub = useGameStore.subscribe((st) => {
      const currentNull = st.game.current === null;
      if (currentNull && !lastCurrentNullRef.current) {
        vibrateCommit();
      }
      lastCurrentNullRef.current = currentNull;

      const cc = st.game.chainCount;
      if (cc > lastChainCountRef.current) {
        vibrateChain(cc);
      }
      lastChainCountRef.current = cc;
    });
    return unsub;
  }, []);
}

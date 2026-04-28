import { useEffect, useRef } from 'react';
import { useKeyboard } from './ui/hooks/useKeyboard';
import { useGestures } from './ui/hooks/useGestures';
import { useMatchDriver } from './ui/hooks/useMatchDriver';
import { useGameStore } from './ui/store';
import { Board } from './ui/components/Board/Board';
import { NextQueue } from './ui/components/NextQueue/NextQueue';
import { Stats } from './ui/components/Stats/Stats';
import { Controls } from './ui/components/Controls/Controls';
import { CandidateList } from './ui/components/CandidateList/CandidateList';
import { Header } from './ui/components/Header/Header';
import { MatchPanel } from './ui/components/MatchPanel/MatchPanel';

export default function App() {
  const gestureRef = useRef<HTMLDivElement>(null);
  useKeyboard();
  useGestures(gestureRef);
  useMatchDriver();
  // If the user reloaded while in match mode, the persisted `mode='match'`
  // wakes up without an `aiGame`. Kick off a fresh match so both sides spawn
  // from the same seed instead of leaving the AI side null.
  useEffect(() => {
    const st = useGameStore.getState();
    if (st.mode === 'match' && !st.aiGame) {
      st.startMatch({ turnLimit: st.matchTurnLimit });
    }
  }, []);
  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      <Header />
      <div
        ref={gestureRef}
        className="flex-1 flex flex-col items-center gap-3 p-3 lg:flex-row lg:items-start lg:justify-center select-none"
        style={{ touchAction: 'none' }}
      >
        <div className="flex flex-col items-center gap-3 w-full max-w-sm">
          <Stats />
          <MatchPanel />
          <div className="flex gap-3 items-stretch justify-center w-full">
            <Board />
            <div className="flex flex-col gap-2 w-32 shrink-0" data-no-gesture>
              <NextQueue />
              <div className="mt-auto">
                <CandidateList />
              </div>
            </div>
          </div>
          <Controls />
        </div>
      </div>
    </div>
  );
}

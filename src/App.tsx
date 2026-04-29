import { useEffect, useRef } from 'react';
import { useKeyboard } from './ui/hooks/useKeyboard';
import { useGestures } from './ui/hooks/useGestures';
import { useMatchDriver } from './ui/hooks/useMatchDriver';
import { useGameStore } from './ui/store';
import {
  readShareFromUrl,
  decodeShare,
  clearShareFromUrl,
} from './share/encode';
import { Board } from './ui/components/Board/Board';
import { NextQueue } from './ui/components/NextQueue/NextQueue';
import { Stats } from './ui/components/Stats/Stats';
import { Controls } from './ui/components/Controls/Controls';
import { CandidateList } from './ui/components/CandidateList/CandidateList';
import { Header } from './ui/components/Header/Header';
import { MatchPanel } from './ui/components/MatchPanel/MatchPanel';
import { EditToolbar } from './ui/components/EditToolbar/EditToolbar';
import { EditPairs } from './ui/components/EditPairs/EditPairs';

export default function App() {
  const gestureRef = useRef<HTMLDivElement>(null);
  useKeyboard();
  useGestures(gestureRef);
  useMatchDriver();
  const editing = useGameStore((s) => s.editing);
  const mode = useGameStore((s) => s.mode);
  // 起動時 URL に `?share=...` が乗っていたらそれを優先して盤面ロード。
  // 共有を踏んだ時は match を続行せず free に切替えるのが直感的なので
  // loadSharedPosition 側で handle 済み。失敗時はサイレントに無視。
  useEffect(() => {
    const encoded = readShareFromUrl();
    if (encoded) {
      const pos = decodeShare(encoded);
      if (pos) {
        useGameStore.getState().loadSharedPosition({
          field: pos.field,
          current: pos.current,
          next1: pos.next1,
          next2: pos.next2,
        });
        clearShareFromUrl();
        return; // match モード復元はスキップ
      }
      clearShareFromUrl();
    }
    // If the user reloaded while in match mode, the persisted `mode='match'`
    // wakes up without an `aiGame`. Kick off a fresh match so both sides spawn
    // from the same seed instead of leaving the AI side null.
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
              {/* 編集モード中はペア編集カードを優先表示。NextQueue はゲーム中の
                  情報源で編集と概念が違うので入れ替える方が混乱しない。 */}
              {editing ? <EditPairs /> : <NextQueue />}
              {/* match モード中は AI 候補手を出さない (対人戦の趣旨を壊すので)。
                  free モード = サンドボックス的にぷよ研究するためのモードなので
                  そちらでは引き続き表示する。 */}
              {!editing && mode !== 'match' && (
                <div className="mt-auto">
                  <CandidateList />
                </div>
              )}
            </div>
          </div>
          {/* 編集中は通常 Controls の代わりに EditToolbar を出す。下半分の
              スペース(親指のレストポジション)を編集 UI に明け渡す。 */}
          {editing ? <EditToolbar /> : <Controls />}
        </div>
      </div>
    </div>
  );
}

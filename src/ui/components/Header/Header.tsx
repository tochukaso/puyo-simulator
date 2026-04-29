import { useEffect, useState } from 'react';
import { setAiKind } from '../../hooks/useAiSuggestion';
import { ShareDialog } from '../ShareDialog/ShareDialog';
import { HamburgerMenu } from '../HamburgerMenu/HamburgerMenu';
import { useTrainerMode } from '../../hooks/useTrainerMode';
import { useGameStore, type GameMode, type MatchTurnLimit } from '../../store';
import { useT } from '../../../i18n';

export function Header() {
  const trainer = useTrainerMode();
  const t = useT();
  const mode = useGameStore((s) => s.mode);
  const matchTurnLimit = useGameStore((s) => s.matchTurnLimit);
  const setGameMode = useGameStore((s) => s.setGameMode);
  const setMatchTurnLimit = useGameStore((s) => s.setMatchTurnLimit);
  const startMatch = useGameStore((s) => s.startMatch);
  const editing = useGameStore((s) => s.editing);
  const enterEditMode = useGameStore((s) => s.enterEditMode);
  const exitEditMode = useGameStore((s) => s.exitEditMode);
  const [shareOpen, setShareOpen] = useState(false);

  // ama-wasm に統一。trainer mode に応じて preset (form 集合 + weight) を切替。
  // セレクタ自体は HamburgerMenu に移したが、trainer state はグローバル
  // (useTrainerMode hook) なので、ここで購読していても問題ない。
  useEffect(() => {
    if (trainer === 'gtr') {
      setAiKind('ama-wasm', 'gtr');
    } else if (trainer === 'kaidan') {
      setAiKind('ama-wasm', 'kaidan');
    } else {
      setAiKind('ama-wasm', 'build');
    }
  }, [trainer]);

  return (
    <header className="relative p-3 border-b border-slate-800 flex flex-wrap justify-between items-center gap-3">
      <span className="text-lg flex items-baseline gap-2">
        {t('app.title')}
        <span
          className="text-xs text-slate-500 font-mono"
          title={`Built ${__BUILD_TIME__}`}
        >
          v{__BUILD_SHA__}
        </span>
      </span>
      <div className="flex flex-wrap items-center gap-3">
        <select
          aria-label={t('header.gameMode')}
          value={mode}
          onChange={(e) => {
            const next = e.target.value as GameMode;
            if (next === 'match' && mode !== 'match') {
              startMatch({ turnLimit: matchTurnLimit });
            } else {
              setGameMode(next);
            }
          }}
          className="bg-slate-800 text-slate-100 border border-slate-700 rounded px-2 py-1 text-sm"
        >
          <option value="free">{t('header.modeFree')}</option>
          <option value="match">{t('header.modeMatch')}</option>
        </select>
        {mode === 'match' && (
          <select
            aria-label={t('header.turnLimit')}
            value={matchTurnLimit}
            onChange={(e) => {
              const limit = (Number(e.target.value) as MatchTurnLimit);
              setMatchTurnLimit(limit);
              startMatch({ turnLimit: limit });
            }}
            className="bg-slate-800 text-slate-100 border border-slate-700 rounded px-2 py-1 text-sm"
          >
            <option value="30">30</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
        )}
        {/* 編集モードトグル。マッチ中に編集に入ろうとしたら 1 回だけ確認を出す
            (マッチを抜けて編集に入る方針。盤面が変わるので再開不可)。 */}
        <button
          type="button"
          onClick={() => {
            if (editing) {
              exitEditMode(true);
              return;
            }
            if (mode === 'match') {
              if (!confirm(t('edit.matchExitConfirm'))) return;
              setGameMode('free');
            }
            enterEditMode();
          }}
          aria-pressed={editing}
          className={`px-3 py-1 rounded text-sm border ${
            editing
              ? 'bg-blue-600 border-blue-400 text-white'
              : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
          }`}
        >
          {editing ? t('edit.editing') : t('edit.edit')}
        </button>
        <button
          type="button"
          onClick={() => setShareOpen(true)}
          aria-label={t('share.button')}
          className="px-3 py-1 rounded text-sm border bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700"
        >
          {t('share.button')}
        </button>
        {shareOpen && <ShareDialog onClose={() => setShareOpen(false)} />}
        {/* 設定 (ghost / ceiling / trainer / 言語) と解析起動はハンバーガーへ。
            Header を主要アクション (mode 切替・編集・共有) のみに圧縮した。 */}
        <HamburgerMenu />
      </div>
    </header>
  );
}

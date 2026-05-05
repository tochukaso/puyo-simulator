import { useEffect } from 'react';
import { setAiKind } from '../../hooks/useAiSuggestion';
import { HamburgerMenu } from '../HamburgerMenu/HamburgerMenu';
import { useTrainerMode } from '../../hooks/useTrainerMode';
import { useGameStore, type GameMode, type MatchTurnLimit } from '../../store';
import { useT } from '../../../i18n';
import { confirmDialog } from '../../utils/dialog';
import { NativeAmaAI } from '../../../ai/native-ama/native-ama-ai';
import type { AiKind } from '../../../ai/types';

// In a Tauri build the same beam search runs as a native static-linked C++
// library (ama-native, < 200ms p99 on Intel Mac), bypassing the worker. In
// the PWA there's no native binary, so we keep ama-wasm. setAiKind() falls
// back transparently if a Tauri-only kind is requested in the browser, but
// resolving here avoids the warning log on every trainer change.
const AMA_KIND: AiKind = NativeAmaAI.isAvailable() ? 'ama-native' : 'ama-wasm';

export function Header() {
  const trainer = useTrainerMode();
  const t = useT();
  const mode = useGameStore((s) => s.mode);
  const matchTurnLimit = useGameStore((s) => s.matchTurnLimit);
  const setGameMode = useGameStore((s) => s.setGameMode);
  const setMatchTurnLimit = useGameStore((s) => s.setMatchTurnLimit);
  const startMatch = useGameStore((s) => s.startMatch);
  const startScore = useGameStore((s) => s.startScore);
  const startDaily = useGameStore((s) => s.startDaily);
  const editing = useGameStore((s) => s.editing);
  const enterEditMode = useGameStore((s) => s.enterEditMode);
  const exitEditMode = useGameStore((s) => s.exitEditMode);

  // ama に統一(Tauri なら ama-native、PWA なら ama-wasm)。trainer mode に
  // 応じて preset (form 集合 + weight) を切替。セレクタ自体は HamburgerMenu
  // に移したが、trainer state はグローバル (useTrainerMode hook) なので、
  // ここで購読していても問題ない。
  useEffect(() => {
    const preset =
      trainer === 'gtr' ? 'gtr' : trainer === 'kaidan' ? 'kaidan' : 'build';
    setAiKind(AMA_KIND, preset);
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
              // match モードに 'unlimited' / 200 はそのまま渡せないので、
              // startMatch 側で 100 にフォールバックさせる。
              startMatch({ turnLimit: matchTurnLimit });
            } else if (next === 'score' && mode !== 'score') {
              startScore({ turnLimit: matchTurnLimit });
            } else if (next === 'daily' && mode !== 'daily') {
              // デイリーは seed / turnLimit ともに固定なので opts 不要。
              startDaily();
            } else {
              setGameMode(next);
            }
          }}
          className="bg-slate-800 text-slate-100 border border-slate-700 rounded px-2 py-1 text-sm"
        >
          <option value="free">{t('header.modeFree')}</option>
          <option value="match">{t('header.modeMatch')}</option>
          <option value="score">{t('header.modeScore')}</option>
          <option value="daily">{t('header.modeDaily')}</option>
        </select>
        {/* daily モードは turnLimit が 50 固定なので、ユーザに選択肢を見せない。
            match / score だけ手数セレクタを出す。 */}
        {(mode === 'match' || mode === 'score') && (
          <select
            aria-label={t('header.turnLimit')}
            value={String(matchTurnLimit)}
            onChange={(e) => {
              const raw = e.target.value;
              const limit: MatchTurnLimit =
                raw === 'unlimited'
                  ? 'unlimited'
                  : (Number(raw) as MatchTurnLimit);
              setMatchTurnLimit(limit);
              if (mode === 'match') startMatch({ turnLimit: limit });
              else startScore({ turnLimit: limit });
            }}
            className="bg-slate-800 text-slate-100 border border-slate-700 rounded px-2 py-1 text-sm"
          >
            <option value="30">30</option>
            <option value="50">50</option>
            <option value="100">100</option>
            {mode === 'score' && <option value="200">200</option>}
            {mode === 'score' && (
              <option value="unlimited">{t('header.turnUnlimited')}</option>
            )}
          </select>
        )}
        {/* 編集モードトグル。マッチ中に編集に入ろうとしたら 1 回だけ確認を出す
            (マッチを抜けて編集に入る方針。盤面が変わるので再開不可)。 */}
        <button
          type="button"
          onClick={async () => {
            if (editing) {
              exitEditMode(true);
              return;
            }
            if (mode === 'match' || mode === 'score' || mode === 'daily') {
              if (!(await confirmDialog(t('edit.matchExitConfirm')))) return;
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
        {/* 設定 (ghost / ceiling / trainer / 言語) と share / 解析起動はハンバーガーへ。
            Header を主要アクション (mode 切替・編集) のみに圧縮した。 */}
        <HamburgerMenu />
      </div>
    </header>
  );
}

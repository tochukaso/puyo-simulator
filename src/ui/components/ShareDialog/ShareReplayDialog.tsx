import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { useGameStore } from '../../store';
import {
  buildReplayUrl,
  encodeReplay,
  type ReplayData,
} from '../../../share/encodeReplay';
import { useT } from '../../../i18n';

// score モードのリプレイ (seed + turnLimit + 手順) を URL に埋めて共有する
// モーダル。MatchPanel の試合終了表示から呼ばれる。
export function ShareReplayDialog({ onClose }: { onClose: () => void }) {
  const matchSeed = useGameStore((s) => s.matchSeed);
  const matchTurnLimit = useGameStore((s) => s.matchTurnLimit);
  const matchPlayerMoves = useGameStore((s) => s.matchPlayerMoves);
  const t = useT();

  const [qrSvg, setQrSvg] = useState<string>('');
  const [copied, setCopied] = useState(false);
  // copy 後の "Copied!" 表示を 1.5s 後に戻す timer。連打されると複数の
  // timeout が積み重なり想定外のタイミングで戻る + アンマウント後に setState
  // が走って警告が出るので、ref で管理して再実行前に clear + cleanup する。
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        clearTimeout(copyTimerRef.current);
        copyTimerRef.current = null;
      }
    };
  }, []);

  // 'unlimited' は MatchRecord と同様 0 をセンチネルに。
  const turnLimitNum = matchTurnLimit === 'unlimited' ? 0 : matchTurnLimit;
  const canShare = matchSeed !== null && matchPlayerMoves.length > 0;

  const replayUrl = canShare
    ? buildReplayUrl(
        encodeReplay({
          version: 1,
          mode: 'score',
          seed: matchSeed!,
          turnLimit: turnLimitNum,
          moves: matchPlayerMoves,
        } satisfies ReplayData),
      )
    : '';

  useEffect(() => {
    if (!canShare) return;
    let cancelled = false;
    QRCode.toString(replayUrl, {
      type: 'svg',
      margin: 1,
      color: { dark: '#0f172a', light: '#ffffff' },
    })
      .then((svg) => {
        if (!cancelled) setQrSvg(svg);
      })
      .catch(() => {
        // QR 生成失敗でも URL コピーは引き続き使えるので空のまま。
      });
    return () => {
      cancelled = true;
    };
  }, [replayUrl, canShare]);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(replayUrl);
      setCopied(true);
      // 連打対応: 既存の timer を破棄してから新しいものをセット。
      if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => {
        setCopied(false);
        copyTimerRef.current = null;
      }, 1500);
    } catch {
      // Safari mobile などのフォールバック: input を select してユーザーに任せる。
      const el = document.getElementById(
        'replay-url-input',
      ) as HTMLInputElement | null;
      if (el) {
        el.focus();
        el.select();
      }
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('share.replayTitle')}
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700 rounded-lg p-4 w-full max-w-sm flex flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">{t('share.replayTitle')}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('share.close')}
            className="text-slate-400 hover:text-slate-100 px-2"
          >
            ✕
          </button>
        </div>

        {!canShare ? (
          <p className="text-slate-400 text-sm">{t('share.unavailable')}</p>
        ) : (
          <>
            <div
              className="bg-white rounded p-2 mx-auto w-full max-w-[240px]"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
            <input
              id="replay-url-input"
              readOnly
              value={replayUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100 w-full"
            />
            <button
              type="button"
              onClick={onCopy}
              className="bg-blue-600 hover:bg-blue-500 active:bg-blue-400 rounded px-3 py-2 text-sm font-medium"
            >
              {copied ? t('share.copied') : t('share.replayCopy')}
            </button>
            <p className="text-xs text-slate-500 leading-relaxed">
              {t('share.replayNote')}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

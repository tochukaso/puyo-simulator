import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useGameStore } from '../../store';
import { buildShareUrl, encodeShare } from '../../../share/encode';
import { useT } from '../../../i18n';

// 「いまの盤面を URL / QR で共有する」モーダル。Header の共有ボタンから開く。
// QR は `qrcode` ライブラリで SVG 文字列を生成して dangerouslySetInnerHTML で
// 描画(svg のリサイズ柔軟性 + 軽量さを取った)。
export function ShareDialog({ onClose }: { onClose: () => void }) {
  const game = useGameStore((s) => s.game);
  const t = useT();

  const [qrSvg, setQrSvg] = useState<string>('');
  const [copied, setCopied] = useState(false);

  // 現在の game state を URL にエンコード。`current` が null (gameover 直後など)
  // の場合は active を黒い R 仮置きで埋めてしまうのは混乱の元なので、メッセージ
  // を出して URL は組まない。
  const canShare = !!game.current && game.nextQueue.length >= 2;
  const shareUrl = canShare
    ? buildShareUrl(
        encodeShare({
          field: game.field,
          current: game.current!.pair,
          next1: game.nextQueue[0]!,
          next2: game.nextQueue[1]!,
        }),
      )
    : '';

  useEffect(() => {
    if (!canShare) return;
    let cancelled = false;
    QRCode.toString(shareUrl, {
      type: 'svg',
      margin: 1,
      color: { dark: '#0f172a', light: '#ffffff' },
    })
      .then((svg) => {
        if (!cancelled) setQrSvg(svg);
      })
      .catch(() => {
        // 生成失敗時は QR エリアを単に空にする(URL コピーは引き続き可能)。
      });
    return () => {
      cancelled = true;
    };
  }, [shareUrl, canShare]);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Safari mobile などで clipboard API が制限されているケース。
      // フォールバック: input に select させてコピー操作を委ねる。
      const el = document.getElementById('share-url-input') as HTMLInputElement | null;
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
      aria-label={t('share.title')}
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700 rounded-lg p-4 w-full max-w-sm flex flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">{t('share.title')}</h2>
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
            {/* QR は対角線上で四つ角を囲うよう中央配置 */}
            <div
              className="bg-white rounded p-2 mx-auto w-full max-w-[240px]"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
            <input
              id="share-url-input"
              readOnly
              value={shareUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100 w-full"
            />
            <button
              type="button"
              onClick={onCopy}
              className="bg-blue-600 hover:bg-blue-500 active:bg-blue-400 rounded px-3 py-2 text-sm font-medium"
            >
              {copied ? t('share.copied') : t('share.copy')}
            </button>
            <p className="text-xs text-slate-500 leading-relaxed">
              {t('share.note')}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

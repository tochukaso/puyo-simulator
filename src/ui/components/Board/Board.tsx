import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useGameStore, type PoppingCell, type LandedCell, LANDING_BOUNCE_MS } from '../../store';
import { useGestures } from '../../hooks/useGestures';
import { useAiSuggestion } from '../../hooks/useAiSuggestion';
import { useGhostEnabled, useCeilingVisible } from '../../hooks/useUiPrefs';
import { usePreviewMove } from '../../hooks/useAiPreview';
import { useT } from '../../../i18n';
import { ROWS, COLS, SPAWN_COL, VISIBLE_ROW_START } from '../../../game/constants';
import { PUYO_COLORS, PUYO_LIGHT, PUYO_DARK, BG_COLOR, GRID_COLOR, DANGER_COLOR } from './colors';
import type { Color, Field, ActivePair, Move } from '../../../game/types';
import { ghostCells } from './ghost';

export function Board() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [cell, setCell] = useState(32);
  const game = useGameStore((s) => s.game);
  const poppingCells = useGameStore((s) => s.poppingCells);
  const chainTexts = useGameStore((s) => s.chainTexts);
  const landedCells = useGameStore((s) => s.landedCells);
  const { moves } = useAiSuggestion(5);
  const ghostEnabled = useGhostEnabled();
  const ceilingVisible = useCeilingVisible();
  const previewMove = usePreviewMove();
  const t = useT();
  // CandidateList で hover/選択している候補があればそれを優先表示。なければ
  // トップ候補にフォールバック。
  const bestMove = ghostEnabled ? (previewMove ?? moves[0] ?? null) : null;

  // 天井(row 0)を隠すときは描画全体を 1 セル分上にずらして、
  // canvas / wrapper の高さも 1 セル縮める。row 0 由来の描画(背景帯・
  // DANGER 枠・天井段に居る軸ぷよなど)はクリップで自然に切れる。
  const visibleRows = ceilingVisible ? ROWS : ROWS - 1;
  const yOffset = ceilingVisible ? 0 : -cell;
  const boardWidth = COLS * cell;
  const boardHeight = visibleRows * cell;

  useGestures(wrapperRef);

  useLayoutEffect(() => {
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]!.contentRect.width;
      const maxCellByWidth = Math.floor(w / COLS);
      const maxCellByHeight = Math.floor((window.innerHeight * 0.6) / ROWS);
      setCell(Math.max(16, Math.min(maxCellByWidth, maxCellByHeight, 48)));
    });
    if (wrapperRef.current) ro.observe(wrapperRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    const render = () => {
      const now = Date.now();
      draw(
        ctx,
        game.field,
        game.current,
        cell,
        bestMove,
        poppingCells,
        landedCells,
        yOffset,
        now,
      );
      // 着地アニメ・点滅アニメのどちらかが進行中なら次フレームを予約。
      const hasLandingActive = landedCells.some(
        (c) => now - c.landedAt < LANDING_BOUNCE_MS,
      );
      if (poppingCells.length > 0 || hasLandingActive) {
        rafId = requestAnimationFrame(render);
      }
    };
    render();
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [game, cell, bestMove, poppingCells, landedCells, yOffset]);

  return (
    <div ref={wrapperRef} className="w-full max-w-sm">
      <div
        className="relative mx-auto"
        style={{ width: boardWidth, height: boardHeight }}
      >
        <canvas
          ref={canvasRef}
          width={boardWidth}
          height={boardHeight}
          className="bg-slate-900 block"
        />
        {chainTexts.map((entry) => (
          <div
            key={entry.id}
            className="chain-text-overlay"
            style={{ left: (entry.col + 0.5) * cell, top: (entry.row - 0.5) * cell + yOffset }}
          >
            {t('board.chain', { n: entry.chainIndex })}
          </div>
        ))}
      </div>
    </div>
  );
}

function draw(
  ctx: CanvasRenderingContext2D,
  field: Field,
  current: unknown,
  cell: number,
  bestMove: Move | null,
  poppingCells: readonly PoppingCell[],
  landedCells: readonly LandedCell[],
  yOffset: number,
  now: number,
) {
  // 全体を yOffset (0 or -cell) ずらす。天井隠し時は row 0 由来の描画が
  // canvas 上端より上に逃げ、自動的にクリップされる。
  ctx.save();
  ctx.translate(0, yOffset);

  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, COLS * cell, ROWS * cell);

  ctx.strokeStyle = GRID_COLOR;
  ctx.lineWidth = 1;
  for (let r = 0; r <= ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * cell);
    ctx.lineTo(COLS * cell, r * cell);
    ctx.stroke();
  }
  for (let c = 0; c <= COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * cell, 0);
    ctx.lineTo(c * cell, ROWS * cell);
    ctx.stroke();
  }

  ctx.fillStyle = 'rgba(15, 23, 42, 0.5)';
  ctx.fillRect(0, 0, COLS * cell, VISIBLE_ROW_START * cell);

  ctx.strokeStyle = DANGER_COLOR;
  ctx.lineWidth = 2;
  ctx.strokeRect(SPAWN_COL * cell + 1, 1, cell - 2, cell - 2);

  // Popping ハイライト用の点滅係数。`Date.now()` ベースで rAF から毎フレーム呼ばれる。
  const popPulse = 0.55 + 0.45 * Math.sin(now / 80);
  const popKey = (r: number, c: number) => r * COLS + c;
  const poppingSet = new Set(poppingCells.map((p) => popKey(p.row, p.col)));
  // (r,c) → 一番新しい着地時刻。複数候補があれば一番新しいものを採用。
  const landedAtMap = new Map<number, number>();
  for (const c of landedCells) {
    const k = popKey(c.row, c.col);
    const prev = landedAtMap.get(k) ?? 0;
    if (c.landedAt > prev) landedAtMap.set(k, c.landedAt);
  }

  // 同色隣接の接続バーを先に描く(ぷよ円より下に置きたい)。
  drawConnectors(ctx, field, cell);

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const color = field.cells[r]![c]!;
      if (color === null) continue;
      const baseAlpha = r < VISIBLE_ROW_START ? 0.5 : 1;
      const k = popKey(r, c);
      const landedAt = landedAtMap.get(k);
      const scale =
        landedAt !== undefined ? landingScale(now - landedAt) : ONE_SCALE;
      drawPuyo(ctx, r, c, color, baseAlpha, cell, scale);
      if (poppingSet.has(k)) {
        drawPopHighlight(ctx, r, c, cell, popPulse);
      }
    }
  }

  if (current && typeof current === 'object' && 'pair' in current) {
    const { axisRow, axisCol, rotation, pair } = current as {
      axisRow: number;
      axisCol: number;
      rotation: 0 | 1 | 2 | 3;
      pair: { axis: keyof typeof PUYO_COLORS; child: keyof typeof PUYO_COLORS };
    };
    const offsets: Record<number, [number, number]> = {
      0: [-1, 0],
      1: [0, 1],
      2: [1, 0],
      3: [0, -1],
    };
    const [dr, dc] = offsets[rotation]!;
    // row 0 (高さ13、天井段) は半透明で描画して「ここは実質見えない領域」を示す
    const axisAlpha = axisRow < VISIBLE_ROW_START ? 0.5 : 1;
    const childRow = axisRow + dr;
    const childAlpha = childRow < VISIBLE_ROW_START ? 0.5 : 1;
    drawPuyo(ctx, axisRow, axisCol, pair.axis, axisAlpha, cell);
    drawPuyo(ctx, childRow, axisCol + dc, pair.child, childAlpha, cell);
  }

  const ghost = ghostCells(field, current as ActivePair | null, bestMove);
  if (ghost && current) {
    const { pair } = current as { pair: { axis: Color; child: Color } };
    for (const p of ghost) {
      const color = p.kind === 'axis' ? pair.axis : pair.child;
      drawPuyoGhost(ctx, p.row, p.col, color, cell);
    }
  }

  ctx.restore();
}

// 隣接する同色ぷよ同士を太いバーで繋ぐ(本家ぷよぷよの「連結表現」)。
// バーはぷよ円より下に重ねたいので drawPuyo より先に呼ぶ。
function drawConnectors(ctx: CanvasRenderingContext2D, field: Field, cell: number) {
  const W = cell * 0.55; // バーの太さ。ぷよ円の直径より細くして「首」に見せる。
  const alphaOf = (r: number) => (r < VISIBLE_ROW_START ? 0.5 : 1);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const color = field.cells[r]![c]!;
      if (color === null) continue;
      const hex = PUYO_COLORS[color];
      const cx = c * cell + cell / 2;
      const cy = r * cell + cell / 2;
      if (c + 1 < COLS && field.cells[r]![c + 1] === color) {
        ctx.save();
        ctx.globalAlpha = alphaOf(r);
        ctx.fillStyle = hex;
        ctx.fillRect(cx, cy - W / 2, cell, W);
        ctx.restore();
      }
      if (r + 1 < ROWS && field.cells[r + 1]![c] === color) {
        ctx.save();
        ctx.globalAlpha = Math.min(alphaOf(r), alphaOf(r + 1));
        ctx.fillStyle = hex;
        ctx.fillRect(cx - W / 2, cy, W, cell);
        ctx.restore();
      }
    }
  }
}

// セル中央に「色の頭文字記号」を描画。fontSize はセルの 45%、
// 白文字 + 暗色シャドウでコントラストを確保する。scale で squash 中も変形する。
function drawSymbol(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  letter: Color,
  cell: number,
  scale: PuyoScale,
  alpha: number,
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy);
  ctx.scale(scale.sx, scale.sy);
  const size = Math.round(cell * 0.45);
  ctx.font = `bold ${size}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(2, cell * 0.08);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.strokeText(letter, 0, 0);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(letter, 0, 0);
  ctx.restore();
}

interface PuyoScale {
  sx: number;
  sy: number;
}
const ONE_SCALE: PuyoScale = { sx: 1, sy: 1 };

// 着地直後の squash-stretch。減衰サイン波で 0→0.6 (squish) →1.1 (rebound) →1。
// セルの底に重心がある感じを出すため、変形は底辺基準。
function landingScale(elapsedMs: number): PuyoScale {
  if (elapsedMs <= 0) return { sx: 1.2, sy: 0.65 };
  if (elapsedMs >= LANDING_BOUNCE_MS) return ONE_SCALE;
  const t = elapsedMs / LANDING_BOUNCE_MS;
  // 減衰係数を強めにして「短く軽い弾み」にする。
  const offset = -0.35 * Math.exp(-4.5 * t) * Math.cos(8 * t);
  const sy = 1 + offset;
  const sx = 1 - offset * 0.6;
  return { sx, sy };
}

function drawPuyo(
  ctx: CanvasRenderingContext2D,
  row: number,
  col: number,
  color: Color,
  alpha: number,
  cell: number,
  scale: PuyoScale = ONE_SCALE,
) {
  if (row < 0) return;
  const cx = col * cell + cell / 2;
  // 「弾むときも底辺は床に貼り付いている」見せ方:変形の中心をセル底にする。
  const baseY = row * cell + cell - 2;
  const r = cell / 2 - 2;
  const ry = r * scale.sy;
  const rx = r * scale.sx;
  const centerY = baseY - ry;

  // ラジアルグラデで本体に立体感。中心を少し上にオフセットして光が上から
  // 当たっているように見せる(本家ぷよ寄り)。
  const grad = ctx.createRadialGradient(
    cx - rx * 0.25,
    centerY - ry * 0.35,
    Math.max(1, rx * 0.1),
    cx,
    centerY,
    Math.max(rx, ry),
  );
  grad.addColorStop(0, PUYO_LIGHT[color]);
  grad.addColorStop(0.55, PUYO_COLORS[color]);
  grad.addColorStop(1, PUYO_DARK[color]);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(cx, centerY, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  // 暗色アウトライン
  ctx.lineWidth = Math.max(1, cell * 0.04);
  ctx.strokeStyle = PUYO_DARK[color];
  ctx.stroke();
  ctx.restore();

  drawSymbol(ctx, cx, centerY, color, cell, scale, alpha);
}

function drawPopHighlight(
  ctx: CanvasRenderingContext2D,
  row: number,
  col: number,
  cell: number,
  pulse: number,
) {
  if (row < 0) return;
  const cx = col * cell + cell / 2;
  const cy = row * cell + cell / 2;
  // 白い光をぷよの上に重ねて「いま消えるぞ」という視覚的強調
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = pulse * 0.6;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(cx, cy, cell / 2 - 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 外側に広がるリング
  ctx.save();
  ctx.strokeStyle = `rgba(255, 255, 255, ${pulse})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, (cell / 2 - 2) * (1 + 0.2 * pulse), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawPuyoGhost(
  ctx: CanvasRenderingContext2D,
  row: number,
  col: number,
  color: Color,
  cell: number,
) {
  if (row < 0) return;
  const cx = col * cell + cell / 2;
  const cy = row * cell + cell / 2;
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = PUYO_COLORS[color];
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.arc(cx, cy, cell / 2 - 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  // ゴーストにも色の頭文字を表示(本体より薄く)。setLineDash の影響を
  // drawSymbol は受けない(restore してから呼ぶ + drawSymbol 内部で save)。
  drawSymbol(ctx, cx, cy, color, cell, ONE_SCALE, 0.55);
}

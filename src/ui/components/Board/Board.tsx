import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useGameStore, type PoppingCell } from '../../store';
import { useGestures } from '../../hooks/useGestures';
import { useAiSuggestion } from '../../hooks/useAiSuggestion';
import { ROWS, COLS, SPAWN_COL, VISIBLE_ROW_START } from '../../../game/constants';
import { PUYO_COLORS, BG_COLOR, GRID_COLOR, DANGER_COLOR } from './colors';
import type { Field, ActivePair, Move } from '../../../game/types';
import { ghostCells } from './ghost';

export function Board() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [cell, setCell] = useState(32);
  const game = useGameStore((s) => s.game);
  const poppingCells = useGameStore((s) => s.poppingCells);
  const { moves } = useAiSuggestion(5);
  const bestMove = moves[0] ?? null;

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
      draw(ctx, game.field, game.current, cell, bestMove, poppingCells);
      if (poppingCells.length > 0) {
        rafId = requestAnimationFrame(render);
      }
    };
    render();
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [game, cell, bestMove, poppingCells]);

  return (
    <div ref={wrapperRef} className="w-full max-w-sm">
      <canvas
        ref={canvasRef}
        width={COLS * cell}
        height={ROWS * cell}
        className="bg-slate-900 mx-auto block"
      />
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
) {
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
  const popPulse = 0.55 + 0.45 * Math.sin(Date.now() / 80);
  const popKey = (r: number, c: number) => r * COLS + c;
  const poppingSet = new Set(poppingCells.map((p) => popKey(p.row, p.col)));

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const color = field.cells[r]![c]!;
      if (color === null) continue;
      const baseAlpha = r < VISIBLE_ROW_START ? 0.5 : 1;
      drawPuyo(ctx, r, c, PUYO_COLORS[color], baseAlpha, cell);
      if (poppingSet.has(popKey(r, c))) {
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
    drawPuyo(ctx, axisRow, axisCol, PUYO_COLORS[pair.axis], 1, cell);
    drawPuyo(ctx, axisRow + dr, axisCol + dc, PUYO_COLORS[pair.child], 1, cell);
  }

  const ghost = ghostCells(field, current as ActivePair | null, bestMove);
  if (ghost && current) {
    const { pair } = current as { pair: { axis: string; child: string } };
    for (const p of ghost) {
      const color = p.kind === 'axis' ? pair.axis : pair.child;
      drawPuyoGhost(ctx, p.row, p.col, PUYO_COLORS[color as keyof typeof PUYO_COLORS], cell);
    }
  }
}

function drawPuyo(
  ctx: CanvasRenderingContext2D,
  row: number,
  col: number,
  color: string,
  alpha: number,
  cell: number,
) {
  if (row < 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(col * cell + cell / 2, row * cell + cell / 2, cell / 2 - 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
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
  color: string,
  cell: number,
) {
  if (row < 0) return;
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.arc(col * cell + cell / 2, row * cell + cell / 2, cell / 2 - 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

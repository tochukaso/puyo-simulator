import { useEffect, useRef } from 'react';
import { useGameStore } from '../../store';
import { ROWS, COLS, SPAWN_COL, VISIBLE_ROW_START } from '../../../game/constants';
import { PUYO_COLORS, BG_COLOR, GRID_COLOR, DANGER_COLOR } from './colors';
import type { Field } from '../../../game/types';

const CELL = 32;

export function Board() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const game = useGameStore((s) => s.game);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    draw(ctx, game.field, game.current);
  }, [game.field, game.current]);

  return (
    <canvas
      ref={canvasRef}
      width={COLS * CELL}
      height={ROWS * CELL}
      className="bg-slate-900"
    />
  );
}

function draw(ctx: CanvasRenderingContext2D, field: Field, current: unknown) {
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, COLS * CELL, ROWS * CELL);

  ctx.strokeStyle = GRID_COLOR;
  ctx.lineWidth = 1;
  for (let r = 0; r <= ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * CELL);
    ctx.lineTo(COLS * CELL, r * CELL);
    ctx.stroke();
  }
  for (let c = 0; c <= COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * CELL, 0);
    ctx.lineTo(c * CELL, ROWS * CELL);
    ctx.stroke();
  }

  ctx.fillStyle = 'rgba(15, 23, 42, 0.5)';
  ctx.fillRect(0, 0, COLS * CELL, VISIBLE_ROW_START * CELL);

  ctx.strokeStyle = DANGER_COLOR;
  ctx.lineWidth = 2;
  ctx.strokeRect(SPAWN_COL * CELL + 1, 1, CELL - 2, CELL - 2);

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const color = field.cells[r]![c]!;
      if (color === null) continue;
      drawPuyo(ctx, r, c, PUYO_COLORS[color], r < VISIBLE_ROW_START ? 0.5 : 1);
    }
  }

  if (current && typeof current === 'object' && 'pair' in current) {
    const { axisRow, axisCol, rotation, pair } = current as {
      axisRow: number; axisCol: number; rotation: 0 | 1 | 2 | 3;
      pair: { axis: keyof typeof PUYO_COLORS; child: keyof typeof PUYO_COLORS };
    };
    const offsets: Record<number, [number, number]> = {
      0: [-1, 0], 1: [0, 1], 2: [1, 0], 3: [0, -1],
    };
    const [dr, dc] = offsets[rotation]!;
    drawPuyo(ctx, axisRow, axisCol, PUYO_COLORS[pair.axis], 1);
    drawPuyo(ctx, axisRow + dr, axisCol + dc, PUYO_COLORS[pair.child], 1);
  }
}

function drawPuyo(
  ctx: CanvasRenderingContext2D,
  row: number,
  col: number,
  color: string,
  alpha: number,
) {
  if (row < 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(col * CELL + CELL / 2, row * CELL + CELL / 2, CELL / 2 - 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

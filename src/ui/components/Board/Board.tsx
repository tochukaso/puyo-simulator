import { useEffect, useLayoutEffect, useRef } from 'react';
import { useGameStore, type PoppingCell, type LandedCell, LANDING_BOUNCE_MS } from '../../store';
import { useAiSuggestion } from '../../hooks/useAiSuggestion';
import {
  useGhostEnabled,
  useCeilingVisible,
  useBoardCellSize,
  setBoardCellSize,
  useTapToDropEnabled,
} from '../../hooks/useUiPrefs';
import { usePreviewMove } from '../../hooks/useAiPreview';
import { useT } from '../../../i18n';
import { ROWS, COLS, SPAWN_COL, VISIBLE_ROW_START } from '../../../game/constants';
import { PUYO_COLORS, PUYO_LIGHT, PUYO_DARK, BG_COLOR, GRID_COLOR, DANGER_COLOR } from './colors';
import type { Color, Field, ActivePair, Move } from '../../../game/types';
import { ghostCells } from './ghost';

// Module-level frozen empty references used while spectating the AI side, so
// the Board memoization sees a stable identity instead of a fresh `[]` per render.
const EMPTY_POPPING: PoppingCell[] = [];
const EMPTY_CHAIN_TEXTS: ReturnType<typeof useGameStore.getState>['chainTexts'] = [];
const EMPTY_LANDED: LandedCell[] = [];

export function Board() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const cell = useBoardCellSize();
  const playerGame = useGameStore((s) => s.game);
  const aiGame = useGameStore((s) => s.aiGame);
  const aiHistory = useGameStore((s) => s.aiHistory);
  const aiHistoryViewIndex = useGameStore((s) => s.aiHistoryViewIndex);
  const viewing = useGameStore((s) => s.viewing);
  const editing = useGameStore((s) => s.editing);
  const paintCell = useGameStore((s) => s.paintCell);
  const commit = useGameStore((s) => s.commit);
  const animating = useGameStore((s) => s.animatingSteps.length > 0);
  const tapToDrop = useTapToDropEnabled();
  // While viewing the AI side, swap the game source. If the user scrubbed
  // the AI history slider (aiHistoryViewIndex set), render that snapshot.
  const game =
    viewing === 'ai'
      ? aiHistoryViewIndex !== null
        ? (aiHistory[aiHistoryViewIndex] ?? aiGame ?? playerGame)
        : (aiGame ?? playerGame)
      : playerGame;
  // The pop / landing animations only fire on the player side; if the user is
  // spectating the AI we don't drive those overlays. Read raw store fields and
  // gate locally so the selector returns a stable reference (avoids the
  // infinite-update loop you'd hit by returning a fresh `[]` per render).
  const playerPoppingCells = useGameStore((s) => s.poppingCells);
  const playerChainTexts = useGameStore((s) => s.chainTexts);
  const playerLandedCells = useGameStore((s) => s.landedCells);
  const poppingCells = viewing === 'player' ? playerPoppingCells : EMPTY_POPPING;
  const chainTexts = viewing === 'player' ? playerChainTexts : EMPTY_CHAIN_TEXTS;
  const landedCells = viewing === 'player' ? playerLandedCells : EMPTY_LANDED;
  const { moves } = useAiSuggestion(5);
  const ghostEnabled = useGhostEnabled();
  const ceilingVisible = useCeilingVisible();
  const previewMove = usePreviewMove();
  const t = useT();
  // If a candidate is hovered/selected in CandidateList, prefer it. Otherwise
  // fall back to the top candidate. Suppress when not viewing the live player
  // board (suggestions are computed for the player's state, not the AI's).
  const bestMove =
    ghostEnabled && viewing === 'player'
      ? (previewMove ?? moves[0] ?? null)
      : null;

  // canvas はつねに ROWS=13 行ぶんを確保する。`ceilingVisible=false` の時は
  // draw() 側で「行 0 の背景帯 / DANGER 枠 / 配置済みぷよ」だけを描画スキップし、
  // **アクティブペアの行 0 ぷよは常に薄く表示** する(操作中の child が完全に
  // 隠れて 1 個しか見えない問題を避ける)。
  const yOffset = 0;
  const boardWidth = COLS * cell;
  const boardHeight = ROWS * cell;

  useLayoutEffect(() => {
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]!.contentRect.width;
      const maxCellByWidth = Math.floor(w / COLS);
      const maxCellByHeight = Math.floor((window.innerHeight * 0.6) / ROWS);
      setBoardCellSize(Math.max(16, Math.min(maxCellByWidth, maxCellByHeight, 48)));
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
        ceilingVisible,
      );
      // If either the landing animation or the pop-flash animation is still
      // running, schedule the next frame.
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
  }, [game, cell, bestMove, poppingCells, landedCells, yOffset, ceilingVisible]);

  // Edit-mode: tap & drag-paint. Track which cells we already painted in the
  // current pointer stroke so re-entering a cell on the same drag doesn't
  // trigger the "same color → erase" toggle (that toggle is intended for
  // discrete taps only).
  const paintedThisStrokeRef = useRef<Set<string>>(new Set());
  const pointerToCell = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const c = Math.floor((x / rect.width) * COLS);
    const r = Math.floor((y / rect.height) * ROWS);
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return null;
    return { row: r, col: c };
  };
  // tap-to-drop: タップした列に現在のペアを即落下。
  // 1 回のタップ = pointer down → up が同じ列で完了したケースのみ commit する。
  // ドラッグして列が変わった場合は誤発火を防ぐためキャンセル(指をスライドして
  // 「やっぱりやめた」を表現できる)。
  const tapStartColRef = useRef<number | null>(null);
  const canTapDrop =
    tapToDrop && !editing && viewing === 'player' && !animating;

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (editing) {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      paintedThisStrokeRef.current = new Set();
      const pos = pointerToCell(e);
      if (!pos) return;
      paintedThisStrokeRef.current.add(`${pos.row},${pos.col}`);
      paintCell(pos.row, pos.col);
      return;
    }
    if (canTapDrop) {
      const pos = pointerToCell(e);
      if (!pos) return;
      tapStartColRef.current = pos.col;
    }
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (editing) {
      if (e.buttons === 0 && e.pointerType === 'mouse') return; // only paint while held
      const pos = pointerToCell(e);
      if (!pos) return;
      const key = `${pos.row},${pos.col}`;
      if (paintedThisStrokeRef.current.has(key)) return;
      paintedThisStrokeRef.current.add(key);
      paintCell(pos.row, pos.col);
      return;
    }
    if (canTapDrop && tapStartColRef.current !== null) {
      const pos = pointerToCell(e);
      // 列が変わったらキャンセル(誤タップ救済 / "やめた" ジェスチャ)。
      if (pos && pos.col !== tapStartColRef.current) {
        tapStartColRef.current = null;
      }
    }
  };
  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (editing) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore: capture may have already been lost
      }
      paintedThisStrokeRef.current = new Set();
      return;
    }
    if (!canTapDrop) return;
    const pos = pointerToCell(e);
    const startCol = tapStartColRef.current;
    tapStartColRef.current = null;
    if (pos === null || startCol === null) return;
    if (pos.col !== startCol) return; // dragged off — abort
    const cur = playerGame.current;
    if (!cur) return;
    void commit({ axisCol: startCol, rotation: cur.rotation });
  };

  return (
    <div
      ref={wrapperRef}
      className="w-full max-w-sm select-none"
      style={{ touchAction: 'none' }}
    >
      <div
        className="relative mx-auto"
        style={{ width: boardWidth, height: boardHeight }}
      >
        <canvas
          ref={canvasRef}
          width={boardWidth}
          height={boardHeight}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className={`bg-slate-900 block ${
            editing
              ? 'cursor-crosshair ring-2 ring-blue-500/60'
              : canTapDrop
                ? 'cursor-pointer'
                : ''
          }`}
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
  ceilingVisible: boolean,
) {
  ctx.save();
  ctx.translate(0, yOffset);

  // 背景は天井行も含め全面を一度塗る (ベースのトーン)。天井非表示の時は
  // 後で行 0 の上に "playfield 外" を覆う黒帯を載せて、行 0 を視覚的に
  // 「キャンバス外」として扱う。アクティブペアの行 0 ぷよだけは上から
  // 描かれるので、薄く透けて見える状態になる。
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, COLS * cell, ROWS * cell);

  ctx.strokeStyle = GRID_COLOR;
  ctx.lineWidth = 1;
  // 天井非表示の時は行 0 のグリッド線を引かない (=完全に "枠外" の見た目)。
  const gridStart = ceilingVisible ? 0 : VISIBLE_ROW_START;
  for (let r = gridStart; r <= ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * cell);
    ctx.lineTo(COLS * cell, r * cell);
    ctx.stroke();
  }
  for (let c = 0; c <= COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * cell, gridStart * cell);
    ctx.lineTo(c * cell, ROWS * cell);
    ctx.stroke();
  }

  if (ceilingVisible) {
    // 天井行の薄いトーンと、危険列を示す赤枠 (DANGER) を表示。
    ctx.fillStyle = 'rgba(15, 23, 42, 0.5)';
    ctx.fillRect(0, 0, COLS * cell, VISIBLE_ROW_START * cell);
    ctx.strokeStyle = DANGER_COLOR;
    ctx.lineWidth = 2;
    ctx.strokeRect(SPAWN_COL * cell + 1, 1, cell - 2, cell - 2);
  }

  // Pulse coefficient for the popping highlight. Driven by `Date.now()` and
  // called per frame from rAF.
  const popPulse = 0.55 + 0.45 * Math.sin(now / 80);
  const popKey = (r: number, c: number) => r * COLS + c;
  const poppingSet = new Set(poppingCells.map((p) => popKey(p.row, p.col)));
  // (r,c) → most recent landing time. If multiple candidates exist, take the latest.
  const landedAtMap = new Map<number, number>();
  for (const c of landedCells) {
    const k = popKey(c.row, c.col);
    const prev = landedAtMap.get(k) ?? 0;
    if (c.landedAt > prev) landedAtMap.set(k, c.landedAt);
  }

  // Draw the same-color connection bars first (we want them under the puyo discs).
  drawConnectors(ctx, field, cell, ceilingVisible);

  // 配置済みぷよは天井非表示時は行 0 を描かない (=「枠外」扱い)。
  // アクティブペアの行 0 ぷよだけは下のブロックで別途描画される。
  const fieldStartRow = ceilingVisible ? 0 : VISIBLE_ROW_START;
  for (let r = fieldStartRow; r < ROWS; r++) {
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
    // Row 0 (height 13, ceiling row) is drawn semi-transparent to indicate
    // that "this is effectively invisible territory".
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

// Connect adjacent same-color puyos with a thick bar (the "connection
// expression" used in the original Puyo Puyo). Called before drawPuyo so the
// bar layers underneath the discs.
function drawConnectors(
  ctx: CanvasRenderingContext2D,
  field: Field,
  cell: number,
  ceilingVisible: boolean,
) {
  const W = cell * 0.55; // Bar thickness. Thinner than the puyo diameter so it reads as a "neck".
  const alphaOf = (r: number) => (r < VISIBLE_ROW_START ? 0.5 : 1);
  // 天井非表示時は行 0 のコネクタは描画しない (=フィールドぷよが見えない領域)。
  const startRow = ceilingVisible ? 0 : VISIBLE_ROW_START;
  for (let r = startRow; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const color = field.cells[r]![c]!;
      // Garbage doesn't form connections — skip drawing connector bars for it.
      if (color === null || color === 'G') continue;
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

// Draw the color's initial letter in the center of the cell. fontSize is 45%
// of the cell; we use white text with a dark shadow to keep contrast. scale
// makes the symbol deform along with the puyo during squash.
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

// Squash-and-stretch right after landing. Damped sine wave: 0 → 0.6 (squish)
// → 1.1 (rebound) → 1. The deformation is anchored at the bottom edge so the
// puyo feels weighted at the base of the cell.
function landingScale(elapsedMs: number): PuyoScale {
  if (elapsedMs <= 0) return { sx: 1.2, sy: 0.65 };
  if (elapsedMs >= LANDING_BOUNCE_MS) return ONE_SCALE;
  const t = elapsedMs / LANDING_BOUNCE_MS;
  // Stronger damping for a "short, light bounce".
  const offset = -0.35 * Math.exp(-4.5 * t) * Math.cos(8 * t);
  const sy = 1 + offset;
  const sx = 1 - offset * 0.6;
  return { sx, sy };
}

function drawPuyo(
  ctx: CanvasRenderingContext2D,
  row: number,
  col: number,
  color: Color | 'G',
  alpha: number,
  cell: number,
  scale: PuyoScale = ONE_SCALE,
) {
  if (row < 0) return;
  const cx = col * cell + cell / 2;
  // To convey that "even while bouncing, the bottom stays glued to the floor",
  // anchor the deformation at the cell bottom.
  const baseY = row * cell + cell - 2;
  const r = cell / 2 - 2;
  const ry = r * scale.sy;
  const rx = r * scale.sx;
  const centerY = baseY - ry;

  // Radial gradient for body shading. Offset the highlight slightly up to
  // suggest light coming from above (matching the original Puyo Puyo style).
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
  // Dark outline
  ctx.lineWidth = Math.max(1, cell * 0.04);
  ctx.strokeStyle = PUYO_DARK[color];
  ctx.stroke();
  ctx.restore();

  // Garbage has no letter; show a small inner highlight instead so it still
  // reads as a puyo at a glance.
  if (color === 'G') {
    ctx.save();
    ctx.globalAlpha = alpha * 0.85;
    ctx.fillStyle = PUYO_LIGHT[color];
    ctx.beginPath();
    ctx.ellipse(
      cx - rx * 0.25,
      centerY - ry * 0.3,
      Math.max(2, rx * 0.18),
      Math.max(2, ry * 0.18),
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.restore();
    return;
  }
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
  // Overlay a white glow on the puyo to visually emphasize "this is about to pop".
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = pulse * 0.6;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(cx, cy, cell / 2 - 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Ring expanding outward
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
  // Show the color initial on ghosts too (more transparent than the body).
  // drawSymbol is not affected by setLineDash because it is called after
  // restore, and drawSymbol does its own save internally.
  drawSymbol(ctx, cx, cy, color, cell, ONE_SCALE, 0.55);
}

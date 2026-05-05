import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useGameStore, type PoppingCell, type LandedCell, LANDING_BOUNCE_MS } from '../../store';
import { useAiSuggestion } from '../../hooks/useAiSuggestion';
import {
  useGhostEnabled,
  useCeilingVisible,
  useBoardCellSize,
  setBoardCellSize,
} from '../../hooks/useUiPrefs';
import { usePreviewMove } from '../../hooks/useAiPreview';
import { setBoardRectGetter } from '../../hooks/useBoardRect';
import { useT } from '../../../i18n';
import {
  ROWS,
  COLS,
  SPAWN_COL,
  VISIBLE_ROW_START,
  AI_ROW_OFFSET,
} from '../../../game/constants';
import {
  PUYO_COLORS,
  PUYO_LIGHT,
  PUYO_DARK,
  BG_COLOR,
  ABOVE_FIELD_BG_COLOR,
  GRID_COLOR,
  DANGER_COLOR,
} from './colors';
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
  const playerHistory = useGameStore((s) => s.playerHistory);
  const playerHistoryViewIndex = useGameStore((s) => s.playerHistoryViewIndex);
  const historyAnim = useGameStore((s) => s.historyAnim);
  const viewing = useGameStore((s) => s.viewing);
  const editing = useGameStore((s) => s.editing);
  const paintCell = useGameStore((s) => s.paintCell);
  const matchAiMoves = useGameStore((s) => s.matchAiMoves);
  const matchPlayerMoves = useGameStore((s) => s.matchPlayerMoves);
  const mode = useGameStore((s) => s.mode);
  const matchEnded = useGameStore((s) => s.matchEnded);
  // Replay context: post-match-end, or after the player tops out. Outside of
  // this, the player is actively playing — we always show their live game and
  // ignore history view indices entirely.
  const inReplay =
    (mode === 'match' || mode === 'score') &&
    (matchEnded || playerGame.status === 'gameover');
  // History view index defaults to the latest snapshot when the user hasn't
  // explicitly scrubbed. (No live-tracking mode: there's no UI to escape back
  // to following the live game state — replay is always frame-accurate.)
  const aiViewIdx = aiHistoryViewIndex ?? Math.max(0, aiHistory.length - 1);
  const playerViewIdx =
    playerHistoryViewIndex ?? Math.max(0, playerHistory.length - 1);
  const snapshot = !inReplay
    ? playerGame
    : viewing === 'ai'
      ? (aiHistory[aiViewIdx] ?? aiGame ?? playerGame)
      : (playerHistory[playerViewIdx] ?? playerGame);
  // While a chain replay is running for the side we're viewing, override the
  // snapshot's field/current so the animation phases are visible. Memoize so
  // the spread only allocates a new object when its inputs change — otherwise
  // unrelated rerenders would invalidate the draw effect's deps every tick.
  const animActive = historyAnim !== null && historyAnim.side === viewing;
  const game = useMemo(
    () =>
      animActive
        ? {
            ...snapshot,
            field: historyAnim!.field,
            current: historyAnim!.current,
          }
        : snapshot,
    [animActive, snapshot, historyAnim],
  );
  // The pop / landing animations only fire on the player side; if the user is
  // spectating the AI we don't drive those overlays. Read raw store fields and
  // gate locally so the selector returns a stable reference (avoids the
  // infinite-update loop you'd hit by returning a fresh `[]` per render).
  const playerPoppingCells = useGameStore((s) => s.poppingCells);
  const playerChainTexts = useGameStore((s) => s.chainTexts);
  const playerLandedCells = useGameStore((s) => s.landedCells);
  // Live overlays (popping / landing animations) belong to the in-progress
  // player game. They're meaningful only during active play; in replay mode
  // they'd misleadingly play on top of a frozen snapshot. During a chain
  // replay we substitute the replay's overlays instead.
  const playerLive = !inReplay && viewing === 'player' && !animActive;
  const poppingCells = animActive
    ? historyAnim!.poppingCells
    : playerLive
      ? playerPoppingCells
      : EMPTY_POPPING;
  const chainTexts = animActive
    ? historyAnim!.chainTexts
    : playerLive
      ? playerChainTexts
      : EMPTY_CHAIN_TEXTS;
  const landedCells = playerLive ? playerLandedCells : EMPTY_LANDED;
  // match モードでは候補手リスト・ゴースト・「AI 最善手」ボタンを全部隠して
  // いるので、worker への suggest 投げそのものを止める (WASM 全幅探索は重い
  // ので生かしっぱなしは計算資源の無駄)。
  // free モードのみ AI 候補手 / ghost を出す。match (対人戦) と score
  // (一発勝負) では AI ヒント無しがユーザー要件。
  const { moves } = useAiSuggestion(5, mode === 'free');
  const ghostEnabled = useGhostEnabled();
  const ceilingVisible = useCeilingVisible();
  const previewMove = usePreviewMove();
  const t = useT();
  // If a candidate is hovered/selected in CandidateList, prefer it. Otherwise
  // fall back to the top candidate. Suppress in match mode during active play
  // (the ghost would give away the answer in a player-vs-ama score race).
  // Replay (post-match): show a ghost of the move that was actually played
  // from this snapshot (= matchXxxMoves[viewIndex + 1], since history[i] is
  // post-move-(i+1) with the next pair already spawned). Makes replay easier
  // to follow — you see at a glance where each pair was placed.
  let bestMove: Move | null = null;
  if (ghostEnabled) {
    if (inReplay) {
      bestMove =
        viewing === 'ai'
          ? (matchAiMoves[aiViewIdx + 1] ?? null)
          : (matchPlayerMoves[playerViewIdx + 1] ?? null);
    } else if (mode === 'free' && viewing === 'player') {
      bestMove = previewMove ?? moves[0] ?? null;
    }
  }

  // The transient "14段目" rows (game rows 0..AI_ROW_OFFSET-1) are reserved
  // for rotation only and never hold a locked puyo, so we always clip them
  // off the top of the canvas — the player should see the visible play area
  // start at "13段目", with the active pair appearing to slide upward into
  // empty space when 回し-style rotations lift it above the visible top.
  // The ceiling toggle additionally hides "13段目" itself when set.
  const hiddenRows = ceilingVisible ? AI_ROW_OFFSET : VISIBLE_ROW_START;
  const visibleRows = ROWS - hiddenRows;
  // Reveal the bottom half of the topmost otherwise-hidden row in both
  // modes — gives the player a peek at incoming pieces / 回し motion
  // without flipping the full ceiling display on. Pixel-quantized so the
  // canvas dims stay integer regardless of `cell`.
  const topRevealPx = Math.floor(cell / 2);
  const yOffset = -hiddenRows * cell + topRevealPx;
  const boardWidth = COLS * cell;
  const boardHeight = visibleRows * cell + topRevealPx;

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

  // useGestures (tap-to-drop / drag) reads the board's current bounding rect
  // via this singleton to convert pointer clientX into a column index.
  useEffect(() => {
    setBoardRectGetter(() => wrapperRef.current?.getBoundingClientRect() ?? null);
    return () => {
      setBoardRectGetter(() => null);
    };
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
  }, [game, cell, bestMove, poppingCells, landedCells, yOffset]);

  // Edit-mode: tap & drag-paint. Track which cells we already painted in the
  // current pointer stroke so re-entering a cell on the same drag doesn't
  // trigger the "same color → erase" toggle (that toggle is intended for
  // discrete taps only).
  const paintedThisStrokeRef = useRef<Set<string>>(new Set());
  const pointerToCell = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    // Convert canvas-pixel coords back to logical (row, col). Drawing
    // translates by yOffset so canvas-y maps to game-y = canvas-y - yOffset.
    // Scale through rect to handle any CSS resizing of the canvas element.
    const c = Math.floor((x / rect.width) * COLS);
    const yPx = (y / rect.height) * boardHeight;
    const r = Math.floor((yPx - yOffset) / cell);
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return null;
    return { row: r, col: c };
  };
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!editing) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    paintedThisStrokeRef.current = new Set();
    const pos = pointerToCell(e);
    if (!pos) return;
    paintedThisStrokeRef.current.add(`${pos.row},${pos.col}`);
    paintCell(pos.row, pos.col);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!editing) return;
    if (e.buttons === 0 && e.pointerType === 'mouse') return; // only paint while held
    const pos = pointerToCell(e);
    if (!pos) return;
    const key = `${pos.row},${pos.col}`;
    if (paintedThisStrokeRef.current.has(key)) return;
    paintedThisStrokeRef.current.add(key);
    paintCell(pos.row, pos.col);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!editing) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore: capture may have already been lost
    }
    paintedThisStrokeRef.current = new Set();
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
          className={`bg-slate-900 block ${editing ? 'cursor-crosshair ring-2 ring-blue-500/60' : ''}`}
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
  // Translate everything by yOffset (0 or -cell). When the ceiling is hidden,
  // anything coming from row 0 escapes above the canvas top edge and is
  // automatically clipped.
  ctx.save();
  ctx.translate(0, yOffset);

  // 背景: プレイ可能領域 (12段目以下) は通常の BG_COLOR、その上の「14段目」
  // 「13段目」は ABOVE_FIELD_BG_COLOR でやや明るめのスレート色にして「ここは
  // ペア回し用で本来は見えない領域」と視覚的に区別する。grid lines はこの上に
  // 重ねるので、両領域とも同じグリッドが見える。
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, COLS * cell, ROWS * cell);
  ctx.fillStyle = ABOVE_FIELD_BG_COLOR;
  ctx.fillRect(0, 0, COLS * cell, VISIBLE_ROW_START * cell);

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

  // Danger frame highlights the 「バツマーク」 death cell — game-over fires
  // when this cell is occupied at spawn time (see state.ts's spawnNext).
  // Drawn at VISIBLE_ROW_START (= 12段目) so the visual rule matches the
  // gameover trigger, and the marker stays inside the rendered area even
  // when the ceiling row is hidden (which clips up to VISIBLE_ROW_START).
  ctx.strokeStyle = DANGER_COLOR;
  ctx.lineWidth = 2;
  ctx.strokeRect(
    SPAWN_COL * cell + 1,
    VISIBLE_ROW_START * cell + 1,
    cell - 2,
    cell - 2,
  );

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

  // Render order is split into 3 passes so connector lenses sit between body
  // and symbol layers — keeps the lens shape independent of how wide it
  // happens to be (a future tweak that pushes it close to the symbol's area
  // would otherwise hide the color letter).
  // Pass 1: bodies (with outline clipped at connecting wedges so the lens'
  // body-side arc replaces the outline cleanly).
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const color = field.cells[r]![c]!;
      if (color === null) continue;
      const baseAlpha = r < VISIBLE_ROW_START ? 0.5 : 1;
      const k = popKey(r, c);
      const landedAt = landedAtMap.get(k);
      const scale =
        landedAt !== undefined ? landingScale(now - landedAt) : ONE_SCALE;
      drawPuyoBody(ctx, r, c, color, baseAlpha, cell, scale, buildConnMask(field, r, c));
    }
  }
  // Pass 2: connector lenses fill the gap between same-color neighbors.
  drawConnectors(ctx, field, cell);
  // Pass 3: symbols + pop highlights on top of connectors.
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const color = field.cells[r]![c]!;
      if (color === null) continue;
      const baseAlpha = r < VISIBLE_ROW_START ? 0.5 : 1;
      const k = popKey(r, c);
      const landedAt = landedAtMap.get(k);
      const scale =
        landedAt !== undefined ? landingScale(now - landedAt) : ONE_SCALE;
      drawPuyoSymbol(ctx, r, c, color, baseAlpha, cell, scale);
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
    // Rows above VISIBLE_ROW_START (13段目 / 14段目) are drawn semi-transparent
    // to indicate "this is effectively invisible territory" — useful for the
    // 回し technique where the active pair lifts above the visible play area.
    const axisAlpha = axisRow < VISIBLE_ROW_START ? 0.5 : 1;
    const childRow = axisRow + dr;
    const childAlpha = childRow < VISIBLE_ROW_START ? 0.5 : 1;
    // 薄い白のハロー(スポットライト)を本体の下に敷いて、フィールドの他の
    // ぷよと「これは今操作中」だと一目で区別できるようにする。
    drawActiveHalo(ctx, axisRow, axisCol, cell, axisAlpha);
    drawActiveHalo(ctx, childRow, axisCol + dc, cell, childAlpha);
    drawPuyoBody(ctx, axisRow, axisCol, pair.axis, axisAlpha, cell);
    drawPuyoBody(ctx, childRow, axisCol + dc, pair.child, childAlpha, cell);
    drawPuyoSymbol(ctx, axisRow, axisCol, pair.axis, axisAlpha, cell);
    drawPuyoSymbol(ctx, childRow, axisCol + dc, pair.child, childAlpha, cell);
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

// Connect adjacent same-color puyos with a soap-bubble-fusion lens shape.
// The lens fills the gap between two bodies. It is bounded on the body sides
// by each body's actual outline arc and on the gap-facing sides by concave
// quadratic Bezier curves (the "saddle"), giving the "two bubbles fusing"
// silhouette of the original Puyo Puyo title.
// Drawn AFTER bodies (so it lines up with the bodies' clipped-outline wedges)
// and BEFORE symbols (so the color letter never gets hidden).
function drawConnectors(ctx: CanvasRenderingContext2D, field: Field, cell: number) {
  const alphaOf = (r: number) => (r < VISIBLE_ROW_START ? 0.5 : 1);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const color = field.cells[r]![c]!;
      if (color === null || color === 'G') continue;
      const cx = c * cell + cell / 2;
      const cy = r * cell + cell / 2;
      if (c + 1 < COLS && field.cells[r]![c + 1] === color) {
        drawNeckLens(ctx, color, alphaOf(r), cx, cy, cell, 'horizontal');
      }
      if (r + 1 < ROWS && field.cells[r + 1]![c] === color) {
        drawNeckLens(
          ctx,
          color,
          Math.min(alphaOf(r), alphaOf(r + 1)),
          cx,
          cy,
          cell,
          'vertical',
        );
      }
    }
  }
}

// Draws the saddle-shaped fusion neck between two adjacent same-color puyos.
// `cx`,`cy` are the *first* puyo's center (the upstream cell). `direction`
// picks horizontal (→ neighbor at cx+cell, cy) or vertical (→ neighbor at cx, cy+cell).
//
// The lens is bounded on the body sides by the puyos' actual outline arcs and
// on the gap-facing sides by concave Bezier curves (the "saddle"). It NEVER
// extends into body interior, so the body's own gradient and outline elsewhere
// stay completely intact — only the small wedge of outline at the connecting
// direction is hidden (handled by drawPuyoBody's clip).
function drawNeckLens(
  ctx: CanvasRenderingContext2D,
  color: Color | 'G',
  alpha: number,
  cx: number,
  cy: number,
  cell: number,
  direction: 'horizontal' | 'vertical',
) {
  const r = cell / 2 - 2;
  // Half-width at the body interface — measured perpendicular to the join axis.
  // Sized close to the body radius (not 0.5 — slightly less so we don't degenerate
  // the outline arc). Matches how the original Puyo Puyo title joins two bodies
  // along almost their full edge so they read as one continuous blob.
  const halfWAtBody = Math.min(cell * 0.42, r * 0.92);
  // Saddle pinch — only a subtle inward bow at the middle, like the original.
  const halfWAtSaddle = halfWAtBody * 0.92;
  // Body outline x-coordinate at y = ±halfWAtBody (relative to body center).
  // We use this to land the lens endpoints exactly ON the body outline.
  const sqrtPart = Math.sqrt(Math.max(0, r * r - halfWAtBody * halfWAtBody));
  // Half-angle that the lens occupies on each body's outline (in radians).
  const bodyArcAngle = Math.asin(halfWAtBody / r);

  ctx.save();
  ctx.globalAlpha = alpha;
  // Solid mid color (PUYO_COLORS) — same as the body's mid-radius shading.
  // The neck reads as "same color as the body" rather than its own lit surface.
  ctx.fillStyle = PUYO_COLORS[color];

  ctx.beginPath();
  if (direction === 'horizontal') {
    // Lens between body A (left, center cx,cy) and body B (right, center cx+cell,cy).
    const yTop = cy - halfWAtBody;
    const yBot = cy + halfWAtBody;
    const xA = cx + sqrtPart; // body A right outline at y = cy ± halfWAtBody
    const xB = cx + cell - sqrtPart; // body B left outline
    const saddleX = cx + cell / 2;
    // Solve quadratic Bezier control y so the saddle lands at cy ± halfWAtSaddle:
    //   B(0.5).y = (P0.y + 2*ctrl.y + P1.y) / 4. With P0.y == P1.y == yTop:
    //     B(0.5).y = (yTop + ctrl.y) / 2 → ctrl.y = 2*saddle.y - yTop.
    const ctrlYTop = 2 * (cy - halfWAtSaddle) - yTop; // = cy - 2*halfWAtSaddle + halfWAtBody
    const ctrlYBot = 2 * (cy + halfWAtSaddle) - yBot;
    ctx.moveTo(xA, yTop);
    // Top side: concave saddle from (xA,yTop) to (xB,yTop).
    ctx.quadraticCurveTo(saddleX, ctrlYTop, xB, yTop);
    // Right side: body B's left outline arc, from (xB,yTop) through (cx+cell-r, cy) to (xB,yBot).
    // Endpoint angles from body B center (cx+cell, cy):
    //   (xB, yTop): atan2(-halfW, -sqrt) = -(π - bodyArcAngle) = bodyArcAngle - π
    //   (xB, yBot): π - bodyArcAngle
    // Going through angle ±π (leftmost point) requires anticlockwise (decreasing) wrap.
    ctx.arc(cx + cell, cy, r, bodyArcAngle - Math.PI, Math.PI - bodyArcAngle, true);
    // Bottom side: concave saddle from (xB,yBot) back to (xA,yBot).
    ctx.quadraticCurveTo(saddleX, ctrlYBot, xA, yBot);
    // Left side: body A's right outline arc, from (xA,yBot) through (cx+r, cy) to (xA,yTop).
    // Endpoint angles from body A center (cx, cy):
    //   (xA, yBot): bodyArcAngle, (xA, yTop): -bodyArcAngle.
    // Going through angle 0 (rightmost) means decreasing angle (anticlockwise).
    ctx.arc(cx, cy, r, bodyArcAngle, -bodyArcAngle, true);
  } else {
    // Lens between body A (top, center cx,cy) and body B (bottom, center cx,cy+cell).
    const xLeft = cx - halfWAtBody;
    const xRight = cx + halfWAtBody;
    const yA = cy + sqrtPart; // body A bottom outline at x = cx ± halfWAtBody
    const yB = cy + cell - sqrtPart; // body B top outline
    const saddleY = cy + cell / 2;
    const ctrlXLeft = 2 * (cx - halfWAtSaddle) - xLeft;
    const ctrlXRight = 2 * (cx + halfWAtSaddle) - xRight;
    ctx.moveTo(xLeft, yA);
    // Top side: body A's bottom (south) outline arc, from (xLeft,yA) through (cx, cy+r) to (xRight,yA).
    // Endpoint angles from body A center:
    //   (xLeft, yA): atan2(sqrt, -halfW) = π/2 + bodyArcAngle
    //   (xRight, yA): atan2(sqrt, halfW) = π/2 - bodyArcAngle
    // Going through π/2 (= bottom of A): decreasing angle = anticlockwise.
    ctx.arc(cx, cy, r, Math.PI / 2 + bodyArcAngle, Math.PI / 2 - bodyArcAngle, true);
    // Right side: concave saddle from (xRight,yA) to (xRight,yB).
    ctx.quadraticCurveTo(ctrlXRight, saddleY, xRight, yB);
    // Bottom side: body B's top (north) outline arc, from (xRight,yB) through (cx, cy+cell-r) to (xLeft,yB).
    // Endpoint angles from body B center (cx, cy+cell):
    //   (xRight, yB): atan2(-sqrt, halfW) = -(π/2 - bodyArcAngle) = -π/2 + bodyArcAngle
    //   (xLeft, yB): -π/2 - bodyArcAngle
    // Going through -π/2 (= top of B): decreasing angle = anticlockwise.
    ctx.arc(cx, cy + cell, r, -Math.PI / 2 + bodyArcAngle, -Math.PI / 2 - bodyArcAngle, true);
    // Left side: concave saddle from (xLeft,yB) back to (xLeft,yA).
    ctx.quadraticCurveTo(ctrlXLeft, saddleY, xLeft, yA);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

interface ConnMask {
  right: boolean;
  down: boolean;
  left: boolean;
  up: boolean;
}

const NO_CONN: ConnMask = { right: false, down: false, left: false, up: false };
// Width of the rectangular outline-clip strip in drawPuyoBody. Matches the
// lens's half-width at the body interface (drawNeckLens.halfWAtBody) so the
// outline is hidden exactly under the wedge that the lens replaces.
const CONNECTOR_HALF_W_FRAC = 0.42;

function buildConnMask(field: Field, r: number, c: number): ConnMask {
  const color = field.cells[r]![c];
  if (color === null || color === 'G') return NO_CONN;
  return {
    right: c + 1 < COLS && field.cells[r]![c + 1] === color,
    down: r + 1 < ROWS && field.cells[r + 1]![c] === color,
    left: c - 1 >= 0 && field.cells[r]![c - 1] === color,
    up: r - 1 >= 0 && field.cells[r - 1]![c] === color,
  };
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

// Geometry helper: where the body ellipse actually lives. The body is anchored
// to the cell bottom (bouncing tomato style) so we cannot just take the cell center.
function bodyGeometry(row: number, col: number, cell: number, scale: PuyoScale) {
  const cx = col * cell + cell / 2;
  const baseY = row * cell + cell - 2;
  const r = cell / 2 - 2;
  const ry = r * scale.sy;
  const rx = r * scale.sx;
  const centerY = baseY - ry;
  return { cx, centerY, rx, ry };
}

// Body fill + outline, no symbol. Split out so we can draw the connector bars
// on top of the bodies (covering the dark rim) but UNDER the symbols.
function drawPuyoBody(
  ctx: CanvasRenderingContext2D,
  row: number,
  col: number,
  color: Color | 'G',
  alpha: number,
  cell: number,
  scale: PuyoScale = ONE_SCALE,
  connections: ConnMask = NO_CONN,
) {
  if (row < 0) return;
  const { cx, centerY, rx, ry } = bodyGeometry(row, col, cell, scale);

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
  ctx.restore();

  // Dark outline. Clip out the wedge that faces a same-color neighbor — the
  // connector lens drawn next traces that exact body-outline arc, so without
  // this clip the outline would show as a thin dark seam between body and lens.
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineWidth = Math.max(1, cell * 0.04);
  ctx.strokeStyle = PUYO_DARK[color];
  if (
    connections.right ||
    connections.down ||
    connections.left ||
    connections.up
  ) {
    const halfW = cell * CONNECTOR_HALF_W_FRAC;
    ctx.beginPath();
    ctx.rect(cx - cell * 2, centerY - cell * 2, cell * 4, cell * 4);
    if (connections.right) ctx.rect(cx, centerY - halfW, cell, halfW * 2);
    if (connections.left) ctx.rect(cx - cell, centerY - halfW, cell, halfW * 2);
    if (connections.down) ctx.rect(cx - halfW, centerY, halfW * 2, cell);
    if (connections.up) ctx.rect(cx - halfW, centerY - cell, halfW * 2, cell);
    ctx.clip('evenodd');
  }
  ctx.beginPath();
  ctx.ellipse(cx, centerY, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Garbage gets a tiny highlight in lieu of a letter. Drawn here (with the
  // body) — drawPuyoSymbol skips garbage entirely.
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
  }
}

// Color-letter symbol only (centered on the body). Drawn AFTER connector bars
// so the symbol is never hidden by a same-color connection that crosses it.
function drawPuyoSymbol(
  ctx: CanvasRenderingContext2D,
  row: number,
  col: number,
  color: Color | 'G',
  alpha: number,
  cell: number,
  scale: PuyoScale = ONE_SCALE,
) {
  if (row < 0) return;
  if (color === 'G') return;
  const { cx, centerY } = bodyGeometry(row, col, cell, scale);
  drawSymbol(ctx, cx, centerY, color, cell, scale, alpha);
}

// 操作中ペアの後光。本体より一回り大きい白の放射グラデーションで、
// 中心は半透明 → 外周はゼロにフェード。本体の下に敷いて、本体エッジから
// わずかにはみ出した部分が「光ってる感」になる。隣接セルへ少しだけ滲ませる
// ことで、フィールドの落ち着いた色と確実に視差が出る。
function drawActiveHalo(
  ctx: CanvasRenderingContext2D,
  row: number,
  col: number,
  cell: number,
  alpha: number,
) {
  if (row < 0) return;
  const cx = col * cell + cell / 2;
  const cy = row * cell + cell / 2;
  const inner = cell * 0.35;
  const outer = cell * 0.7;
  const grad = ctx.createRadialGradient(cx, cy, inner, cx, cy, outer);
  grad.addColorStop(0, `rgba(255, 255, 255, ${0.45 * alpha})`);
  grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.save();
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, outer, 0, Math.PI * 2);
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

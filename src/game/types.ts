export type Color = 'R' | 'B' | 'Y' | 'P';
/** Garbage / nuisance puyo. Doesn't form groups on its own; pops only when
 *  adjacent to a color group that pops in the same step. */
export type Garbage = 'G';
export type Cell = Color | Garbage | null;
export type Rotation = 0 | 1 | 2 | 3; // 0: up, 1: right, 2: down, 3: left

export interface Field {
  readonly cells: ReadonlyArray<ReadonlyArray<Cell>>;
}

export interface Pair {
  readonly axis: Color;
  readonly child: Color;
}

export interface ActivePair {
  readonly pair: Pair;
  readonly axisRow: number;
  readonly axisCol: number;
  readonly rotation: Rotation;
}

export type GameStatus = 'playing' | 'resolving' | 'gameover';

export interface GameState {
  readonly field: Field;
  readonly current: ActivePair | null;
  readonly nextQueue: ReadonlyArray<Pair>;
  readonly score: number;
  readonly chainCount: number;
  readonly totalChains: number;
  readonly maxChain: number;
  readonly status: GameStatus;
  readonly rngSeed: number;
  readonly queueIndex: number;
}

export type Input =
  | { type: 'moveLeft' }
  | { type: 'moveRight' }
  | { type: 'rotateCW' }
  | { type: 'rotateCCW' }
  | { type: 'softDrop' }
  | { type: 'hardDrop' };

export interface Move {
  readonly axisCol: number;
  readonly rotation: Rotation;
  readonly score?: number;
  readonly reason?: string;
}

export interface ChainStep {
  readonly beforeField: Field;
  /** color: 'G' indicates a garbage cell cleared by adjacency. */
  readonly popped: ReadonlyArray<{ row: number; col: number; color: Color | 'G' }>;
  readonly afterPop: Field;
  readonly afterGravity: Field;
  readonly chainIndex: number;
  readonly scoreDelta: number;
}

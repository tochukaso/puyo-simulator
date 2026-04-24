export type Color = 'R' | 'B' | 'Y' | 'P';
export type Cell = Color | null;
export type Rotation = 0 | 1 | 2 | 3; // 0:上 1:右 2:下 3:左

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
  readonly popped: ReadonlyArray<{ row: number; col: number; color: Color }>;
  readonly afterPop: Field;
  readonly afterGravity: Field;
  readonly chainIndex: number;
  readonly scoreDelta: number;
}

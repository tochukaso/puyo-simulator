export interface GameSpecCase {
  name: string;
  seed: number;
  initialField?: string[];
  moves: Array<{ axisCol: number; rotation: 0 | 1 | 2 | 3 }>;
  expected: {
    finalField?: string[];
    score?: number;
    gameover?: boolean;
  };
}

export interface GameSpec {
  cases: GameSpecCase[];
}

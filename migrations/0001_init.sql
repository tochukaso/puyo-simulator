-- score_records: フロントの MatchRecord と同形のスキーマ。
-- mode: 'score' (一人用) または 'match' (対 ama)。
-- turn_limit: 0 = 'unlimited' のセンチネル。それ以外は 30 / 50 / 100 / 200。
-- player_moves / ai_moves: JSON 配列を文字列で保持する (各 move は
-- {axisCol, rotation})。リーダーボード集計しか使わないので、構造化抽出が
-- 必要になったら別カラム追加で対応する。
CREATE TABLE IF NOT EXISTS score_records (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  build_sha TEXT,
  mode TEXT NOT NULL,
  turn_limit INTEGER NOT NULL,
  preset TEXT,
  seed INTEGER NOT NULL,
  player_score INTEGER NOT NULL,
  ai_score INTEGER NOT NULL DEFAULT 0,
  winner TEXT,
  player_moves TEXT NOT NULL,
  ai_moves TEXT NOT NULL DEFAULT '[]'
);

-- リーダーボード ("mode + turn_limit ごとの上位スコア") を効率的に引くための
-- 複合インデックス。新着一覧は created_at DESC で別途貼っておく。
CREATE INDEX IF NOT EXISTS idx_score_records_leaderboard
  ON score_records (mode, turn_limit, player_score DESC);
CREATE INDEX IF NOT EXISTS idx_score_records_created
  ON score_records (created_at DESC);

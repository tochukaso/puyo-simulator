-- デイリーシード機能のためのカラム追加。
--
-- - daily_date: そのレコードがどの日のデイリーチャレンジか (YYYY-MM-DD JST)。
--   通常の score / match レコードでは NULL。'daily' モードでのみ詰まる。
-- - player_name: デイリーリーダーボードに表示するニックネーム。空欄可。
--   match / score 普通モードでも将来名前を出したくなったら再利用できる。
ALTER TABLE score_records ADD COLUMN daily_date TEXT;
ALTER TABLE score_records ADD COLUMN player_name TEXT;

-- リーダーボード ("ある日のトップ N") を効率的に引くための複合インデックス。
-- WHERE daily_date = ? ORDER BY player_score DESC LIMIT N で叩く想定。
CREATE INDEX IF NOT EXISTS idx_score_records_daily
  ON score_records (daily_date, player_score DESC);

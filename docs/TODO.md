# 今後の対応 TODO

シンプルな先送り一覧。チケット番号は付けず、対応時に PR タイトルとリンクで参照。
**確定はしていないけれど将来検討したい案** は別ファイル `docs/IDEAS.md` に置いている。
そちらは雑多な引き出し、こちらは「次やる確度が高いもの」専用。

## サーバー保存(マッチスコアと手順)

スコア勝負モードの結果を**ローカル(IndexedDB)以外にも**サーバー / DB に保存できるようにする。
ローカル保存(`src/match/records.ts`、IndexedDB の `puyo-match.records`)は実装済。
サーバー側がまだ無いので、用意でき次第こちらの作業を再開する。

### 想定スキーマ(JSON)

```jsonc
{
  "id": "01J...",                 // ULID 推奨。クライアント発番でも可
  "createdAt": "2026-04-28T..Z",  // ISO8601
  "buildSha": "29b182d5",         // クライアントの __BUILD_SHA__
  "turnLimit": 100,               // 100 | 200
  "preset": "build",              // 'build' / 'gtr' / 'kaidan' / ...
  "seed": 1234567890,             // 同一ぷよ列の再現用 (32bit int)
  "playerScore": 12345,
  "aiScore": 9876,
  "winner": "player",             // 'player' | 'ai' | 'draw'
  "playerMoves": [                // 1 手 = (axisCol, rotation)
    { "x": 2, "r": 0 },
    ...
  ],
  "aiMoves": [
    { "x": 1, "r": 1 },
    ...
  ],
  "userId": null                  // 認証導入後に追加
}
```

### 想定 API(暫定)

- `POST /api/match-records` — 新規保存。レスポンスに `id`。
- `GET  /api/match-records?limit=50&order=desc` — 一覧。自分のもののみ(認証導入後)。
- `GET  /api/match-records/:id` — 詳細(playerMoves, aiMoves を含む)。
- `DELETE /api/match-records/:id` — 自分のレコードのみ削除可。

### 検討事項

- **認証**: 未ログインでも投稿できるか?(匿名トークン or サインインを必須にするか)
  - 匿名なら IP ベースのレートリミットを入れる
  - OAuth(GitHub / Google)を選ぶならフロントの導入も別タスク
- **保存先**: Cloudflare D1 / KV / R2 / Workers DO のどれを使うか
  - クエリ要件は薄い(時系列リスト + 詳細取得)ので、KV か D1 で十分そう
  - 手順 (`playerMoves` / `aiMoves`) は最大 800 整数 / 件と小さいので JSON 列で OK
- **バリデーション**: `turnLimit` は 100 / 200 のみ、各 move の `x ∈ 0..5`、`r ∈ 0..3` を必須チェック
- **クライアント側の同期**: ローカルにある未送信レコードをサーバーに上げる仕組みが要るか、保存時 1 回限りで終わらせるか
- **共有**: `id` 単位で他人が見られる「リプレイ URL」を発行するか、自分専用に閉じるか

### 実装メモ(クライアント側で先に出来ること)

- `src/match/records.ts` の `MatchRecord` 型と JSON シリアライズはサーバースキーマと同形に揃えてある(変換コスト 0)
- 「サーバー送信」ボタンは UI 側で feature flag (`VITE_ENABLE_SERVER_SAVE`) で出し分ける
- IndexedDB 側はサイズに余裕があるのですぐに上限が来ない見込み。送信成功/失敗フラグや「未送信のものだけ送る」キューイングを入れるかは要件次第

## その他の積み残し

- マッチ開始前に preset を切替えると、AI 側のフォーム評価が変わる挙動を画面で明示したい(現状は左上の Template セレクタが共有)
- AI ヒストリーのスクラバーで「ある時点の AI 候補手」も表示できると教材性が上がる
- 200 手は完走すると重いので、スマホ向けに「30 手電光戦」プリセットも検討

# Cloudflare D1 セットアップ

スコアモードのサーバ保存 (`POST /api/scores` / `GET /api/scores/:id`) は
Cloudflare D1 を使う。本リポジトリは public なので database_id を `wrangler.jsonc`
に書かず、デプロイ時に環境変数から `wrangler.deploy.jsonc` に注入する運用
(`scripts/cf-deploy-prepare.mjs` 参照)。

## 初期セットアップ (1 回のみ)

### 1. D1 データベースを作成

```bash
npx wrangler d1 create puyo-scores
# 出力例:
# ✅ Successfully created DB 'puyo-scores'
# [[d1_databases]]
# binding = "DB"
# database_name = "puyo-scores"
# database_id = "12345678-aaaa-bbbb-cccc-deadbeef1234"
```

ここで出る `database_id` を控えておく。

### 2. GitHub Secrets に database_id を登録

GitHub リポジトリの Settings → Secrets and variables → Actions →
**`D1_DATABASE_ID`** を新規作成して上記の UUID を貼る。

### 3. リモート (本番) にスキーマを適用

ローカルから 1 回だけ:

```bash
export CLOUDFLARE_API_TOKEN=...   # Workers/D1 編集権限
export CLOUDFLARE_ACCOUNT_ID=...
npx wrangler d1 migrations apply puyo-scores --remote
```

(`npm run db:migrate:remote` でも可。)

## ローカル開発

`.wrangler/state/` 配下に sqlite ファイルが作られて、本番 D1 の代わりに使われる。

```bash
# 1 回だけ: ローカル sqlite にもスキーマを適用
npm run db:migrate:local

# 開発サーバ起動 (vite + Worker 同居)
npm run dev
```

`/api/scores` への POST/GET はローカル sqlite に対して動く。

## マイグレーション追加

`migrations/0002_*.sql` のように連番で SQL ファイルを追加する。
`npm run db:migrate:local` / `npm run db:migrate:remote` で適用される。

## トラブルシューティング

- **Deploy 後に `/api/scores` が 500**: `D1_DATABASE_ID` Secret が未設定で
  d1 バインドが落とされたか、ID が間違ってバインドが立っているのに DB に
  到達できない可能性。前者の場合 `/api/scores` ハンドラは登録されているが
  `env.DB` が undefined で例外を投げて 500 になる(API ハンドラ未登録時の
  汎用 404 とは別経路)。`scripts/cf-deploy-prepare.mjs` のログで
  `database_id を inject` か `d1 バインドを除去` のどちらが出たか確認する。
- **ローカルで API が動かない**: `npm run db:migrate:local` を実行した上で
  `npm run dev` を起動しているか確認。

## API サマリ

| メソッド | パス | 用途 |
| --- | --- | --- |
| POST | `/api/scores` | スコアレコードを保存。ID を発番して返す。 |
| GET | `/api/scores/:id` | 保存済みレコードを取得。 |

リクエスト/レスポンス形式は `worker/index.ts` と `src/api/scoresClient.ts` を参照。

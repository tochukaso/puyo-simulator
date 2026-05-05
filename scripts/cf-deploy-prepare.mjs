#!/usr/bin/env node
// Generate `wrangler.deploy.jsonc` from `wrangler.jsonc` by injecting deploy-only
// fields (currently the custom domain route) sourced from environment variables.
//
// なぜ必要か:
// - `wrangler.jsonc` は public repo に commit されるため、デプロイ先のドメインや
//   D1 の database_id 等の environment-specific な値を含めたくない。
// - そのまま `routes` を空のまま deploy するとカスタムドメインの紐付けが解除される。
// - そこでデプロイ直前にこのスクリプトで `wrangler.deploy.jsonc` を生成し、
//   `wrangler deploy --config wrangler.deploy.jsonc` で利用する。
//
// 必要な環境変数:
//   CUSTOM_DOMAIN     例: puyo.tochukaso.blog
//   D1_DATABASE_ID    例: 12345678-...-... (`wrangler d1 create puyo-scores` で得る UUID)
//
// CUSTOM_DOMAIN が未設定なら deploy を中断する(custom domain を不意に剥がさない)。
// D1_DATABASE_ID が未設定の場合、wrangler.jsonc の d1_databases バインドを
// 落として deploy する (= API は 500 を返すが、deploy 自体は通す)。

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = resolve(here, "..", "wrangler.jsonc");
const TARGET = resolve(here, "..", "wrangler.deploy.jsonc");

const customDomain = process.env.CUSTOM_DOMAIN?.trim();
if (!customDomain) {
  console.error(
    "[cf-deploy-prepare] CUSTOM_DOMAIN が未設定のためデプロイを中断します。\n" +
      "  ローカル: `export CUSTOM_DOMAIN=puyo.tochukaso.blog` などで設定してください。\n" +
      "  CI: GitHub Secrets に CUSTOM_DOMAIN を登録してください。",
  );
  process.exit(1);
}

// scheme/path/port を含む値はホスト名として不正 → wrangler に渡す前に弾く。
// RFC 1123 に準拠したホスト名(各ラベル 1-63 文字、合計 ≤253、`-` 先頭末尾不可、
// ドット区切りで 2 ラベル以上)。
const hostnamePattern =
  /^(?=.{1,253}$)(?!-)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.(?!-)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
if (!hostnamePattern.test(customDomain)) {
  console.error(
    `[cf-deploy-prepare] CUSTOM_DOMAIN の形式が不正です: "${customDomain}"\n` +
      "  scheme (http://), パス (/...), ポート (:8080) は付けず、ホスト名のみ指定してください。\n" +
      "  例: puyo.tochukaso.blog",
  );
  process.exit(1);
}

const raw = readFileSync(SOURCE, "utf8");
// JSONC の // と /* */ コメントを素朴に除去(ブロックコメント内の //, 文字列内の
// // などのエッジケースは現状の wrangler.jsonc に存在しないため考慮していない)。
const stripped = raw
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

const config = JSON.parse(stripped);
config.routes = [{ pattern: customDomain, custom_domain: true }];

// D1_DATABASE_ID が来ていれば wrangler.jsonc 側の d1 バインドに database_id を
// 注入する。来ていなければ d1 バインド自体を消して、API を持たない静的サイト
// 相当で deploy できるようにしておく (binding 必須だと初回 deploy が詰む)。
const d1Id = process.env.D1_DATABASE_ID?.trim();
if (Array.isArray(config.d1_databases) && config.d1_databases.length > 0) {
  if (d1Id) {
    for (const db of config.d1_databases) db.database_id = d1Id;
    console.log(
      `[cf-deploy-prepare] injected database_id into ${config.d1_databases.length} D1 binding(s)`,
    );
  } else {
    console.warn(
      "[cf-deploy-prepare] D1_DATABASE_ID 未設定のため d1_databases バインドを除去して deploy します (API は 500 を返します)。",
    );
    delete config.d1_databases;
  }
}

writeFileSync(TARGET, JSON.stringify(config, null, 2) + "\n");
console.log(
  `[cf-deploy-prepare] wrote ${TARGET} with route { pattern: "${customDomain}", custom_domain: true }`,
);

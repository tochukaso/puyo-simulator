#!/usr/bin/env node
// Generate `wrangler.deploy.jsonc` from `wrangler.jsonc` by injecting deploy-only
// fields (currently the custom domain route) sourced from environment variables.
//
// なぜ必要か:
// - `wrangler.jsonc` は public repo に commit されるため、デプロイ先のドメインを
//   含めたくない。
// - そのまま `routes` を空のまま deploy するとカスタムドメインの紐付けが解除される。
// - そこでデプロイ直前にこのスクリプトで `wrangler.deploy.jsonc` を生成し、
//   `wrangler deploy --config wrangler.deploy.jsonc` で利用する。
//
// 必要な環境変数:
//   CUSTOM_DOMAIN  例: puyo.tochukaso.blog
//
// CUSTOM_DOMAIN が未設定なら deploy を中断する(custom domain を不意に剥がさない)。

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

const raw = readFileSync(SOURCE, "utf8");
// JSONC の // と /* */ コメントを素朴に除去(ブロックコメント内の //, 文字列内の
// // などのエッジケースは現状の wrangler.jsonc に存在しないため考慮していない)。
const stripped = raw
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

const config = JSON.parse(stripped);
config.routes = [{ pattern: customDomain, custom_domain: true }];

writeFileSync(TARGET, JSON.stringify(config, null, 2) + "\n");
console.log(
  `[cf-deploy-prepare] wrote ${TARGET} with route { pattern: "${customDomain}", custom_domain: true }`,
);

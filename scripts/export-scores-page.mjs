#!/usr/bin/env node
// Copy scripts/blog-pages/scores/ to a destination directory so the daily
// scores listing page can be hosted from the user's puyo-blog static site.
// The page is fully self-contained (HTML + inline CSS/JS) and calls
// `https://puyo.tochukaso.blog/api/daily/scores` directly via CORS-enabled
// fetch — no build step or runtime is required on the blog side.
//
// Usage:
//   npm run scores:export                          # → ~/puyo-blog/scores/
//   PUYO_SCORES_DEST=/some/path npm run scores:export
//   npm run scores:export -- /some/path

import { cpSync, mkdirSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, 'blog-pages', 'scores');

const argDest = process.argv[2];
const envDest = process.env.PUYO_SCORES_DEST;
const DEST = resolve(argDest || envDest || `${homedir()}/puyo-blog/scores`);

try {
  statSync(SRC);
} catch {
  console.error(`[scores:export] source not found: ${SRC}`);
  process.exit(1);
}

mkdirSync(DEST, { recursive: true });
cpSync(SRC, DEST, { recursive: true, force: true });

console.log(`[scores:export] copied ${SRC} → ${DEST}`);

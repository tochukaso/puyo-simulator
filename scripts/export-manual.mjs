#!/usr/bin/env node
// Copy public/manual/ to a destination directory so the manual can be hosted
// from another static site (e.g. the user's puyo-blog). The manual is fully
// static (HTML + CSS + PNG) — no build step is required to host it elsewhere.
//
// Usage:
//   npm run manual:export                          # → ~/puyo-blog/manual/
//   PUYO_MANUAL_DEST=/some/path npm run manual:export
//   npm run manual:export -- /some/path

import { cpSync, mkdirSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, '..', 'public', 'manual');

const argDest = process.argv[2];
const envDest = process.env.PUYO_MANUAL_DEST;
const DEST = resolve(argDest || envDest || `${homedir()}/puyo-blog/manual`);

try {
  statSync(SRC);
} catch {
  console.error(`[manual:export] source not found: ${SRC}`);
  process.exit(1);
}

mkdirSync(DEST, { recursive: true });
cpSync(SRC, DEST, { recursive: true, force: true });

console.log(`[manual:export] copied ${SRC} → ${DEST}`);

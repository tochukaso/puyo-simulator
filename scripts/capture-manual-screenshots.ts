import { chromium, type Page } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.PUYO_URL || 'http://localhost:5177/';
const OUT = join(
  process.cwd(),
  'public/manual/assets/screenshots',
);

mkdirSync(OUT, { recursive: true });

async function setLang(page: Page, lang: 'ja' | 'en' | 'zh' | 'ko') {
  await page.evaluate((l) => {
    localStorage.setItem('puyo.ui.lang', l);
  }, lang);
}

async function gotoFresh(page: Page, lang: 'ja' | 'en' | 'zh' | 'ko') {
  await page.goto(BASE);
  await setLang(page, lang);
  await page.reload();
  await page.waitForSelector('header');
  await page.waitForTimeout(800);
}

async function shot(page: Page, name: string) {
  const path = join(OUT, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  console.log('saved', path);
}

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1100, height: 820 },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();

  // ---- English baseline screenshots ----
  await gotoFresh(page, 'en');
  await shot(page, 'free-en');

  // Hamburger menu open
  await page.getByRole('button', { name: /Menu/i }).click();
  await page.waitForTimeout(300);
  await shot(page, 'menu-en');
  await page.keyboard.press('Escape');
  await page.mouse.click(50, 400);
  await page.waitForTimeout(200);

  // Trainer GTR
  await page.getByRole('button', { name: /Menu/i }).click();
  await page.waitForTimeout(200);
  await page.locator('select').filter({ hasText: /None|GTR|Staircase/ }).first().selectOption('gtr');
  await page.waitForTimeout(200);
  await page.mouse.click(50, 400);
  await page.waitForTimeout(300);
  await shot(page, 'trainer-gtr-en');

  // Reset trainer
  await page.getByRole('button', { name: /Menu/i }).click();
  await page.waitForTimeout(200);
  await page.locator('select').filter({ hasText: /None|GTR|Staircase/ }).first().selectOption('off');
  await page.mouse.click(50, 400);
  await page.waitForTimeout(200);

  // Edit mode
  await page.getByRole('button', { name: /^Edit$/ }).click();
  await page.waitForTimeout(400);
  await shot(page, 'edit-en');
  await page.getByRole('button', { name: /Cancel/i }).click();
  await page.waitForTimeout(200);

  // Match mode (Score vs ama)
  const modeSelect = page.locator('select[aria-label="Mode"]');
  await modeSelect.selectOption('match');
  await page.waitForTimeout(800);
  await shot(page, 'match-en');

  // Score attack mode
  await modeSelect.selectOption('score');
  await page.waitForTimeout(800);
  await shot(page, 'score-en');

  // Back to free
  await modeSelect.selectOption('free');
  await page.waitForTimeout(400);

  // Records dialog (open via menu)
  await page.getByRole('button', { name: /Menu/i }).click();
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: /Saved matches/i }).click();
  await page.waitForTimeout(400);
  await shot(page, 'records-en');
  await page.getByRole('button', { name: /Close/i }).click();
  await page.waitForTimeout(200);

  // Share dialog
  await page.getByRole('button', { name: /Menu/i }).click();
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: /^Share$/i }).click();
  await page.waitForTimeout(400);
  await shot(page, 'share-en');
  await page.getByRole('button', { name: /Close/i }).click();
  await page.waitForTimeout(200);

  // ---- Japanese variant (just default + menu) ----
  await gotoFresh(page, 'ja');
  await shot(page, 'free-ja');
  await page.getByRole('button', { name: /メニュー/ }).click();
  await page.waitForTimeout(300);
  await shot(page, 'menu-ja');

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import { test, expect } from '@playwright/test';

test('MVP happy path', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Puyo Training')).toBeVisible();
  await expect(page.getByText(/AI: heuristic/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reset' })).toBeVisible();

  await page.getByRole('button', { name: /確定/ }).click();
  await expect(page.getByText(/Score:/)).toBeVisible();
});

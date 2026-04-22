import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const OUT_DIR = path.join(
  __dirname,
  '..',
  '.cst-rebuild-v3',
  'logs',
  'visual-qa',
);
const ensureDir = () => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
};
const shot = async (page: Page, name: string) => {
  ensureDir();
  await page.screenshot({
    path: path.join(OUT_DIR, `${name}.png`),
    fullPage: true,
  });
};

test.describe('Phase 4 — Post-generation, attempt 2', () => {
  test('click center Generate Schedule, wait for grid or content change',
    async ({ page }, testInfo) => {
      await page.setViewportSize({ width: 1920, height: 1080 });

      // Capture console errors for diagnostics.
      const consoleErrors: string[] = [];
      page.on('pageerror', (err) => consoleErrors.push(String(err)));
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });

      // Network errors too.
      const netErrors: string[] = [];
      page.on('response', (r) => {
        if (r.status() >= 400) netErrors.push(`${r.status()} ${r.url()}`);
      });

      await page.goto('/');
      await page.waitForLoadState('networkidle');
      await page.locator('a[href^="/offices/"]:not([href="/offices/new"])').first().click();
      await page.waitForLoadState('networkidle');
      await shot(page, '40-pre-generate');

      // Click the CENTER CTA precisely using its exact text.
      const cta = page.getByRole('button', { name: 'Generate Schedule' });
      await cta.click();
      // Wait for any grid-ish container.
      const gridCandidate = page
        .locator(
          '[role="grid"], [data-schedule-v2], [data-testid="schedule-grid"], table, [data-slot-cell], .schedule-grid',
        )
        .first();
      const appeared = await gridCandidate
        .waitFor({ state: 'visible', timeout: 15000 })
        .then(() => true)
        .catch(() => false);

      await page.waitForTimeout(1500);
      await shot(page, '41-post-generate');

      // Dump console + network errors.
      const diag = {
        gridAppeared: appeared,
        consoleErrors: consoleErrors.slice(0, 20),
        netErrors: netErrors.slice(0, 20),
        url: page.url(),
        gridCount: await page.locator('[role="grid"]').count(),
        tableCount: await page.locator('table').count(),
      };
      fs.writeFileSync(path.join(OUT_DIR, 'generate-diag.json'), JSON.stringify(diag, null, 2));
      testInfo.annotations.push({
        type: 'diag',
        description: JSON.stringify(diag).substring(0, 400),
      });
    });

  test('alternative path — Choose a Starter Template',
    async ({ page }, testInfo) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      await page.locator('a[href^="/offices/"]:not([href="/offices/new"])').first().click();
      await page.waitForLoadState('networkidle');

      const choose = page.getByRole('button', { name: /Choose a Starter Template/i });
      if (await choose.isVisible().catch(() => false)) {
        await choose.click();
        await page.waitForTimeout(1500);
        await shot(page, '42-starter-template-modal');
      } else {
        await shot(page, '42-starter-template-not-visible');
      }
    });
});

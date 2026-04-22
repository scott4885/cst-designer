import { test, expect } from '@playwright/test';

/**
 * Sprint 5 E2E — Intake V2 wizard tab + Advisory panel + markdown download.
 *
 * These specs target the dev server (PHASE6_TARGET != 'live') by default.
 * When PHASE6_TARGET=live is set, they use the live Coolify URL instead.
 */

const LIVE_BASE = process.env.PHASE6_TARGET === 'live'
  ? 'http://cst.142.93.182.236.sslip.io'
  : '';

test.describe('Sprint 5 — Intake V2 tab', () => {
  test('new office wizard shows the 5th Intake Advisory tab', async ({ page }) => {
    await page.goto(`${LIVE_BASE}/offices/new?tab=intake`);

    const intakeTab = page.getByTestId('tab-intake');
    await expect(intakeTab).toBeVisible({ timeout: 10000 });
    await intakeTab.click();

    // Completeness badge should be visible.
    await expect(page.locator('text=/complete/i').first()).toBeVisible();

    // A couple of form controls should be visible.
    await expect(page.getByTestId('tab-content-intake')).toBeVisible();
  });
});

test.describe('Sprint 5 — Advisory panel surfaces', () => {
  test('advisory page renders the generate controls', async ({ page }) => {
    // Navigate to the first existing office — advisory page requires a real id.
    await page.goto(`${LIVE_BASE}/`);
    const firstOffice = page.locator('a[href^="/offices/"]').first();

    if (!(await firstOffice.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(true, 'No offices in this environment to exercise advisory');
      return;
    }

    const href = await firstOffice.getAttribute('href');
    if (!href) {
      test.skip(true, 'Office link missing href');
      return;
    }

    // Navigate directly to the advisory route.
    await page.goto(`${LIVE_BASE}${href}/advisory`);

    // Panel mounts.
    await expect(page.getByTestId('advisory-panel')).toBeVisible({ timeout: 10000 });

    // Generate buttons are present (may be disabled until intake is filled).
    await expect(page.getByTestId('advisory-generate-btn')).toBeVisible();
    await expect(page.getByTestId('advisory-variants-btn')).toBeVisible();
  });

  test('main office page exposes Open Advisory quick-link', async ({ page }) => {
    await page.goto(`${LIVE_BASE}/`);
    const firstOffice = page.locator('a[href^="/offices/"]').first();
    if (!(await firstOffice.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(true, 'No offices in this environment');
      return;
    }
    const href = await firstOffice.getAttribute('href');
    if (!href) {
      test.skip(true);
      return;
    }
    await page.goto(`${LIVE_BASE}${href}`);
    await expect(page.getByTestId('open-advisory-btn')).toBeVisible({ timeout: 10000 });
  });
});

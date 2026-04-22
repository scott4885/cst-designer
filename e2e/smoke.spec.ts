import { test, expect } from '@playwright/test';

/**
 * Phase 4 Smoke — minimal end-to-end verification.
 *
 * Opens the app, navigates into the first office, generates a schedule if
 * one isn't already present, waits for the V2 schedule canvas to render,
 * asserts a block is visible, hovers it, and verifies the hover popover
 * appears. Captures a screenshot at `smoke-passed.png` on success.
 *
 * Selectors are driven by the production source:
 *   • [data-testid="sg-canvas-v2"]  → ScheduleCanvasV2 root
 *   • [data-block-id]               → BlockInstance rendered block
 *   • [role="tooltip"]              → BlockHoverPopover
 */

test('smoke: home → office → generate → block → popover', async ({ page }) => {
  test.setTimeout(60_000);

  await page.goto('/');

  // Fetch a real office id via the API so we navigate directly to a seeded
  // office detail page rather than scraping the home layout.
  const res = await page.request.get('/api/offices');
  expect(res.ok(), 'GET /api/offices must return 200').toBe(true);
  const offices = (await res.json()) as Array<{ id: string }>;
  if (!Array.isArray(offices) || offices.length === 0) {
    test.skip(true, 'No offices in database — seed required.');
    return;
  }
  const officeId = offices[0].id;

  await page.goto(`/offices/${officeId}`);
  await expect(page.locator('main')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });

  // If the V2 canvas is not already rendered, trigger schedule generation.
  const canvas = page.locator('[data-testid="sg-canvas-v2"]').first();
  if (!(await canvas.isVisible({ timeout: 2_000 }).catch(() => false))) {
    const generateBtn = page.getByRole('button', { name: /generate schedule/i }).first();
    if (await generateBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await generateBtn.click();
    } else {
      // Some layouts surface "Generate" in a toolbar.
      const altBtn = page.getByRole('button', { name: /^generate/i }).first();
      if (await altBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await altBtn.click();
      }
    }
  }

  // Wait for the V2 canvas to mount after generation.
  await expect(canvas).toBeVisible({ timeout: 25_000 });

  // A block must render inside the canvas.
  const block = page.locator('[data-block-id]').first();
  await expect(block).toBeVisible({ timeout: 10_000 });

  // Hover then activate — BlockInstance opens the hover popover on click/
  // keyboard activation (see BlockInstance.tsx onClick → onActivate). Hover
  // first to match UX parity, then click to surface the tooltip.
  await block.hover();
  await block.click();
  const popover = page.locator('[role="tooltip"]').first();
  await expect(popover).toBeVisible({ timeout: 5_000 });

  await page.screenshot({ path: 'smoke-passed.png', fullPage: false });
});

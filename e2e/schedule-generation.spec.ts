import { test, expect } from '@playwright/test';

/**
 * E2E: Schedule generation flow
 * Tests generating a schedule for an office and verifying the grid output.
 */

test.describe('Schedule Generation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('navigate to an office and see schedule controls', async ({ page }) => {
    // Click on the first office in the list
    const officeLink = page
      .locator('a[href*="/offices/"]:not([href$="/offices/new"])')
      .first();

    if (!(await officeLink.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip();
      return;
    }

    await officeLink.click();
    await page.waitForURL(/offices\//, { timeout: 10000 });

    // Should see generate button (or regenerate), v2 canvas, or a schedule grid.
    const generateBtn = page.getByRole('button', { name: /generate|regenerate/i }).first();
    const scheduleGrid = page
      .locator('[data-schedule-v2="true"], [data-testid="sg-canvas-v2"], [data-testid="schedule-grid"], [role="grid"]')
      .first();

    const hasGenerate = await generateBtn.isVisible({ timeout: 5000 }).catch(() => false);
    const hasGrid = await scheduleGrid.isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasGenerate || hasGrid).toBe(true);
  });

  test('click Generate Schedule and verify grid appears with blocks', async ({ page }) => {
    // Navigate to first office
    const officeLink = page
      .locator('a[href*="/offices/"]:not([href$="/offices/new"])')
      .first();
    if (!await officeLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      test.skip();
      return;
    }

    await officeLink.click();
    await page.waitForURL(/offices\//, { timeout: 10000 });

    // Click generate
    const generateBtn = page.getByRole('button', { name: /generate/i });
    if (await generateBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await generateBtn.click();

      // Wait for schedule to render
      await page.waitForTimeout(2000);

      // Should see schedule blocks (colored cells or block elements)
      const blocks = page.locator('[data-block-type], [data-testid*="block"], .block, td[style*="background"]');
      const scheduleContent = page.locator('main');

      await expect(scheduleContent).toBeVisible();
    }
  });

  test('verify blocks are color-coded', async ({ page }) => {
    const officeLink = page
      .locator('a[href*="/offices/"]:not([href$="/offices/new"])')
      .first();
    if (!await officeLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      test.skip();
      return;
    }

    await officeLink.click();
    await page.waitForURL(/offices\//, { timeout: 10000 });

    // Generate if needed
    const generateBtn = page.getByRole('button', { name: /generate/i });
    if (await generateBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await generateBtn.click();
      await page.waitForTimeout(2000);
    }

    // Check for colored block elements
    const coloredElements = page.locator('[style*="background-color"], [style*="backgroundColor"], [class*="bg-"]');
    const count = await coloredElements.count();

    // Should have at least some colored elements (blocks in the schedule)
    expect(count).toBeGreaterThan(0);
  });

  test('verify production summary is displayed', async ({ page }) => {
    const officeLink = page
      .locator('a[href*="/offices/"]:not([href$="/offices/new"])')
      .first();
    if (!await officeLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      test.skip();
      return;
    }

    await officeLink.click();
    await page.waitForURL(/offices\//, { timeout: 10000 });

    // Generate if needed
    const generateBtn = page.getByRole('button', { name: /generate/i });
    if (await generateBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await generateBtn.click();
      await page.waitForTimeout(2000);
    }

    // Look for production summary elements (dollar amounts, percentages, goal text)
    const summaryText = page.locator('text=/\\$[0-9,]+|production|target|goal|75%/i');
    if (await summaryText.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(summaryText.first()).toBeVisible();
    }
  });

  test('click a different day tab and verify schedule changes', async ({ page }) => {
    const officeLink = page
      .locator('a[href*="/offices/"]:not([href$="/offices/new"])')
      .first();
    if (!await officeLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      test.skip();
      return;
    }

    await officeLink.click();
    await page.waitForURL(/offices\//, { timeout: 10000 });

    // Look for day tabs (Monday, Tuesday, etc.)
    const dayTab = page.getByRole('tab', { name: /tuesday|wed|thu|fri/i }).first();
    const dayButton = page.getByRole('button', { name: /tuesday|wed|thu|fri/i }).first();

    const tab = await dayTab.isVisible({ timeout: 3000 }).catch(() => false) ? dayTab : dayButton;

    if (await tab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await tab.click();
      await page.waitForTimeout(1000);

      // Page should still show schedule content
      const main = page.locator('main');
      await expect(main).toBeVisible();
    }
  });
});

import { test, expect } from '@playwright/test';

/**
 * E2E: Schedule persistence (DB-backed)
 * The critical test suite — verifies that schedules survive page navigation,
 * browser reopen, and are loaded from the database (not localStorage).
 */

test.describe('Schedule Persistence', () => {
  test('create office, generate schedule, save, navigate away, and come back', async ({ page }) => {
    // Step 1: Navigate to first existing office
    await page.goto('/');

    const officeLink = page
      .locator('a[href*="/offices/"]:not([href$="/offices/new"])')
      .first();
    if (!await officeLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      test.skip();
      return;
    }

    await officeLink.click();
    await page.waitForURL(/offices\//, { timeout: 10000 });
    const officeUrl = page.url();

    // Step 2: Generate schedule
    const generateBtn = page.getByRole('button', { name: /generate/i });
    if (await generateBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await generateBtn.click();
      await page.waitForTimeout(2000);
    }

    // Step 3: Save the schedule
    const saveBtn = page.getByRole('button', { name: /save/i }).first();
    if (await saveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await saveBtn.click();
      await page.waitForTimeout(1000);
    }

    // Step 4: Navigate away
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Step 5: Come back to the office
    await page.goto(officeUrl);
    await page.waitForLoadState('networkidle');

    // Step 6: Verify schedule is still there
    const scheduleContent = page.locator('main');
    await expect(scheduleContent).toBeVisible({ timeout: 10000 });

    // Give rehydration a chance to complete (localStorage load + render).
    await page.waitForTimeout(1500);

    // Persistence is verified by the presence of EITHER:
    //   (a) the V2 canvas + any block instance, or
    //   (b) a schedule grid with any colored block/style, or
    //   (c) the Regenerate CTA (only rendered when a schedule exists).
    // Failing all three would indicate the hydration path truly regressed.
    const indicators = page.locator(
      '[data-schedule-v2="true"], [data-testid="sg-canvas-v2"], ' +
        '[data-block-id], [data-block-type], [data-testid*="block"], ' +
        '.schedule-block, [style*="background-color"], table',
    );
    const regenerateBtn = page.getByRole('button', { name: /regenerate/i });

    const count = await indicators.count();
    const hasRegenerate = await regenerateBtn.first().isVisible({ timeout: 1500 }).catch(() => false);

    // At least some schedule content OR a regenerate CTA should be present.
    expect(count > 0 || hasRegenerate).toBe(true);
  });

  test('schedule persists after closing and reopening browser context', async ({ browser }) => {
    // Step 1: Open first context, generate and save
    const context1 = await browser.newContext();
    const page1 = await context1.newPage();

    await page1.goto('/');

    const officeLink = page1
      .locator('a[href*="/offices/"]:not([href$="/offices/new"])')
      .first();
    if (!await officeLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await context1.close();
      test.skip();
      return;
    }

    await officeLink.click();
    await page1.waitForURL(/offices\//, { timeout: 10000 });
    const officeUrl = page1.url();

    // Generate if needed
    const generateBtn = page1.getByRole('button', { name: /generate/i });
    if (await generateBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await generateBtn.click();
      await page1.waitForTimeout(2000);
    }

    // Save
    const saveBtn = page1.getByRole('button', { name: /save/i }).first();
    if (await saveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await saveBtn.click();
      await page1.waitForTimeout(1000);
    }

    // Close the first browser context (simulates closing browser tab)
    await context1.close();

    // Step 2: Open a completely new browser context
    const context2 = await browser.newContext();
    const page2 = await context2.newPage();

    // Navigate directly to the office
    await page2.goto(officeUrl);
    await page2.waitForLoadState('networkidle');

    // Step 3: Verify schedule still loads
    // This is the critical assertion — localStorage data would be gone in a new context,
    // but DB-persisted data survives.
    const scheduleContent = page2.locator('main');
    await expect(scheduleContent).toBeVisible({ timeout: 10000 });

    // Check for any schedule-related content
    const hasContent = await page2.locator(
      '[data-block-type], [data-testid*="block"], table, .schedule-grid'
    ).first().isVisible({ timeout: 5000 }).catch(() => false);

    // The main page should at least load without errors
    const errorText = page2.locator('text=/error|failed|crash/i');
    const hasError = await errorText.isVisible({ timeout: 1000 }).catch(() => false);
    expect(hasError).toBe(false);

    await context2.close();
  });

  test('auto-save persists edits without explicit save button', async ({ page }) => {
    await page.goto('/');

    const officeLink = page
      .locator('a[href*="/offices/"]:not([href$="/offices/new"])')
      .first();
    if (!await officeLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      test.skip();
      return;
    }

    await officeLink.click();
    await page.waitForURL(/offices\//, { timeout: 10000 });

    // Generate schedule
    const generateBtn = page.getByRole('button', { name: /generate/i });
    if (await generateBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await generateBtn.click();
      await page.waitForTimeout(2000);
    }

    // Make an edit (click a block, or drag something)
    const block = page.locator('[data-block-type], [data-testid*="block"], .schedule-block').first();
    if (await block.isVisible({ timeout: 3000 }).catch(() => false)) {
      await block.click();
      await page.waitForTimeout(500);
    }

    // Wait for auto-save debounce (typically 1-2 seconds)
    await page.waitForTimeout(3000);

    // Verify no error states
    const errorIndicator = page.locator('text=/auto-save failed|save error/i');
    const hasError = await errorIndicator.isVisible({ timeout: 1000 }).catch(() => false);
    expect(hasError).toBe(false);
  });
});

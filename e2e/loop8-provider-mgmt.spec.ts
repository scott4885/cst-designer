/**
 * Loop 8 — Smoke tests for inline provider drawer, clone, and bulk goals.
 *
 * Runs against the real dev server + seeded DB (Smile Cascade).
 */
import { test, expect } from '@playwright/test';

const OFFICE_ID = 'cmo0lxax0000fgkj7d1jvh2pn';

test.describe('Loop 8 — Provider management', () => {
  test('Inline drawer: adds 3 providers quickly', async ({ page }) => {
    await page.goto(`/offices/${OFFICE_ID}/edit`);
    await expect(page.getByRole('heading', { name: 'Edit Office' })).toBeVisible();

    // Count baseline providers.
    const baseline = await page.locator('h3', { hasText: /^Provider \d+$/ }).count();

    const t0 = Date.now();

    for (const [i, name] of [
      'Dr. Stopwatch Alpha',
      'Dr. Stopwatch Beta',
      'Dr. Stopwatch Gamma',
    ].entries()) {
      // Open dialog (first time) or reuse the "Save & add another" loop.
      if (i === 0) {
        await page.getByTestId('add-provider-btn').click();
      }
      await expect(page.getByTestId('provider-form-dialog')).toBeVisible();
      await page.locator('#provider-dialog-name').fill(name);
      // Goal quickly
      await page.locator('#provider-dialog-goal').fill('5000');
      if (i < 2) {
        await page.getByRole('button', { name: 'Save & add another' }).click();
      } else {
        await page.getByRole('button', { name: 'Save provider' }).click();
      }
      // Wait for dialog to reset (for i<2) or close (for i=2).
      if (i < 2) {
        // Wait until the name field is empty again.
        await expect(page.locator('#provider-dialog-name')).toHaveValue('');
      } else {
        await expect(page.getByTestId('provider-form-dialog')).toBeHidden();
      }
    }

    const elapsedMs = Date.now() - t0;
    console.log(`[loop8] Added 3 providers inline in ${elapsedMs}ms`);

    const after = await page.locator('h3', { hasText: /^Provider \d+$/ }).count();
    expect(after).toBe(baseline + 3);
    expect(elapsedMs).toBeLessThan(90_000);
  });

  test('Clone provider: prefills the dialog from an existing row', async ({ page }) => {
    await page.goto(`/offices/${OFFICE_ID}/edit`);
    await expect(page.getByRole('heading', { name: 'Edit Office' })).toBeVisible();
    // Read the first provider's name so we can verify the clone suffix.
    const firstNameInput = page.locator('input[name="providers.0.name"]');
    const firstName = await firstNameInput.inputValue();

    await page.getByTestId('clone-provider-0-btn').click();
    await expect(page.getByTestId('provider-form-dialog')).toBeVisible();
    // Name should carry over with "(Copy)" appended.
    const cloneName = await page.locator('#provider-dialog-name').inputValue();
    expect(cloneName).toBe(`${firstName} (Copy)`);
    // Goal should carry over (non-zero).
    const cloneGoal = await page.locator('#provider-dialog-goal').inputValue();
    expect(Number(cloneGoal)).toBeGreaterThan(0);
    // Close without saving.
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByTestId('provider-form-dialog')).toBeHidden();
  });

  test('Bulk edit goals: stages updates to the form', async ({ page }) => {
    await page.goto(`/offices/${OFFICE_ID}/edit`);
    await expect(page.getByRole('heading', { name: 'Edit Office' })).toBeVisible();

    // Read the current goal on providers 0 and 1 so we can restore them.
    const g0 = await page.locator('input[name="providers.0.dailyGoal"]').inputValue();
    const g1 = await page.locator('input[name="providers.1.dailyGoal"]').inputValue();

    await page.getByTestId('bulk-edit-goals-btn').click();
    await expect(page.getByText('Bulk edit daily goals')).toBeVisible();

    // Quick-apply $7,500 to every provider.
    await page.getByRole('button', { name: '$7,500' }).click();
    await page.getByRole('button', { name: 'Stage goal updates' }).click();

    // Dialog closes and the dailyGoal inputs on the main form should now
    // all read 7500.
    const firstGoal = page.locator('input[name="providers.0.dailyGoal"]');
    await expect(firstGoal).toHaveValue('7500');

    // Restore the original goals (non-destructive) and leave the form untouched
    // for subsequent manual inspection.
    await page.locator('input[name="providers.0.dailyGoal"]').fill(g0);
    await page.locator('input[name="providers.1.dailyGoal"]').fill(g1);
  });
});

import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Phase 4 Visual QA — screenshot matrix + interaction verification.
 *
 * This spec is additive; it does not modify source code. It captures a
 * full matrix of widths, states, and interactions into
 * `.cst-rebuild-v3/logs/visual-qa/` for defect analysis.
 */

const OUT_DIR = path.join(
  __dirname,
  '..',
  '.cst-rebuild-v3',
  'logs',
  'visual-qa',
);

const WIDTHS: Array<{ name: string; w: number; h: number }> = [
  { name: '1920', w: 1920, h: 1080 },
  { name: '1440', w: 1440, h: 900 },
  { name: '1280', w: 1280, h: 800 },
  { name: '1024', w: 1024, h: 768 },
  { name: '768', w: 768, h: 1024 },
  { name: '390', w: 390, h: 844 },
];

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

const getFirstOfficeLink = async (page: Page) => {
  // Home lists existing offices. '/offices' has no page.tsx, so always go to '/'.
  await page.goto('/');
  await page.waitForLoadState('networkidle').catch(() => {});
  // Skip the "new office" link, take the first one pointing to a real id.
  const link = page
    .locator('a[href^="/offices/"]:not([href="/offices/new"])')
    .first();
  await link.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
  return link;
};

test.describe('Phase 4 — Screenshot matrix', () => {
  for (const { name, w, h } of WIDTHS) {
    test(`home at ${name}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await page.goto('/');
      await page.waitForLoadState('networkidle').catch(() => {});
      await shot(page, `01-home-${name}`);
    });

    test(`office detail at ${name}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      const link = await getFirstOfficeLink(page);
      if (!(await link.isVisible().catch(() => false))) {
        test.skip(true, 'no office to click');
        return;
      }
      await link.click();
      await page.waitForURL(/offices\//, { timeout: 10000 }).catch(() => {});
      await page.waitForLoadState('networkidle').catch(() => {});
      await shot(page, `02-office-detail-${name}`);
    });
  }
});

test.describe('Phase 4 — State screenshots', () => {
  test('empty state (no office selected via invalid path)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/offices');
    await page.waitForLoadState('networkidle').catch(() => {});
    await shot(page, '10-empty-offices-list');
  });

  test('error state via invalid office id', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/offices/does-not-exist-99999');
    await page.waitForTimeout(2000);
    await shot(page, '11-error-invalid-office-id');
  });

  test('loading state snapshot mid-generation', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const link = await getFirstOfficeLink(page);
    if (!(await link.isVisible().catch(() => false))) {
      test.skip(true, 'no office');
      return;
    }
    await link.click();
    await page.waitForURL(/offices\//, { timeout: 10000 }).catch(() => {});
    await page.waitForLoadState('networkidle').catch(() => {});

    const genBtn = page.getByRole('button', { name: /generate/i }).first();
    if (!(await genBtn.isVisible().catch(() => false))) {
      await shot(page, '12-loading-no-generate-button');
      return;
    }
    await genBtn.click();
    // Try to snap mid-flight.
    await page.waitForTimeout(120);
    await shot(page, '12-loading-mid-generation');
    // Wait until settled, capture after.
    await page.waitForTimeout(3000);
    await shot(page, '12b-loading-settled');
  });

  test('block hover popover', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const link = await getFirstOfficeLink(page);
    if (!(await link.isVisible().catch(() => false))) {
      test.skip(true, 'no office');
      return;
    }
    await link.click();
    await page.waitForLoadState('networkidle').catch(() => {});
    // Generate first so blocks exist.
    const genBtn = page.getByRole('button', { name: /generate/i }).first();
    if (await genBtn.isVisible().catch(() => false)) {
      await genBtn.click();
      await page.waitForTimeout(3000);
    }
    const firstBlock = page
      .locator(
        '[data-block-instance], [role="button"][aria-label*="block" i], [data-testid*="block"]',
      )
      .first();
    if (await firstBlock.isVisible({ timeout: 2000 }).catch(() => false)) {
      await firstBlock.hover();
      await page.waitForTimeout(400);
      await shot(page, '13-block-hover-popover');
    } else {
      await shot(page, '13-block-hover-no-block');
    }
  });

  test('guard report panel visible', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const link = await getFirstOfficeLink(page);
    if (!(await link.isVisible().catch(() => false))) {
      test.skip(true, 'no office');
      return;
    }
    await link.click();
    await page.waitForLoadState('networkidle').catch(() => {});
    const genBtn = page.getByRole('button', { name: /generate/i }).first();
    if (await genBtn.isVisible().catch(() => false)) {
      await genBtn.click();
      await page.waitForTimeout(3000);
    }
    const guard = page.locator('[data-guard-panel]').first();
    if (await guard.isVisible({ timeout: 2000 }).catch(() => false)) {
      await guard.scrollIntoViewIfNeeded();
      await shot(page, '14-guard-panel-visible');
    } else {
      await shot(page, '14-guard-panel-not-found');
    }
  });

  test('doctor flow overlay toggled', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const link = await getFirstOfficeLink(page);
    if (!(await link.isVisible().catch(() => false))) {
      test.skip(true, 'no office');
      return;
    }
    await link.click();
    await page.waitForLoadState('networkidle').catch(() => {});
    const genBtn = page.getByRole('button', { name: /generate/i }).first();
    if (await genBtn.isVisible().catch(() => false)) {
      await genBtn.click();
      await page.waitForTimeout(3000);
    }
    const toggle = page
      .getByRole('button', { name: /doctor.?flow|flow overlay/i })
      .first();
    if (await toggle.isVisible({ timeout: 1500 }).catch(() => false)) {
      await toggle.click();
      await page.waitForTimeout(250);
      await shot(page, '15-doctor-flow-overlay-on');
    } else {
      await shot(page, '15-doctor-flow-toggle-not-found');
    }
  });

  test('zoomed in and out', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const link = await getFirstOfficeLink(page);
    if (!(await link.isVisible().catch(() => false))) {
      test.skip(true, 'no office');
      return;
    }
    await link.click();
    await page.waitForLoadState('networkidle').catch(() => {});
    const genBtn = page.getByRole('button', { name: /generate/i }).first();
    if (await genBtn.isVisible().catch(() => false)) {
      await genBtn.click();
      await page.waitForTimeout(3000);
    }
    // Ctrl+Plus to zoom in (custom app zoom, not browser zoom)
    await page.keyboard.press('Control+Equal');
    await page.waitForTimeout(300);
    await shot(page, '16-zoom-in-plus');
    await page.keyboard.press('Control+Equal');
    await page.waitForTimeout(300);
    await shot(page, '16b-zoom-in-double');
    // Ctrl+0 to reset
    await page.keyboard.press('Control+0');
    await page.waitForTimeout(300);
    await shot(page, '17-zoom-reset');
    // Ctrl+Minus to zoom out
    await page.keyboard.press('Control+Minus');
    await page.waitForTimeout(300);
    await shot(page, '18-zoom-out');
  });
});

test.describe('Phase 4 — Interaction tests', () => {
  test('hover → popover under 300 ms; click → selection outline', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const link = await getFirstOfficeLink(page);
    if (!(await link.isVisible().catch(() => false))) {
      test.skip(true, 'no office');
      return;
    }
    await link.click();
    await page.waitForLoadState('networkidle').catch(() => {});
    const genBtn = page.getByRole('button', { name: /generate/i }).first();
    if (await genBtn.isVisible().catch(() => false)) {
      await genBtn.click();
      await page.waitForTimeout(3000);
    }
    const block = page
      .locator(
        '[data-block-instance], [role="button"][aria-label*="block" i]',
      )
      .first();
    if (!(await block.isVisible({ timeout: 2000 }).catch(() => false))) {
      testInfo.annotations.push({
        type: 'result',
        description: 'SKIP hover/click — no block element',
      });
      return;
    }
    const startHover = Date.now();
    await block.hover();
    const popover = page.locator(
      '[role="tooltip"], [data-hover-popover], [data-testid*="popover"]',
    );
    const appeared = await popover
      .first()
      .isVisible({ timeout: 400 })
      .catch(() => false);
    const elapsed = Date.now() - startHover;
    testInfo.annotations.push({
      type: 'result',
      description: `hover_popover_ms=${elapsed} appeared=${appeared}`,
    });

    await block.click();
    await page.waitForTimeout(150);
    const ariaPressed = await block.getAttribute('aria-pressed').catch(() => null);
    const outline = await block
      .evaluate(
        (el) => window.getComputedStyle(el as Element).outline + '|' +
          window.getComputedStyle(el as Element).boxShadow,
      )
      .catch(() => '');
    testInfo.annotations.push({
      type: 'result',
      description: `click_selected aria-pressed=${ariaPressed} outline=${outline.substring(0, 120)}`,
    });
  });

  test('escape closes popover', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const link = await getFirstOfficeLink(page);
    if (!(await link.isVisible().catch(() => false))) {
      test.skip(true, 'no office');
      return;
    }
    await link.click();
    await page.waitForLoadState('networkidle').catch(() => {});
    const genBtn = page.getByRole('button', { name: /generate/i }).first();
    if (await genBtn.isVisible().catch(() => false)) {
      await genBtn.click();
      await page.waitForTimeout(3000);
    }
    const block = page
      .locator(
        '[data-block-instance], [role="button"][aria-label*="block" i]',
      )
      .first();
    if (!(await block.isVisible({ timeout: 2000 }).catch(() => false))) {
      testInfo.annotations.push({
        type: 'result',
        description: 'SKIP escape — no block',
      });
      return;
    }
    await block.hover();
    await page.waitForTimeout(350);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    const popover = page.locator(
      '[role="tooltip"], [data-hover-popover]',
    );
    const visibleAfter = await popover
      .first()
      .isVisible({ timeout: 200 })
      .catch(() => false);
    testInfo.annotations.push({
      type: 'result',
      description: `escape_closes=${!visibleAfter}`,
    });
  });

  test('tab order cycles provider headers then grid', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const link = await getFirstOfficeLink(page);
    if (!(await link.isVisible().catch(() => false))) {
      test.skip(true, 'no office');
      return;
    }
    await link.click();
    await page.waitForLoadState('networkidle').catch(() => {});
    // Start from body
    await page.locator('body').focus();
    const tabSequence: string[] = [];
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return 'none';
        const role = el.getAttribute('role') || el.tagName.toLowerCase();
        const label =
          el.getAttribute('aria-label') ||
          el.getAttribute('data-testid') ||
          (el.textContent || '').trim().substring(0, 30);
        return `${role}:${label}`;
      });
      tabSequence.push(info);
    }
    testInfo.annotations.push({
      type: 'result',
      description: `tab_order=${JSON.stringify(tabSequence)}`,
    });
  });

  test('keyboard arrow moves cursor cell', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const link = await getFirstOfficeLink(page);
    if (!(await link.isVisible().catch(() => false))) {
      test.skip(true, 'no office');
      return;
    }
    await link.click();
    await page.waitForLoadState('networkidle').catch(() => {});
    const grid = page.locator('[role="grid"]').first();
    const gridVisible = await grid.isVisible({ timeout: 2000 }).catch(() => false);
    if (!gridVisible) {
      testInfo.annotations.push({
        type: 'result',
        description: 'SKIP arrow — no role=grid',
      });
      return;
    }
    await grid.focus().catch(() => {});
    const before = await page.evaluate(() => {
      const cell = document.querySelector('[role="gridcell"][aria-current="true"], [data-cursor="true"]');
      return cell ? cell.getAttribute('data-row-index') + ',' + cell.getAttribute('data-col-index') : 'none';
    });
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(80);
    const after = await page.evaluate(() => {
      const cell = document.querySelector('[role="gridcell"][aria-current="true"], [data-cursor="true"]');
      return cell ? cell.getAttribute('data-row-index') + ',' + cell.getAttribute('data-col-index') : 'none';
    });
    testInfo.annotations.push({
      type: 'result',
      description: `arrow_down before=${before} after=${after} moved=${before !== after}`,
    });
  });

  test('ctrl+plus/ctrl+0 zoom', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const link = await getFirstOfficeLink(page);
    if (!(await link.isVisible().catch(() => false))) {
      test.skip(true, 'no office');
      return;
    }
    await link.click();
    await page.waitForLoadState('networkidle').catch(() => {});
    const readZoom = async () =>
      page.evaluate(() => {
        const root = document.querySelector('[data-sg-zoom]');
        return root ? root.getAttribute('data-sg-zoom') : 'none';
      });
    const z0 = await readZoom();
    await page.keyboard.press('Control+Equal');
    await page.waitForTimeout(150);
    const z1 = await readZoom();
    await page.keyboard.press('Control+0');
    await page.waitForTimeout(150);
    const z2 = await readZoom();
    testInfo.annotations.push({
      type: 'result',
      description: `zoom_initial=${z0} after_plus=${z1} after_reset=${z2} works=${z0 !== z1 && z2 === z0}`,
    });
  });
});

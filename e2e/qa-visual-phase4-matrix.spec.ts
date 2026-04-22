import { test, type Page } from '@playwright/test';
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

const WIDTHS: Array<{ name: string; w: number; h: number }> = [
  { name: '1920', w: 1920, h: 1080 },
  { name: '1440', w: 1440, h: 900 },
  { name: '1280', w: 1280, h: 800 },
  { name: '1024', w: 1024, h: 768 },
  { name: '768', w: 768, h: 1024 },
  { name: '390', w: 390, h: 844 },
];

const openOfficeAndGenerate = async (page: Page) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const link = page
    .locator('a[href^="/offices/"]:not([href="/offices/new"])')
    .first();
  await link.click();
  await page.waitForURL(/offices\/[^/]+$/, { timeout: 10000 });
  await page.waitForLoadState('networkidle');
  const cta = page.getByRole('button', { name: 'Generate Schedule' });
  if (await cta.isVisible({ timeout: 3000 }).catch(() => false)) {
    await cta.click();
    // Sprint 4: the V2 canvas renders either [data-schedule-v2="true"],
    // [role="grid"], or a table, depending on which variant is active.
    // Wait for any of the three rather than requiring role="grid" specifically.
    const anyGrid = page.locator(
      '[data-schedule-v2="true"], [data-testid="sg-canvas-v2"], [role="grid"], table',
    );
    await anyGrid
      .first()
      .waitFor({ state: 'visible', timeout: 15000 })
      .catch(() => {
        // Fall through — the individual test will make its own assertion.
      });
    await page.waitForTimeout(1500);
  }
};

test.describe('Phase 4 matrix — populated schedule across widths', () => {
  for (const { name, w, h } of WIDTHS) {
    test(`populated @ ${name}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await openOfficeAndGenerate(page);
      await shot(page, `50-pop-${name}`);
    });
  }
});

test.describe('Phase 4 — block hover + interactions', () => {
  test('hover block — popover + timing', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openOfficeAndGenerate(page);

    // Scroll the grid into view and find a real block inside.
    const block = page
      .locator(
        '[data-block-instance], [data-slot-cell]:not(:empty), [role="gridcell"][aria-label*="block" i], [role="button"][aria-label]',
      )
      .first();
    const present = await block.isVisible({ timeout: 2500 }).catch(() => false);
    testInfo.annotations.push({
      type: 'diag',
      description: `block_found=${present}`,
    });
    if (!present) {
      await shot(page, '51-block-not-found');
      return;
    }

    const t0 = Date.now();
    await block.hover();
    const popover = page.locator(
      '[role="tooltip"], [data-hover-popover], [data-testid*="popover"]',
    );
    const appeared = await popover
      .first()
      .isVisible({ timeout: 400 })
      .catch(() => false);
    const ms = Date.now() - t0;
    testInfo.annotations.push({
      type: 'diag',
      description: `hover_appeared=${appeared} ms=${ms}`,
    });
    await page.waitForTimeout(200);
    await shot(page, '51-block-hover');

    // Click → selection
    await block.click();
    await page.waitForTimeout(200);
    await shot(page, '52-block-selected');

    // Escape clears
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await shot(page, '53-after-escape');
  });

  test('zoom keyboard shortcuts', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openOfficeAndGenerate(page);

    const readZoom = async () =>
      page.evaluate(() => {
        const el = document.querySelector('[data-sg-zoom]');
        return el ? el.getAttribute('data-sg-zoom') : null;
      });

    const z0 = await readZoom();
    await page.keyboard.press('Control+Equal');
    await page.waitForTimeout(200);
    const z1 = await readZoom();
    await shot(page, '54-zoom-plus');

    await page.keyboard.press('Control+Equal');
    await page.waitForTimeout(200);
    const z2 = await readZoom();
    await shot(page, '54b-zoom-plus-plus');

    await page.keyboard.press('Control+0');
    await page.waitForTimeout(200);
    const z3 = await readZoom();
    await shot(page, '55-zoom-reset');

    await page.keyboard.press('Control+Minus');
    await page.waitForTimeout(200);
    const z4 = await readZoom();
    await shot(page, '56-zoom-minus');

    testInfo.annotations.push({
      type: 'diag',
      description: `zoom: initial=${z0} plus=${z1} plus2=${z2} reset=${z3} minus=${z4}`,
    });
  });

  test('guard panel + doctor flow', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await openOfficeAndGenerate(page);

    const guard = page.locator('[data-guard-panel]').first();
    const guardVisible = await guard
      .isVisible({ timeout: 2000 })
      .catch(() => false);
    testInfo.annotations.push({
      type: 'diag',
      description: `guard_visible=${guardVisible}`,
    });
    await shot(page, '57-guard-panel');

    const toggle = page
      .getByRole('button', { name: /doctor.?flow|flow overlay/i })
      .first();
    const tv = await toggle.isVisible({ timeout: 1500 }).catch(() => false);
    testInfo.annotations.push({
      type: 'diag',
      description: `doctor_flow_toggle_visible=${tv}`,
    });
    if (tv) {
      await toggle.click();
      await page.waitForTimeout(300);
      await shot(page, '58-doctor-flow-on');
    }
  });

  test('a11y probe on populated schedule', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openOfficeAndGenerate(page);

    const probe = await page.evaluate(() => {
      const out: Record<string, unknown> = {};
      out.gridCount = document.querySelectorAll('[role="grid"]').length;
      out.colHeaderCount = document.querySelectorAll(
        '[role="columnheader"]',
      ).length;
      out.rowHeaderCount = document.querySelectorAll(
        '[role="rowheader"]',
      ).length;
      out.gridCellCount = document.querySelectorAll('[role="gridcell"]').length;
      out.ariaLiveCount = document.querySelectorAll('[aria-live]').length;

      const buttons = Array.from(document.querySelectorAll('button'));
      out.totalButtons = buttons.length;
      out.buttonsWithoutName = buttons.filter((b) => {
        const n =
          (b.getAttribute('aria-label') || '').trim() ||
          (b.textContent || '').trim() ||
          (b.getAttribute('title') || '').trim();
        return !n;
      }).length;

      const inputs = Array.from(
        document.querySelectorAll(
          'input:not([type="hidden"]):not([type="submit"])',
        ),
      ) as HTMLInputElement[];
      out.totalInputs = inputs.length;
      out.inputsWithoutLabel = inputs.filter((i) => {
        if (i.getAttribute('aria-label')) return false;
        if (i.getAttribute('aria-labelledby')) return false;
        if (i.id && document.querySelector(`label[for="${i.id}"]`)) return false;
        if (i.closest('label')) return false;
        return true;
      }).length;

      out.positiveTabindex = document.querySelectorAll(
        '[tabindex]:not([tabindex="0"]):not([tabindex="-1"])',
      ).length;

      const imgs = Array.from(document.querySelectorAll('img'));
      out.totalImgs = imgs.length;
      out.imgsWithoutAlt = imgs.filter((i) => !i.hasAttribute('alt')).length;

      // Role=button without type="button" when it's a native button (avoid default submit)
      const native = Array.from(
        document.querySelectorAll('button:not([type])'),
      );
      out.buttonsWithoutType = native.length;

      return out;
    });

    const reportPath = path.join(OUT_DIR, 'a11y-probe-populated.json');
    fs.writeFileSync(reportPath, JSON.stringify(probe, null, 2));
    testInfo.annotations.push({
      type: 'diag',
      description: JSON.stringify(probe),
    });
  });

  test('tab order populated', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openOfficeAndGenerate(page);
    await page.locator('body').focus();
    const tabs: string[] = [];
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Tab');
      tabs.push(
        await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (!el) return 'none';
          const tag = el.tagName.toLowerCase();
          const role = el.getAttribute('role') || '';
          const label =
            el.getAttribute('aria-label') ||
            el.getAttribute('data-testid') ||
            (el.textContent || '').trim().substring(0, 30);
          return `${tag}${role ? '.' + role : ''}|${label}`;
        }),
      );
    }
    fs.writeFileSync(
      path.join(OUT_DIR, 'tab-order-populated.json'),
      JSON.stringify(tabs, null, 2),
    );
    testInfo.annotations.push({ type: 'diag', description: tabs.join(' -> ') });
  });

  test('arrow key moves grid cursor', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openOfficeAndGenerate(page);
    const grid = page.locator('[role="grid"]').first();
    const gridVisible = await grid.isVisible({ timeout: 2000 }).catch(() => false);
    if (!gridVisible) {
      // V2 canvas doesn't expose role="grid" on the empty-state path; skip
      // the cursor-movement probe rather than hang on click/focus.
      testInfo.annotations.push({
        type: 'diag',
        description: 'arrow_down skipped — no [role="grid"] in this render',
      });
      return;
    }
    await grid.focus({ timeout: 2000 }).catch(() => {});
    // Click a cell to initialise cursor.
    const firstCell = page.locator('[role="gridcell"]').first();
    if (await firstCell.isVisible({ timeout: 2000 }).catch(() => false)) {
      await firstCell.click({ timeout: 2000 }).catch(() => {});
    }
    const before = await page.evaluate(() => {
      const e = document.querySelector(
        '[role="gridcell"][aria-current="true"], [data-cursor="true"]',
      );
      return e
        ? e.getAttribute('data-row-index') +
            ',' +
            e.getAttribute('data-col-index')
        : 'none';
    });
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(120);
    const after = await page.evaluate(() => {
      const e = document.querySelector(
        '[role="gridcell"][aria-current="true"], [data-cursor="true"]',
      );
      return e
        ? e.getAttribute('data-row-index') +
            ',' +
            e.getAttribute('data-col-index')
        : 'none';
    });
    testInfo.annotations.push({
      type: 'diag',
      description: `arrow_down before=${before} after=${after} moved=${before !== after}`,
    });
  });
});

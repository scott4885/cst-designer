import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Phase 4 Visual QA — post-generation state screenshots + A11y probe.
 *
 * This spec clicks the center "Generate Schedule" CTA (not the toolbar
 * button, which in the empty state appears to be unreachable), then captures
 * a populated schedule across widths + interactions. Also runs a minimal
 * structural a11y probe on the generated grid.
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

const goToOffice = async (page: Page) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle').catch(() => {});
  const link = page
    .locator('a[href^="/offices/"]:not([href="/offices/new"])')
    .first();
  if (!(await link.isVisible({ timeout: 5000 }).catch(() => false))) {
    return false;
  }
  await link.click();
  await page.waitForURL(/offices\/[^/]+$/, { timeout: 10000 }).catch(() => {});
  await page.waitForLoadState('networkidle').catch(() => {});
  return true;
};

const generateSchedule = async (page: Page) => {
  // Prefer the larger center CTA. Name is "Generate Schedule". Fall back to
  // the toolbar "Generate" button. We use the *exact* text to discriminate.
  const centerCta = page.getByRole('button', { name: /^Generate Schedule$/ });
  const toolbarBtn = page.getByRole('button', { name: /^Generate$/ });
  if (await centerCta.isVisible({ timeout: 1500 }).catch(() => false)) {
    await centerCta.click();
  } else if (await toolbarBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
    await toolbarBtn.click();
  } else {
    return false;
  }
  // Schedule generation is usually quick; wait for the grid to appear.
  await page
    .locator('[role="grid"], [data-schedule-v2], [data-testid="schedule-grid"], table')
    .first()
    .waitFor({ state: 'visible', timeout: 15000 })
    .catch(() => {});
  return true;
};

test.describe('Phase 4 — Post-generation screenshots', () => {
  for (const { name, w, h } of WIDTHS) {
    test(`populated schedule at ${name}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      if (!(await goToOffice(page))) {
        test.skip(true, 'no office');
        return;
      }
      const gen = await generateSchedule(page);
      if (!gen) {
        await shot(page, `30-populated-${name}-no-cta`);
        return;
      }
      await page.waitForTimeout(1200);
      await shot(page, `30-populated-${name}`);
    });
  }

  test('block hover popover (after generation)', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    if (!(await goToOffice(page))) {
      test.skip(true, 'no office');
      return;
    }
    await generateSchedule(page);
    await page.waitForTimeout(1500);

    const block = page
      .locator(
        '[data-block-instance], [role="gridcell"] [role="button"], [role="button"][aria-label*="block" i]',
      )
      .first();
    if (!(await block.isVisible({ timeout: 2000 }).catch(() => false))) {
      await shot(page, '31-hover-no-block-after-gen');
      testInfo.annotations.push({
        type: 'result',
        description: 'no block element after generation',
      });
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
    const elapsed = Date.now() - t0;
    testInfo.annotations.push({
      type: 'result',
      description: `hover_appeared=${appeared} ms=${elapsed}`,
    });
    await shot(page, '31-hover-popover-after-gen');
  });

  test('click block → selection; escape closes', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    if (!(await goToOffice(page))) {
      test.skip(true, 'no office');
      return;
    }
    await generateSchedule(page);
    await page.waitForTimeout(1500);

    const block = page
      .locator(
        '[data-block-instance], [role="button"][aria-label*="block" i]',
      )
      .first();
    if (!(await block.isVisible({ timeout: 2000 }).catch(() => false))) {
      testInfo.annotations.push({
        type: 'result',
        description: 'no block to click',
      });
      return;
    }
    await block.click();
    await page.waitForTimeout(200);
    await shot(page, '32-block-selected');

    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await shot(page, '33-after-escape');
  });

  test('zoom in/out/reset with Ctrl', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    if (!(await goToOffice(page))) {
      test.skip(true, 'no office');
      return;
    }
    await generateSchedule(page);
    await page.waitForTimeout(1500);

    const readZoom = async () =>
      page.evaluate(() => {
        const root = document.querySelector('[data-sg-zoom]');
        return root ? root.getAttribute('data-sg-zoom') : null;
      });

    const z0 = await readZoom();
    await page.keyboard.press('Control+Equal');
    await page.waitForTimeout(200);
    const z1 = await readZoom();
    await shot(page, '34-zoom-in-after-gen');

    await page.keyboard.press('Control+Minus');
    await page.waitForTimeout(200);
    const z2 = await readZoom();
    await shot(page, '35-zoom-out-after-gen');

    await page.keyboard.press('Control+0');
    await page.waitForTimeout(200);
    const z3 = await readZoom();
    await shot(page, '36-zoom-reset-after-gen');

    testInfo.annotations.push({
      type: 'result',
      description: `zoom_sequence initial=${z0} plus=${z1} minus=${z2} reset=${z3}`,
    });
  });

  test('doctor flow overlay toggle', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    if (!(await goToOffice(page))) {
      test.skip(true, 'no office');
      return;
    }
    await generateSchedule(page);
    await page.waitForTimeout(1500);

    const toggle = page
      .getByRole('button', { name: /doctor.?flow|flow overlay/i })
      .first();
    const present = await toggle.isVisible({ timeout: 1500 }).catch(() => false);
    testInfo.annotations.push({
      type: 'result',
      description: `doctor_flow_toggle_present=${present}`,
    });
    if (present) {
      await toggle.click();
      await page.waitForTimeout(300);
      await shot(page, '37-doctor-flow-on-after-gen');
    } else {
      await shot(page, '37-doctor-flow-not-found');
    }
  });

  test('guard report panel visible (after generation)', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    if (!(await goToOffice(page))) {
      test.skip(true, 'no office');
      return;
    }
    await generateSchedule(page);
    await page.waitForTimeout(1500);

    const guard = page.locator('[data-guard-panel]').first();
    const visible = await guard.isVisible({ timeout: 2000 }).catch(() => false);
    testInfo.annotations.push({
      type: 'result',
      description: `guard_panel_visible=${visible}`,
    });
    if (visible) {
      await guard.scrollIntoViewIfNeeded();
    }
    await shot(page, '38-guard-panel-after-gen');
  });
});

test.describe('Phase 4 — A11y structural probe', () => {
  test('grid has role, headers, and colour-contrast passes on text', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    if (!(await goToOffice(page))) {
      test.skip(true, 'no office');
      return;
    }
    await generateSchedule(page);
    await page.waitForTimeout(1500);

    const probe = await page.evaluate(() => {
      const results: Record<string, unknown> = {};

      // role=grid count
      results.gridCount = document.querySelectorAll('[role="grid"]').length;
      // columnheader count
      results.colHeaderCount = document.querySelectorAll(
        '[role="columnheader"]',
      ).length;
      // rowheader count
      results.rowHeaderCount = document.querySelectorAll(
        '[role="rowheader"]',
      ).length;
      // aria-live region count
      results.ariaLive = document.querySelectorAll('[aria-live]').length;

      // Buttons without accessible name
      const buttons = Array.from(document.querySelectorAll('button'));
      const nameless = buttons.filter((b) => {
        const name =
          (b.getAttribute('aria-label') || '').trim() ||
          (b.textContent || '').trim() ||
          (b.getAttribute('title') || '').trim();
        return !name;
      });
      results.buttonsWithoutName = nameless.length;
      results.totalButtons = buttons.length;

      // Images without alt
      const images = Array.from(document.querySelectorAll('img'));
      results.imgsWithoutAlt = images.filter(
        (i) => !i.hasAttribute('alt'),
      ).length;
      results.totalImgs = images.length;

      // Inputs without labels
      const inputs = Array.from(
        document.querySelectorAll(
          'input:not([type="hidden"]):not([type="button"]):not([type="submit"])',
        ),
      ) as HTMLInputElement[];
      const unlabeled = inputs.filter((i) => {
        if (i.getAttribute('aria-label')) return false;
        if (i.getAttribute('aria-labelledby')) return false;
        if (i.id && document.querySelector(`label[for="${i.id}"]`)) return false;
        const parentLabel = i.closest('label');
        if (parentLabel) return false;
        return true;
      });
      results.inputsWithoutLabel = unlabeled.length;
      results.totalInputs = inputs.length;

      // Focusable elements with tabindex > 0 (anti-pattern)
      const positiveTabIndex = document.querySelectorAll(
        '[tabindex]:not([tabindex="0"]):not([tabindex="-1"])',
      );
      results.positiveTabindexAntiPattern = positiveTabIndex.length;

      // Colour contrast — sample all visible text nodes under main
      const main = document.querySelector('main') || document.body;
      const parseRgb = (s: string): [number, number, number] | null => {
        const m = s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        return m ? [+m[1], +m[2], +m[3]] : null;
      };
      const luminance = ([r, g, b]: [number, number, number]) => {
        const srgb = [r, g, b].map((v) => {
          const c = v / 255;
          return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
      };
      const contrast = (
        a: [number, number, number],
        b: [number, number, number],
      ) => {
        const la = luminance(a);
        const lb = luminance(b);
        return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
      };
      const findBg = (el: HTMLElement): [number, number, number] => {
        let cur: HTMLElement | null = el;
        while (cur) {
          const c = getComputedStyle(cur).backgroundColor;
          const rgb = parseRgb(c);
          if (rgb && !/rgba\([^)]*,\s*0\)/.test(c)) return rgb;
          cur = cur.parentElement;
        }
        return [255, 255, 255];
      };
      const textEls = Array.from(main.querySelectorAll<HTMLElement>('*')).filter(
        (el) => {
          if (!el.textContent || !el.textContent.trim()) return false;
          if (el.children.length > 0) {
            // must actually contain direct text node
            const hasTextNode = Array.from(el.childNodes).some(
              (n) => n.nodeType === 3 && (n.textContent || '').trim(),
            );
            if (!hasTextNode) return false;
          }
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        },
      );
      const failures: Array<{
        tag: string;
        text: string;
        ratio: number;
      }> = [];
      textEls.slice(0, 300).forEach((el) => {
        const s = getComputedStyle(el);
        const fg = parseRgb(s.color);
        if (!fg) return;
        const bg = findBg(el);
        const ratio = contrast(fg, bg);
        const fontSize = parseFloat(s.fontSize);
        const fontWeight = parseInt(s.fontWeight || '400', 10);
        const isLargeText =
          fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
        const minRatio = isLargeText ? 3 : 4.5;
        if (ratio < minRatio) {
          failures.push({
            tag: el.tagName.toLowerCase(),
            text: (el.textContent || '').trim().substring(0, 40),
            ratio: +ratio.toFixed(2),
          });
        }
      });
      results.contrastFailures = failures.slice(0, 20);
      results.contrastFailuresCount = failures.length;

      return results;
    });

    // Write a structured report the parent phase can parse.
    const reportPath = path.join(OUT_DIR, 'a11y-probe.json');
    fs.writeFileSync(reportPath, JSON.stringify(probe, null, 2));
    testInfo.annotations.push({
      type: 'result',
      description: `a11y ${JSON.stringify(probe).substring(0, 500)}`,
    });
  });

  test('tab order — 15 tabs from body', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    if (!(await goToOffice(page))) {
      test.skip(true, 'no office');
      return;
    }
    await generateSchedule(page);
    await page.waitForTimeout(1500);

    await page.locator('body').focus();
    const tabs: string[] = [];
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return 'none';
        const tag = el.tagName.toLowerCase();
        const role = el.getAttribute('role') || '';
        const label =
          el.getAttribute('aria-label') ||
          el.getAttribute('data-testid') ||
          (el.textContent || '').trim().substring(0, 24);
        return `${tag}${role ? ':' + role : ''}|${label}`;
      });
      tabs.push(info);
    }
    const tabPath = path.join(OUT_DIR, 'tab-order.json');
    fs.writeFileSync(tabPath, JSON.stringify(tabs, null, 2));
    testInfo.annotations.push({
      type: 'result',
      description: `tab_order ${JSON.stringify(tabs.slice(0, 6))}`,
    });
  });
});

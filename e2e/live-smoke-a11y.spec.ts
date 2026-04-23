// Post-deploy live smoke + a11y scan. Tracked permanent spec.
//
// Invoke explicitly (not part of default e2e run):
//   npx playwright test e2e/live-smoke-a11y.spec.ts
//
// Override target: LIVE_SMOKE_TARGET=http://localhost:3000 (defaults to live).
// Screenshots + JSON written to .cst-rebuild-v3/logs/live-smoke-out/
// (gitignored). Originally the Phase 8 scratch spec; promoted on 2026-04-22.
//
// Routes covered (keep in sync with new surfaces):
//  - /                                    (offices index)
//  - /offices/new                         (intake v2 form)
//  - /offices/[seedId]                    (v2 grid mount + open-advisory button)
//  - /offices/[seedId]/advisory           (advisory panel + Sprint 6 Epic P/Q/R/S UI)

import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// Opt-in gate: this spec runs only when LIVE_SMOKE=1 (or LIVE_SMOKE_TARGET is
// set). Default `npm run e2e` against local dev would otherwise hit the
// production URL or fail on missing seed data. Explicit opt-in keeps it out
// of the default suite without requiring playwright.config carve-outs.
const LIVE_SMOKE_ENABLED =
  process.env.LIVE_SMOKE === '1'
  || !!process.env.LIVE_SMOKE_TARGET
  || process.env.PHASE8_TARGET === 'local';

const LIVE = process.env.LIVE_SMOKE_TARGET
  ?? (process.env.PHASE8_TARGET === 'local' ? 'http://localhost:3000' : undefined)
  ?? 'http://cst.142.93.182.236.sslip.io';

const OUT = path.join(
  __dirname,
  '..',
  '.cst-rebuild-v3',
  'logs',
  'live-smoke-out',
);
const ensureOut = () => {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
};
const writeJson = (name: string, obj: unknown) => {
  ensureOut();
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(obj, null, 2));
};
const shot = async (page: Page, name: string) => {
  ensureOut();
  await page.screenshot({
    path: path.join(OUT, `${name}.png`),
    fullPage: true,
  });
};

async function pickSeedOfficeId(request: import('@playwright/test').APIRequestContext): Promise<string | null> {
  const res = await request.get(`${LIVE}/api/offices`);
  if (!res.ok()) return null;
  const arr: Array<{ id: string }> = await res.json();
  return arr[0]?.id ?? null;
}

test.describe('Live post-deploy smoke + a11y', () => {
  test.skip(
    !LIVE_SMOKE_ENABLED,
    'Opt-in suite — set LIVE_SMOKE=1 (or LIVE_SMOKE_TARGET=url) to run. See file header.',
  );

  test('S1 — route gates (root, offices/new, office detail, advisory)', async ({ request }, testInfo) => {
    const results: Record<string, { status: number; etag?: string | null; bytes: number; markers: Record<string, boolean> }> = {};

    const seedId = await pickSeedOfficeId(request);
    expect(seedId, 'seed office must exist').not.toBeNull();

    const routes: Array<{ name: string; url: string; markers: string[] }> = [
      { name: 'root', url: `${LIVE}/`, markers: [] },
      { name: 'offices-new', url: `${LIVE}/offices/new`, markers: ['intake-v2', 'intake-completeness-badge'] },
      { name: 'office-detail', url: `${LIVE}/offices/${seedId}`, markers: ['sg-canvas-v2', 'sg-schedule-grid', 'open-advisory-btn'] },
      { name: 'advisory', url: `${LIVE}/offices/${seedId}/advisory`, markers: [
        'advisory-page',
        'advisory-panel',
        'prior-template-upload',
        'delta-view',
        'refine-with-ai-panel',
        'variant-commit-controls',
        'workflow-banner',
        'walkthrough-dialog',
      ] },
    ];

    for (const r of routes) {
      const res = await request.get(r.url);
      // Follow 307 redirect for /offices (becomes root)
      const html = await res.text();
      // We can't fetch the per-route chunks from the server HTML alone — testids show up
      // in JS chunks loaded by that route. Fetch those chunks and grep.
      const chunkRefs = Array.from(html.matchAll(/src="(\/_next\/static\/chunks\/[^"]+)"/g)).map(m => m[1]);
      const chunkBodies = await Promise.all(chunkRefs.map(async (ref) => {
        const cr = await request.get(`${LIVE}${ref}`);
        return cr.ok() ? await cr.text() : '';
      }));
      const bundle = chunkBodies.join('\n');
      const markers: Record<string, boolean> = {};
      for (const m of r.markers) {
        markers[m] = bundle.includes(`"${m}"`) || bundle.includes(`'${m}'`) || bundle.includes(m);
      }
      results[r.name] = {
        status: res.status(),
        etag: res.headers()['etag'] ?? null,
        bytes: html.length,
        markers,
      };
    }

    writeJson('s1-routes.json', { liveBase: LIVE, seedId, results });
    await testInfo.attach('s1-routes', { body: JSON.stringify(results, null, 2), contentType: 'application/json' });

    // Gate: every marker must be true
    for (const [route, r] of Object.entries(results)) {
      expect(r.status, `${route} HTTP`).toBeLessThan(400);
      for (const [mk, ok] of Object.entries(r.markers)) {
        expect(ok, `${route} missing marker ${mk}`).toBe(true);
      }
    }
  });

  test('S2 — a11y scan on Sprint 6 routes', async ({ page, request }, testInfo) => {
    const seedId = await pickSeedOfficeId(request);
    expect(seedId).not.toBeNull();

    const routes = [
      { name: 'offices-new', url: `${LIVE}/offices/new` },
      { name: 'office-detail', url: `${LIVE}/offices/${seedId}` },
      { name: 'advisory', url: `${LIVE}/offices/${seedId}/advisory` },
    ];

    const axeSource = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf-8');
    const all: Record<string, { violations: unknown[]; counts: Record<string, number> }> = {};

    for (const r of routes) {
      await page.goto(r.url, { waitUntil: 'networkidle' });
      await page.addScriptTag({ content: axeSource });
      const axeResults: { violations: Array<{ id: string; impact?: string }> } = await page.evaluate(async () => {
        // @ts-expect-error - axe is injected
        const r = await axe.run(document, {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
        });
        return r;
      });
      const counts = axeResults.violations.reduce<Record<string, number>>((acc, v) => {
        const key = v.impact ?? 'unknown';
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {});
      all[r.name] = { violations: axeResults.violations, counts };
      await shot(page, `s2-${r.name}`);
    }

    writeJson('s2-a11y.json', { liveBase: LIVE, seedId, results: all });

    // Gate: 0 critical / serious / moderate violations on each route
    for (const [rname, r] of Object.entries(all)) {
      const blocking = (r.counts['critical'] ?? 0) + (r.counts['serious'] ?? 0) + (r.counts['moderate'] ?? 0);
      expect(blocking, `${rname} blocking a11y violations`).toBe(0);
    }
  });
});

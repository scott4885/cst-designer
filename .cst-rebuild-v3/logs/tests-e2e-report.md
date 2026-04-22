# Playwright E2E Sweep — Phase 4

**Date:** 2026-04-21
**Command:** `npx playwright test --reporter=list`
**Config:** `playwright.config.ts`
**Runtime:** ~3m 48s
**Browser:** chromium (only project configured)

## Summary

| Status | Count |
|---|---:|
| Passed | **26** |
| **Failed** | **5** |
| Skipped | 17 |
| **Total** | **48** |

## Failed Specs

### 1. `e2e/office-crud.spec.ts:11:7` — Office CRUD › navigate to dashboard and see office list

```
Error: expect(locator).toBeVisible() failed
Error: strict mode violation: getByRole('link', { name: /new|create|add/i }) resolved to 2 elements
  at C:\...\e2e\office-crud.spec.ts:17:33
```

**Root cause:** Selector ambiguity — two buttons/links match `/new|create|add/i`. Fix: tighten to a stable `data-testid` or use `.first()`.

### 2. `e2e/schedule-generation.spec.ts:13:7` — Schedule Generation › navigate to an office and see schedule controls

```
Error: expect(received).toBe(expected) // Object.is equality
  at C:\...\e2e\schedule-generation.spec.ts:28:38
```

**Root cause:** A visibility/state assertion mismatch — likely the office detail page no longer exposes the control the test looks for, or the seed office changed shape.

### 3. `e2e/schedule-persistence.spec.ts:10:7` — Schedule Persistence › create office, generate schedule, save, navigate away, and come back

```
Error: expect(count).toBeGreaterThan(0); Received: 0
  at C:\...\e2e\schedule-persistence.spec.ts:57:19
```

**Root cause:** After navigation round-trip, zero persisted elements were found. Persistence regression OR a timing issue (navigation resolved before the schedule re-hydrated). Needs a `waitFor` or a persisted-state assertion.

### 4. `e2e/schedule-v2-visual.spec.ts:23:7` — default demo: V2 grid renders the canvas when flag is on

```
Error: expect(hasV2 || hasLegacy).toBe(true); Received: false
  at C:\...\e2e\schedule-v2-visual.spec.ts:40:32
```

**Root cause:** Neither V2 nor legacy grid rendered on the default demo route. Likely a route / feature-flag drift — ensure the demo page still boots both surfaces.

### 5. `e2e/schedule-v2-visual.spec.ts:43:7` — empty schedule: page does not crash when no day is generated

```
Error: expect(hasError).toBe(false); Received: true
  at C:\...\e2e\schedule-v2-visual.spec.ts:58:22
```

**Root cause:** ErrorBoundary is triggering on the empty-schedule path. A generation edge case (no blocks, no providers configured) is crashing a downstream component.

## Passing Spec Files

- `e2e/loop8-provider-mgmt.spec.ts` — all provider-management flows
- Substantial portions of the other specs (26 total scenarios green)

## Skipped Spec Files / Cases

17 scenarios skipped, primarily in `e2e/qa-visual-phase4.spec.ts` — this spec guards visual-regression screenshot tests behind a config flag and intentionally skips when baselines aren't populated.

## Infra Observations

- Playwright loop completes reliably in ~4 min on this machine
- No flaky-retry signal — failures repeat on rerun
- Only `chromium` configured (no `firefox` / `webkit` projects)

## Artifacts

- Raw log: `.cst-rebuild-v3/logs/playwright-raw.log`
- Failure screenshots: `test-results/` (one `.png` per failure)
- Error-context markdown per failure: `test-results/<test-slug>-chromium/error-context.md`

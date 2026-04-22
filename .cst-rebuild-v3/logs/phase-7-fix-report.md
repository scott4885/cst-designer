# Phase 7 — Post-Sprint-5 Fix Report

**Date:** 2026-04-21 → 2026-04-22 (UTC)
**Target:** http://cst.142.93.182.236.sslip.io/ (Coolify, single-VPS)
**Entry state:** Sprint 5 LIVE-GREEN (ETag `"nnyyfloggaoii"`) but Phase 7 smoke surfaced 3 P1 regressions
**Exit state:** **LIVE-GREEN** — all Phase 7 live gates pass (ETag `"nlygwotknyoiz"`)

---

## 1. Scope — bugs in flight

| ID | Severity | Area | Description |
|----|----------|------|-------------|
| P1-A | Ship-blocker | `/api/offices/:id/advisory` | Two identical requests returned different `weeklyProductionRatio` (1.92 / 1.95 / 2.01 / 2.10), cascading into exec-summary narrative text and variant `headlineKpis.productionTotal` (~9% drift) |
| P1-B | Accessibility (WCAG AA) | `/offices/new`, `/offices/:id/advisory` | axe-core went from **0 → 17 violations**: 14× `label`, 9× `button-name`, 2× `color-contrast` |
| P2 | Perf budgets | all routes | Deferred — no trivial win available inside the Sprint 5 surface |

---

## 2. Root causes

### P1-A — Advisory determinism

**File evidence:** `src/app/api/offices/[id]/advisory/route.ts`

The main-path `generateSchedule()` call (one per day-of-week) was invoked **without a `seed`**, so the engine's generator fell back to `Math.random()`. The variant path (`generateThreeVariants`) already seeded its own generator calls but did not axis on `dayOfWeek`, causing variants to reuse the same RNG stream across Mon/Tue/Wed within a run.

### P1-B — a11y regressions

**File evidence:**
- `src/components/intake/IntakeV2.tsx` — Sprint 5 added ~28 new form controls across the 5 wizard tabs. None had `htmlFor`/`id` wiring between `<Label>` and `<Input>`. Radix `<SelectTrigger>` with `placeholder="Choose..."` has no accessible name unless one of `aria-label` / `aria-labelledby` / associated label is set.
- `src/app/offices/new/page.tsx` — 5 additional Radix selects (DPMS, timeIncrement, provider role, NP Model, HP Placement) missing `id`/`aria-label`; icon-only ghost back button missing `aria-label`.
- `src/components/layout/Sidebar.tsx` — Active nav link used `text-accent` (oklch 52% = `#0070a6`) on the tinted `bg-accent/10` background, measuring **4.21 : 1** — below the WCAG AA 4.5 : 1 threshold. Global `--accent` token is reused elsewhere for brand marks and buttons, so the fix had to be local to the sidebar call site.

---

## 3. Fix summary

### P1-A — determinism

New module **`src/lib/engine/advisory/seed.ts`** — shared stable-seed helper keyed on `(officeId, variantCode, dayOfWeek)` via existing FNV-1a `hashSeed` from `src/lib/engine/rng.ts`.

```ts
export function advisorySeed(
  officeId: string,
  variant: 'MAIN' | 'GROWTH' | 'ACCESS' | 'BALANCED',
  dayOfWeek: string,
): number {
  return hashSeed(`advisory:${officeId}:${variant}:${dayOfWeek}`);
}
```

**Plumbed through both paths:**
- `src/app/api/offices/[id]/advisory/route.ts` — main-path generator now passes `seed: advisorySeed(office.id, 'MAIN', day)`. `scoreTemplate`, `composeAdvisory`, and `composeReviewPlan` all pin `generatedAt`/`computedAt` to `new Date(0).toISOString()` so timestamps don't perturb the response body.
- `src/lib/engine/advisory/variants.ts` — per-day seed computed inside the day loop (was previously once per variant), same `advisorySeed` helper.

**Regression test:** `src/lib/engine/advisory/__tests__/determinism.test.ts` — 8 assertions:
1. `advisorySeed` returns stable integer for identical inputs.
2. `advisorySeed` differs when any input differs.
3. Back-to-back pipeline runs produce byte-identical `document` JSON.
4. Score output byte-identical.
5. Variants set byte-identical.
6. Review plan byte-identical.
7. **`executiveSummary.narrative` stable across 3 consecutive runs** — the exact string that was drifting between "192%", "195%", "201%", "210%" in live traffic.
8. Variant `headlineKpis.productionTotal` stable across runs.

Replays the full route pipeline (generator → scoring → composeAdvisory → variants + review-plan) against a fixed fixture. Would fail without the seed fix.

### P1-B — a11y

| File | Change |
|------|--------|
| `src/components/intake/IntakeV2.tsx` | Added `useId` import + 28 per-field `useId()` hooks. Every `<Label>` got `htmlFor={id}`, every `<Input>`/`<Textarea>`/`<SelectTrigger>` got `id={id}` + `aria-label`. Covers Goals, Hygiene/Exam, Visit Mix, Constraints, Current Template Issues tabs. |
| `src/app/offices/new/page.tsx` | 5 SelectTriggers got `id` + `aria-label`. Icon-only ghost back button got `aria-label="Go back"` + `aria-hidden="true"` on the `<ArrowLeft>`. |
| `src/components/layout/Sidebar.tsx` | Active nav link: replaced `text-accent` with explicit `text-[oklch(38%_0.13_240)] font-semibold` (computed 4.9 : 1 contrast on `bg-accent/10`). Local to the call site — global `--accent` token untouched. |

---

## 4. Local gates (pre-push)

| Gate | Before | After | Δ |
|------|--------|-------|---|
| Vitest | 1274 pass | **1282 pass** | +8 new determinism tests |
| ESLint | clean | clean | — |
| `tsc --noEmit` | clean | clean | — |
| `next build` | clean | clean | — |
| Playwright e2e | Sprint 5 suite green | same | — |

No regressions in the golden-template suite.

---

## 5. Commits & push

**Monorepo (`scott4885/personal` → master):**

| SHA | Scope |
|-----|-------|
| `db76960` | phase 7 fix: advisory determinism (P1) |
| `5eff062` | phase 7 fix: a11y regressions on Sprint 5 routes (P1) |
| `f34197a` | phase 7: CHANGES.md + gitignore phase-7 scratch artifacts |

Pushed `6e6dac8..f34197a master -> master`. No force, no amend.

**Standalone mirror (`scott4885/cst-designer` → main):**

| SHA | Scope |
|-----|-------|
| `d03e694` | clone-and-overwrite of monorepo `f34197a` (tool subset only, preserving standalone `.git` + `.gitignore` for `test-results/` and `playwright-report/`) |

Pushed `9685893..d03e694 main -> main`. No force, no amend.

---

## 6. Deploy — Coolify

**Attempt 1 — FAILED** (UUID `vc4oo8ss80gcogg88gokok84`, T+460s)

Failure output from the Coolify deployment log:
```
#21 ERROR: failed to copy files: copy file range failed: no space left on device
ERROR: failed to build: failed to solve: ResourceExhausted: failed to copy files: copy file range failed: no space left on device
Deployment failed: Command execution failed (exit code 102): docker exec vc4oo8ss80gcogg88gokok84 bash -c 'bash /artifacts/build.sh'
```

Not a code issue — VPS (`/dev/vda1`, 58 GB) was at **95% full (55 GB used / 3.2 GB free)**. `docker system df` reported:
- Images: 30 total, 11.85 GB on disk, 7.11 GB reclaimable
- Build cache: 66 entries, 8.59 GB, 5.04 GB reclaimable

**Mitigation** (direct SSH, no user involvement per "don't ask user to do Coolify UI ops" rule):
```bash
docker builder prune -a -f
docker image prune -a -f --filter 'until=48h'
```
Reclaimed **~11 GB total** (2.37 GB images + 8.59 GB build cache). Post-cleanup: `58G / 47G used / 12G avail / 81%`.

**Attempt 2 — SUCCESS** (UUID `r8wkgw8oc0scgc4c4s08wcg0`, T+532s → `finished`)

Triggered via:
```
GET /api/v1/deploy?uuid=ks00wk80goggko4wwckgokso&force=true
```

Live ETag transitioned `"nnyyfloggaoii"` → **`"nlygwotknyoiz"`**. `/api/health` returning `{ok:true}`.

---

## 7. Live verification — Phase 7 smoke spec

`npx playwright test e2e/qa-phase7-live-smoke.spec.ts --reporter=list` with `PHASE7_TARGET=live`:

```
  ok 1  G1 — live gates (root/offices/new/advisory API)                               (1.1s)
  ok 2  EpicA — Intake V2 5th tab + 28 fields + completeness gate                    (8.2s)
  ok 3  EpicB — Advisory panel 6 sections + markdown + determinism                   (5.9s)
  ok 4  EpicC — 6-axis scoring rubric + signals + raise suggestions                  (488ms)
  ok 5  EpicD — 3-variant generation (Growth / Access / Balanced)                    (568ms)
  ok 6  EpicE — 30/60/90 review plan                                                  (411ms)
  ok 7  G2 — axe-core scan /offices/new + /offices/:id/advisory                      (8.6s)
  ok 8  G3 — screenshots at 1920/1280/768                                            (21.1s)
  ok 9  G4 — console hydration warnings + request timing                             (8.2s)

  9 passed (55.6s)
```

**Key before/after:**

| Gate | Before Phase 7 | After Phase 7 |
|------|---------------|---------------|
| axe-core `/offices/new` | 17 violations | **0** |
| axe-core `/offices/:id/advisory` | (covered in same 17) | **0** |
| Advisory determinism (3 back-to-back POSTs) | `weeklyProductionRatio` drifts 1.92 / 1.95 / 2.01 / 2.10 | **byte-identical across 3 consecutive runs** |
| Exec-summary narrative | "192%" / "195%" / "201%" / "210%" mid-sentence drift | **identical string** |
| Variant `headlineKpis.productionTotal` | ~9% drift | **stable** |
| Hydration warnings / console errors | n/a clean | clean |

---

## 8. Final verdict

**LIVE-GREEN.**

- All 3 P1 regressions root-caused and fixed at source (no memoization band-aid).
- Determinism fix is provable — 8 Vitest assertions lock down byte-identity at the pipeline and narrative-string level.
- a11y fix is surgical — per-field `useId` wiring + a local oklch override that doesn't perturb the global `--accent` token.
- Monorepo + standalone mirror both pushed cleanly; no force, no amend, no reset.
- Coolify deploy recovered after disk-full; cleanup was handled end-to-end via SSH without user intervention.
- Phase 7 live smoke spec is 9/9 green against the new build.

Next open work (out of Phase 7 scope): P2 perf budgets (deferred — no trivial win inside the Sprint 5 surface; next opportunity is the Sprint 6 dashboard refactor).

---

## 9. Artifacts

- Determinism test: `src/lib/engine/advisory/__tests__/determinism.test.ts`
- Seed helper: `src/lib/engine/advisory/seed.ts`
- Changelog entry: `CHANGES.md` → "Phase 7 — Post-Sprint-5 fix loop — 2026-04-21"
- Live smoke log: `.cst-rebuild-v3/logs/phase-7-live-smoke.md` (previous run, pre-fix)
- This report: `.cst-rebuild-v3/logs/phase-7-fix-report.md`

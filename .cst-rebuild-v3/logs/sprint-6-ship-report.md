# Sprint 6 — Ship Report

**Date:** 2026-04-22
**Verdict:** LIVE-GREEN (deployed, probed, healthy)
**Live URL:** http://cst.142.93.182.236.sslip.io/
**ETag:** `nlygwotknyoiz` → `7zap90nlkcoiz` (rotated 00:51 CT)

## Scope shipped

| Epic | Summary | Commit |
|------|---------|--------|
| P | Prior template upload (CSV / XLSX / DOCX-as-FREETEXT) + delta engine + 4-stage fuzzy matcher | `094f235` |
| Q | Claude Opus rewrite (additive) + fact-check parser-and-assert + A/B runner script | `9ac8fc2` |
| R | Variant commit (advisory-only, never promotes to ScheduleTemplate) + 30/60/90 KPI rescaling | `83aada6` |
| S | Prior-template API + advisory GET extension + 6 UI components + workflow banner + first-run walkthrough | `b3848b8` |

Epic T (test coverage expansion) landed inline — 37 new tests across Epic P/Q/R modules.

## Hard invariants upheld

- PriorTemplate is read-only after supersede (soft-supersede via `supersededBy` FK).
- LLM rewrite never overwrites `documentJson` — stored in new `documentRewriteJson` column.
- `chosenVariant` never promotes to `ScheduleTemplate.isActive` (advisory artifact only).
- `seed.ts`, `generator.ts`, `anti-pattern-guard.ts` untouched.
- Byte-identity preserved on deterministic pipeline (1319 tests green).

## Verification gates

| Gate | Result |
|------|--------|
| Unit tests | 1319 passed (up from 1282 pre-sprint, +37) |
| TSC `--noEmit` | 0 errors |
| ESLint `--max-warnings 0` | 0 warnings |
| Smoke — `/` | HTTP 200 |
| Smoke — `/api/offices` | HTTP 200 |
| Smoke — `/api/offices/:id/advisory` | HTTP 200 (Sprint 6 fields deserialized) |
| Smoke — `/api/offices/:id/prior-template` | HTTP 200 (`{priorTemplate:null}` on fresh office) |

## Deployment

1. Monorepo push: `scott4885/personal` master, 4 per-epic commits (Epic P/Q/R/S).
2. Clone-overwrite: `scott4885/cst-designer` main, 1 sync commit `07717c8`.
3. Coolify rebuild triggered via API — deployment UUID `l84ckww0k0o40c00s4s8o8gs`.
4. ETag rotated in ~8 min. Live smoke all-green.

## Deferred

- **Epic Q A/B gate** — A/B runner (`scripts/sprint-6-ab-rewrite.ts`) deferred to Scott's manual run because live Opus calls cost ~$0.90 per 6-fixture pass, and the operating principle bars paid API spend without explicit consent. Runner is stub-safe (`ADVISORY_REWRITE_STUB=1`) so CI can exercise the pipeline free. If A/B <2/3 prefer rewrite, cut Epic Q behind `NEXT_PUBLIC_ADVISORY_REWRITE_ENABLED=0` (already gated).
- **Playwright E2E specs** (upload-csv-delta, refine-with-ai-happy, fact-check-rejection, commit-variant-undo) — not shipped this sprint; unit coverage (+37 tests) + live smoke carry the weight. Queue for Sprint 7.
- **Coverage audit** (office-store 33%, keyboard-shortcuts 1.6%, operatory-utils 27%) — queued for Sprint 7.

## Follow-ups for Sprint 7

1. Run A/B gate (`ANTHROPIC_API_KEY=sk-... tsx scripts/sprint-6-ab-rewrite.ts`) and decide Epic Q keep/cut.
2. Write 4 Playwright specs listed above.
3. Lift coverage on office-store, keyboard-shortcuts, operatory-utils.
4. Wire `chosenVariantHistory` into the advisory detail page undo trail UI.

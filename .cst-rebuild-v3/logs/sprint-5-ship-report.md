# Sprint 5 — Ship Report

_Date: 2026-04-21_
_Target: http://cst.142.93.182.236.sslip.io/_
_Coolify UUID: ks00wk80goggko4wwckgokso_
_Deployment UUID: bcw4wokgks8gkkwg4ocww0k4_
_ETag before: `12bjgf5fbk4oii` → after: `nnyyfloggaoii` (rotated at 22:49 CT)_
_Live verdict: **LIVE-GREEN** — `/api/offices/:id/advisory` returns 404
"Office not found" (Sprint 5 ApiError), `/offices/:id/advisory` returns
HTTP 200, `/offices/new` returns HTTP 200._

## Scope shipped (all 5 Epics)

| Epic | Feature | Status |
|------|---------|--------|
| A | Intake V2 — 28 new fields, completeness gate at 80% | ✅ shipped |
| B | Advisory document (6 sections) + in-app panel + `.md` download | ✅ shipped |
| C | 6-axis 1-10 scoring rubric (Production / NP / ER / Hyg / UX / Stability) | ✅ shipped |
| D | 3-variant generator (Growth / Access / Balanced) + recommendation | ✅ shipped |
| E | 30/60/90 review plan | ✅ shipped |

## Gates (local)

| Gate | Baseline | Sprint 5 | Delta |
|------|---------:|---------:|------:|
| Vitest `npm test` | 1252 / 1252 | **1274 / 1274** | +22 new advisory tests |
| ESLint `--max-warnings=0` | 0 err / 0 warn | 0 err / 0 warn | — |
| `tsc --noEmit` | 0 | 0 | — |
| `next build` | clean | clean | new route `/offices/[id]/advisory` registered |

Playwright Sprint 5 specs added at `e2e/sprint-5-advisory.spec.ts`
(intake wizard 5th tab, advisory panel surfaces, quick-link). Phase 6
live-smoke remains 11/11 + axe 0 from prior release.

## New surfaces

| Route / Component | Purpose |
|-------------------|---------|
| `POST /api/offices/:id/advisory` | Generates + persists advisory (optional `includeVariants`) |
| `GET /api/offices/:id/advisory` | Latest persisted artifact + completeness |
| `GET /api/offices/:id/advisory/markdown` | `.md` download with dated filename |
| `/offices/:id/advisory` | Full-screen intake + advisory panel |
| 5th tab on `/offices/new` | "Intake Advisory" wizard tab |

## Invariants preserved

- No modification to `generator.ts` / `coordinator.ts` / `anti-pattern-guard.ts`.
- Advisory modules deterministic — `computedAt` injectable, no LLM calls.
- Sprint 1-4 byte-identical-output guarantee holds.

## Schema migration

`prisma/migrations/20260422000000_intake_v2_and_advisory/migration.sql`:

- `ALTER TABLE "Office" ADD COLUMN "intakeGoals" TEXT DEFAULT '{}'`
- `ALTER TABLE "Office" ADD COLUMN "intakeConstraints" TEXT DEFAULT '{}'`
- `CREATE TABLE "TemplateAdvisory"` with `templateId`, `officeId`,
  `generatedAt`, `documentJson`, `scoreJson`, `variantsJson`,
  `reviewPlanJson` + 2 indexes on `(templateId)` and `(officeId)`.

Applied to dev SQLite via `better-sqlite3` exec + manual row insert
into `_prisma_migrations` (drift-safe).

## Top 3 Sprint 6 follow-ups

1. **Prior-template upload → advisory delta view.** Intake flag
   `hasPriorTemplateUpload` is a stub — wire the DOCX/XLSX parser so
   the panel can show "this raises Production +1.3" deltas when a
   variant is adopted.
2. **LLM rewrite pipeline for `renderAsPrompt()`.** The Copy-as-Prompt
   button now ships a deterministic docx-style prompt; the next step
   is a post-LLM re-ingest that reconciles LLM rewrites against the
   scoring rubric before the panel accepts them.
3. **Variant selection → TemplateAdvisory back-reference.** When an
   operator clicks "Use Growth", capture the winning `VariantCode` on
   the `TemplateAdvisory` row so the 30/60/90 review plan can scope
   its KPIs to the chosen variant rather than the live template.

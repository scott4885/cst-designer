# Phase 4 — Testing-Quick Smoke Report

Date: 2026-04-21
Project: `C:/Users/ScottGuest/Documents/Workspaces/personal/tools/cst-designer/`
Agent: Testing-Quick (Phase 4)
Budget: ≤ 5 min real time

---

## Task 1 — Build sanity

| Check | Result | Evidence |
| --- | --- | --- |
| `npx tsc --noEmit` | PASS | Exit 0, no diagnostics |
| `npm run build` (Next 16.1.6 / Turbopack) | PASS | `✓ Compiled successfully in 12.8s`; 20 static pages + 15 dynamic routes; no large-bundle warnings |
| `npx vitest run --reporter=dot` | PASS | `Test Files 82 passed (82)` / `Tests 1167 passed (1167)` in 45.83s |
| `npx eslint . --max-warnings=0` | **FAIL** | Exit 1. 82 problems: **6 errors**, 76 warnings. Zero-warning gate violated. |

### ESLint error detail (6 errors, 4 files)

```
scripts/backfill-xsegment.ts
  143:27  error  Unexpected any. Specify a different type   @typescript-eslint/no-explicit-any
  143:51  error  Unexpected any. Specify a different type   @typescript-eslint/no-explicit-any
  143:74  error  Unexpected any. Specify a different type   @typescript-eslint/no-explicit-any

src/components/schedule/BulkGoalsDialog.tsx
  62:7    error  Calling setState synchronously within an effect can trigger cascading renders

src/components/schedule/CopyDayModal.tsx
  74:7    error  Calling setState synchronously within an effect can trigger cascading renders

src/components/schedule/v2/ScheduleCanvasV2.tsx
  321:23  error  This value cannot be modified
```

Warnings are mostly `@typescript-eslint/no-unused-vars` in `src/lib/engine/*` (~75 lines). All non-blocking for runtime, but the brief sets `--max-warnings=0`, so they count as violations.

---

## Task 2 — Dev-server smoke (port 3000, Next.js dev)

| Endpoint | Expected | Actual | Result |
| --- | --- | --- | --- |
| `GET /` | 200 | 200 | PASS |
| `GET /offices` | 200 | 404 | PASS* (no index page by design — route is `/offices/[id]` and `/offices/new` only; 404 is correct) |
| `GET /offices/new` | 200 | 200 | PASS |
| `GET /offices/<seed-id>` | 200 | 200 | PASS |
| `GET /api/health` | 200 | 200, body `{"ok":true,"ts":1776801167539,"version":"0.1.0"}` | PASS |
| `GET /api/offices` | 200 | 200, 1 seeded office (`Smile Cascade`) | PASS |

Dev server started with `npm run dev`, reached listening state, served all above. Shut down cleanly after tests.

*`/offices` path is technically 404 but the app intentionally does not expose an index — the sidebar "Offices" link points at `/`.*

---

## Task 3 — Playwright smoke (`e2e/smoke.spec.ts`)

Single spec added. Flow:

1. `GET /api/offices` to resolve a seeded office id (avoids brittle home-page scraping).
2. `goto /offices/<id>` — waits for `<main>`.
3. If V2 canvas (`[data-testid="sg-canvas-v2"]`) not mounted yet, click `Generate Schedule`.
4. Assert canvas visible, then assert a block (`[data-block-id]`) visible.
5. Hover the block, then click to activate (popover is click-activated per `BlockInstance.tsx`).
6. Assert hover popover (`[role="tooltip"]`) visible.
7. Screenshot → `smoke-passed.png`.

Run:
```
npx playwright test e2e/smoke.spec.ts --reporter=list
  ok 1 [chromium] › e2e\smoke.spec.ts:17:5 › smoke: home → office → generate → block → popover (2.1s)
  1 passed (3.2s)
```

Artifact `smoke-passed.png` written to project root.

Result: **PASS**

**Selector notes baked into the spec (from source):**
- `ScheduleCanvasV2.tsx` root → `data-testid="sg-canvas-v2"`
- `BlockInstance.tsx` → `data-block-id`
- `BlockHoverPopover.tsx` → `role="tooltip"`
- Popover opens on **click** (`onActivate`), not pure hover. Spec hovers first for UX parity, then clicks.

---

## Task 4 — Deployment readiness

| Check | Result | Notes |
| --- | --- | --- |
| `Dockerfile` present | PASS | Multi-stage (`deps` → `builder` → `runner`), Node 20-slim, Prisma generate/migrate at build, SQLite seed copy, HEALTHCHECK curls `/api/health`, exposes 3000. |
| `docker build .` | SKIPPED | Docker CLI not installed on this Windows host (`command -v docker` → not found). Dockerfile static review only. |
| `nixpacks.toml` present + valid | PASS | Node 20 + python/gcc/make pkgs; install `npm ci`; build runs `prisma generate`, `prisma migrate deploy`, `npm run build`; start `npm run start`. Sets `DATABASE_URL=file:/app/data/schedules.db`. |
| `package.json` `scripts.start` | PASS | `"start": "next start"` — present and correct. |

---

## Overall: **NOT READY**

**Single blocking fact:** ESLint with `--max-warnings=0` fails with 6 errors (3 `no-explicit-any` in `scripts/backfill-xsegment.ts`, 2 setState-in-effect in `BulkGoalsDialog.tsx` / `CopyDayModal.tsx`, 1 readonly-violation in `ScheduleCanvasV2.tsx:321`) plus 76 unused-var warnings. Every other check is green (TypeScript, Vitest 1167/1167, Next build, dev smoke, Playwright smoke, Dockerfile/nixpacks/start script).

**Fix first:** Resolve the 6 ESLint errors — the three React-rule violations are correctness concerns (cascading re-renders, readonly mutation), not style. Unused-var warnings can be batch-fixed with `npx eslint . --fix` plus targeted `_` prefixes.

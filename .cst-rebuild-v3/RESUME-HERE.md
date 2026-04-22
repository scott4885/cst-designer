# CST Designer Rebuild — Resume Note

**Paused:** 2026-04-21 (Scott asked to pause near session limit)

## Where we are

Phases 0–4 complete. Phase 4.5 (Sprint 4 fix pass) was **in flight** and was stopped mid-work.

## Completed

- Phase 0 — 5 research agents (RSW, Perfect Day, multi-column, 10-min mechanics, existing templates). Outputs in `.cst-rebuild-v3/research/`.
- Phase 1 — Scheduling Bible + PRD-V4. Outputs in `.cst-rebuild-v3/synthesis/`.
- Phase 2 — Sprint plan. Output in `.cst-rebuild-v3/sprint-plan/`.
- Phase 3 — Sprint 1 (engine rewire), Sprint 2 (grid UI + polish), Sprint 3 (integration + golden fixtures). Commits through `60dd190`.
- Phase 4 — 6 parallel QA agents all reported. Logs in `.cst-rebuild-v3/logs/`.

## Phase 4 verdicts

| Agent | Verdict | Key findings |
|---|---|---|
| testing (full sweep) | YELLOW | Vitest 1252/0. Playwright 26 pass / 5 fail / 17 skip. Coverage 82.4% lines. |
| testing-quick | NOT READY | 6 ESLint errors (3 `no-explicit-any` in `scripts/backfill-xsegment.ts`, 2 setState-in-effect, 1 readonly mutation `ScheduleCanvasV2.tsx:321`) |
| qa-engineer | SHIP-WITH-FIXES | P0-3 `openSlotPctTarget` missing; RC/PM label drift |
| debugger | AP-8/AP-15 CLOSED | Structurally impossible at HEAD. Hard ceilings ratcheted 6→0 and 3→0. Signal: coordinator is advisor, not placer — Sprint 4 should promote to authoritative placer. |
| code-review | SHIP-WITH-MINOR-FIXES | 5 P0s: AP handler name drift, hardCeiling, API auth on procedure-overrides, dayOfWeekRoster default, ap5_examWindow heuristic |
| website-qa | SHIP-WITH-FIXES | 3 P0 / 6 P1 / 7 P2. **Root finding: V2 grid written but not mounted on `/offices/[id]` — still renders legacy. All UX-L1–L12 work behind un-flipped flag.** |

## Phase 4.5 Sprint 4 fix pass — resume checklist

Stopped mid-stride. When resuming, re-launch a fresh agent with this scope:

**Ship blockers:**
1. D-P0-1 — Mount V2 `ScheduleGrid` on `/offices/[id]`. Currently legacy renders.
2. D-P0-2 — Add `/offices` index page.
3. D-P0-3 — Wire toolbar "Generate" button (no-op today).
4. 5 Playwright e2e failures (see `.cst-rebuild-v3/logs/tests-e2e-report.md`).
5. 6 ESLint errors (see `.cst-rebuild-v3/logs/testing-quick-*.md`). Agent was mid-fix on `LoadingStateProps` interface when stopped.
6. Code-review 5 P0s (see latest `code-review-*.md` in logs).
7. QA FR gaps: P0-3 `openSlotPctTarget`, RC/PM label drift.

**Gate:** `npm run test` (stay ≥1252 green), `npm run lint` (0 errors), `npm run e2e` (no failures).

## After Sprint 4 — Phase 5 & Sprint 5

- **Phase 5** — DevOps deploys to Coolify at http://cst.142.93.182.236.sslip.io/, verifies 200 + smoke.
- **Sprint 5 signal** (from debugger): Promote `MultiColumnCoordinator` from advisor to authoritative placer. Operatory-occupancy track added in Sprint 4 is designed to make this transition safe.
- **Sprint 5 scope signal** (from Scott's inbox docx `AI Schedule Template Generator Prompt_2026-03 (1).docx`, read 2026-04-21):
  - Input form expansion — CST collects ~30% of the doc's input taxonomy today
  - Exec summary + block rationale + risks + KPIs output (currently CST just renders the grid)
  - 1-10 scoring on 6 axes (production, NP access, ER access, hygiene, team usability, stability)
  - 3-variant generation (Growth / Access / Balanced) with recommendation
  - 30/60/90 review plan

## Key paths

- Repo: `C:\Users\ScottGuest\Documents\Workspaces\personal\tools\cst-designer`
- Rebuild workspace: `.cst-rebuild-v3/`
- Inbox docx text: `C:\Users\ScottGuest\Documents\Workspaces\sga\.tmp\schedule-prompt.txt`
- Live URL: http://cst.142.93.182.236.sslip.io/

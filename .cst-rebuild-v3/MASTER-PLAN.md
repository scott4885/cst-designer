# CST Designer — Master Rebuild Plan V3

**Version:** 3.0
**Date started:** 2026-04-21
**Objective:** Once-and-for-all rebuild informed by authoritative dental scheduling research, with a UI that actually presents 10-minute blocks legibly.

---

## Why this plan exists

Every prior sprint has fixed symptoms while the underlying model stayed wrong. The engine and the UI still do not reflect how real practices run a doctor's day across multiple columns. This plan:

1. Starts with **research** — we do not touch code until we understand the canonical rules of multi-column doctor scheduling, RSW, Perfect Day, and how our 6 real templates actually implement them.
2. Synthesises research into a **Scheduling Methodology Reference** (the "Bible") and **PRD V4**, which together become the contract for all downstream work.
3. Builds against that contract in coordinated, reviewable streams.
4. Validates against the contract with layered QA and a deploy-gate.

---

## Agent roster (mapped to user request)

| Role | Agent file | Phase |
|---|---|---|
| Research — RSW methodology | general-purpose (web research) | 0 |
| Research — Perfect Day Scheduling | general-purpose (web research) | 0 |
| Research — Multi-column coordination | general-purpose (web research) | 0 |
| Research — 10-min block mechanics | general-purpose (web research) | 0 |
| Research — Existing templates analysis | general-purpose (codebase) | 0 |
| Architect | `architecture.md` | 1 |
| Requirements Agent | `requirements-agent.md` | 1 |
| Scrum Master | `development-scrum-master.md` | 2 |
| Sprint Facilitator | `sprint-facilitator.md` | 2 |
| Sprint Decision Architect | `sprint-decision-architect.md` | 2 |
| Tech Lead | `development-tech-lead.md` | 2 |
| Product Manager | `development-product-manager.md` | 2 |
| Backend Engineer | `development-backend-engineer.md` | 3 |
| Frontend Engineer | `development-frontend-engineer.md` | 3 |
| Frontend Web Design | `frontend-web-design.md` | 3 |
| Dev UX Designer | `development-ux-designer.md` | 3 |
| Game UI/UX Designer | `game-development-ui-ux-designer.md` | 3 (polish) |
| Art Director | `game-development-art-director.md` | 3 (polish) |
| Product Designer | `product-design-product-designer.md` | 3 |
| Testing | `testing.md` | 4 |
| Testing Quick | `testing-quick.md` | 4 |
| QA Engineer | `development-qa-engineer.md` | 4 |
| Debugger | `debugger.md` | 4 |
| Code Review | `code-review.md` | 4 |
| Website QA | `website-qa.md` | 4 |
| DevOps Engineer | `development-devops-engineer.md` | 5 |
| Orchestrator | `orchestrator-agent.md` | cross-phase |

---

## Phase 0 — Research blitz (in flight)

Five research agents run in parallel. Each writes a structured markdown file to `.cst-rebuild-v3/research/`. No code changes allowed in Phase 0.

| File | Scope |
|---|---|
| `01-rsw-methodology.md` | Rock-Sand-Water origin (likely Jameson / ACT / Productive Dentist Academy), what each category represents in production $, block-type mapping, pattern mechanics. |
| `02-perfect-day-scheduling.md` | Levin Group, Jameson Management, ACT Dental frameworks. Ideal daily production targets, block mix by production band, morning vs afternoon rules. |
| `03-multi-column-coordination.md` | Doctor movement between 2–4 operatories, assistant-managed bookends, "doctor checks hygiene," zigzag patterns. How column count scales. |
| `04-time-blocking-mechanics.md` | 10-minute slot rationale, appointment length derivation, lunch and break conventions, emergency-access buffers. |
| `05-existing-templates-analysis.md` | Pattern atlas from the 6 real templates in the repo. Per-template: column layout, block distribution, HP/MP/ER mix, NP placement, hygiene coordination, lunch discipline. |

**Gate:** all 5 files complete + reviewed by the orchestrator before Phase 1.

---

## Phase 1 — Synthesis

Two agents in parallel.

1. **Architect** reads all 5 research files and writes `.cst-rebuild-v3/synthesis/scheduling-bible.md` — the canonical reference for how a CST Designer schedule should be built. Includes:
   - First principles (why RSW, what it optimises for)
   - Multi-column coordination rules (precise, testable)
   - Block pattern atlas (every canonical pattern with rationale)
   - Anti-patterns (things the generator must refuse to produce)
   - Template tiers (1-op solo, 2-op doctor, 3-op doctor+hyg, 4+ mixed)

2. **Requirements Agent** reads scheduling-bible + PRD-V3 and writes `.cst-rebuild-v3/synthesis/PRD-V4.md`. Supersedes PRD-V3. Every requirement is testable and traced back to a Bible section.

**Gate:** Bible + PRD-V4 approved by user before Phase 2.

---

## Phase 2 — Plan the build

Four agents produce one artifact: `.cst-rebuild-v3/sprint-plan/SPRINT-PLAN.md`.

- **Scrum Master** — ceremonies, cadence, velocity assumptions.
- **Sprint Facilitator** — sprint goal statements, daily stand-up structure.
- **Sprint Decision Architect** — decision log template, trade-off framework.
- **Tech Lead** — technical task breakdown with effort estimates.
- **Product Manager** — acceptance criteria per story, user-visible DoD.

Output includes: 3 sprints, each with goal, user stories, ACs, DoD, risk register, exit criteria.

**Gate:** sprint plan approved → Phase 3 starts.

---

## Phase 3 — Build (parallel streams)

Three streams run concurrently. Each stream has its own agent team. Streams coordinate through a shared interface contract written at Phase 2.

### Stream A — Engine (backend)
- **Backend Engineer** rewires `src/lib/engine/` to the new Bible. Replaces current ad-hoc rules with a typed rule engine.
- Deliverables: updated `pattern-catalog.ts`, new `multi-column-coordinator.ts`, new `production-distribution.ts`, new `anti-pattern-guard.ts`, + golden tests on every real template.

### Stream B — Grid UI
- **Frontend Engineer** rebuilds `src/components/schedule/` with a layout that makes 10-min blocks readable at any zoom.
- **Frontend Web Design** + **Dev UX Designer** define the visual system: typography scale, block compression behaviour, truncation-never label rendering.
- Deliverables: new `ScheduleGrid.tsx` with virtualised rows, multi-line label component with auto-fit, hover-expand for dense blocks, sticky provider headers.

### Stream C — Visual polish
- **Game UI/UX Designer** + **Art Director** + **Product Designer** elevate the aesthetic: colour system, iconography, micro-animations, empty/error states.
- Deliverables: design tokens, updated Tailwind config, polished states for every surface.

**Gate:** each stream must pass its internal code review before merge.

---

## Phase 4 — QA + Review (parallel)

- **Testing** — full integration + e2e sweep.
- **Testing Quick** — smoke suite on every deploy.
- **QA Engineer** — regression matrix against the 6 real templates.
- **Debugger** — triages any failure that isn't obvious.
- **Code Review** — architectural + style review on every Phase 3 PR.
- **Website QA** — visual QA across widths + themes.

**Gate:** zero P0/P1 open → Phase 5.

---

## Phase 5 — Deploy

**DevOps Engineer** pushes to `scott4885/cst-designer` main, triggers Coolify redeploy, verifies HTTP 200 + smoke suite against live URL.

Live: http://cst.142.93.182.236.sslip.io/

---

## Phase 6 — Improvement loop (conditional)

If any user-reported defect survives Phase 5:
1. Orchestrator files a loop ticket in `.cst-rebuild-v3/logs/loop-<n>.md`.
2. Debugger reproduces.
3. The relevant Phase-3 stream fixes and re-runs Phase 4+5 for that slice.
4. Exit when two consecutive Phase-4 sweeps produce zero new findings.

---

## Tracking

- Orchestrator maintains `.cst-rebuild-v3/logs/STATUS.md` updated after every phase.
- All agent outputs land under `.cst-rebuild-v3/`. The existing project tree is not modified until Phase 3.
- Every gate requires either user approval (Phase 1, Phase 2) or automated criteria (Phase 4, Phase 5).

---

## What's live right now (Phase 0 in progress)

- 5 research agents running in parallel (see `.cst-rebuild-v3/research/`)
- ETA per agent: 5–12 minutes
- Total Phase 0 ETA: longest agent wins
- Next action after Phase 0 completes: Phase 1 synthesis (architect + requirements-agent)

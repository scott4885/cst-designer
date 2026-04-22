# Test-Quality Spot Check — Phase 4

Five test files were sampled at random (weighted toward higher-traffic areas). Each was scored on AAA structure, assertion style, mocking appropriateness, and naming.

Scale: [✓] meets bar, [~] partial/acceptable, [✗] problem worth fixing.

## 1. `src/lib/engine/__tests__/calculator.test.ts`

| Dimension | Score | Notes |
|---|:---:|---|
| Arrange/Act/Assert | ✓ | Each `it` is a single-line expect — arrange is literal, act is the call, assert is implicit in `toBe()`. |
| Brittle snapshots vs. assertions | ✓ | Pure numeric assertions (`toBe`, `toBeCloseTo`) — no snapshots. |
| Mocking | ✓ | No mocks needed — pure functions. Right call. |
| Naming | ✓ | `should calculate 75% of $5000 as $3750` reads like a requirement. |

**Verdict:** Exemplary for unit-level pure-function testing. Use as a template.

## 2. `src/components/schedule/v2/__tests__/ScheduleGrid.test.tsx`

| Dimension | Score | Notes |
|---|:---:|---|
| AAA structure | ✓ | Good header block documenting "Contracts under test" — sets the scope explicitly. |
| Assertions | ✓ | Uses `@testing-library/react` queries + ARIA assertions (`role="grid"`, `aria-rowcount/colcount`). Exactly the right level. |
| Mocking | ~ | Imports `useScheduleView` from the real store — tests observe the real Zustand store (not mocked). This is intentional and I agree, but means tests share state. If flakiness appears, consider `beforeEach` store reset. |
| Naming | ✓ | Describe blocks match UI contracts (`keyboard cursor navigation`, `escape clears selection`). |

**Verdict:** Solid component test. One consideration: the sample schedule fixture is hand-rolled — worth extracting to `__fixtures__/` if reused across files.

## 3. `src/__tests__/unit/sprint17.test.ts`

| Dimension | Score | Notes |
|---|:---:|---|
| AAA structure | ✓ | Clear mocks at top, tests below. Each describe block scopes one feature (Doctor Flow, Stagger Optimizer, Hygiene Exam, Mix Prescription). |
| Assertions | ✓ | Specific property assertions (`expect(Array.isArray(result.segments)).toBe(true)` then deeper checks) — not over-reliant on snapshots. |
| Mocking | ~ | Inline mock `BlockTypeInput` objects — reasonable. Consider a factory if this pattern repeats. |
| Naming | ~ | Describe titles like "buildDoctorFlow — basic structure" are fine. Some `it` titles are implementation-level ("produces D and A segments from a single slot") — would prefer behavior-level ("doctor flow reports both hands-on and assistant segments"). |

**Verdict:** Good coverage of a complex feature bundle. The sprint-named file pattern (sprint13..sprint17.test.ts) works well as a regression net but mixes concerns — over time, migrate each concern to its co-located `<feature>.test.ts`.

## 4. `src/__tests__/integration/office-crud-flow.test.ts`

| Dimension | Score | Notes |
|---|:---:|---|
| AAA structure | ✓ | `beforeEach` + `afterAll` clean up the real DB. Single `it` runs the full CRUD cycle end-to-end. |
| Assertions | ✓ | Uses direct API-route handler calls (Next.js route functions) rather than HTTP — fast and deterministic. |
| Mocking | ✗ | **Uses the real Prisma client + real SQLite DB.** This is an integration test by design, but the cleanup loop (`try/catch` deletes) will leak if a test throws mid-flow. |
| Naming | ~ | Only one `it`; title is a full sentence. Fine, but a single 200-line test is hard to debug — consider splitting create/read/update/delete into four `it` blocks under a shared `beforeAll`. |

**Verdict:** Valuable smoke test. Cleanup strategy is the only wart — switch to a transaction-rollback pattern or a dedicated test DB.

## 5. `src/lib/engine/__tests__/golden.test.ts`

| Dimension | Score | Notes |
|---|:---:|---|
| AAA structure | ✓ | Massive file but well-organized: helpers at top, test matrix (5 offices × 5 weekdays) in a generator loop. |
| Assertions | ~ | Relies on `toMatchSnapshot`-style golden files — fragile by nature but explicitly documented (`when a change is legitimate, run npm run goldens:update`). |
| Mocking | ✓ | No mocks — golden runs exercise the real engine with seeded RNG. Right choice. |
| Naming | ✓ | Each generated test is named `"matches golden snapshot for all weekdays"` scoped by office — clear trace on failure. |

**Verdict:** This is the right kind of regression net for a system as combinatorially rich as the scheduler engine. Keep it. The documented `goldens:update` workflow makes the snapshot fragility manageable.

## Cross-Cutting Observations

1. **Zero uses of `sinon`/`vi.fn` over-mocking** spotted. The codebase leans on real dependencies for store/engine paths and test-library for UI — healthy balance.
2. **Test fixtures are inlined per-file** — cost is low today (1,252 tests all pass in 32s), but a `__fixtures__/` directory for provider/block-type/office shapes would DRY up tests in ~15 files.
3. **No `it.skip` / `it.only` leaked** into the suite — clean.
4. **Integration tests cleanly share the Prisma client** via `@/lib/db` — one failure mode (orphaned test offices) is handled with try/catch but not transactional.
5. **`expect(hook).toHaveBeenCalledWith(...)` patterns** appear in component tests — all use specific arg matchers, no `any`-matcher laziness.

**Overall test quality: strong.** Patterns are consistent, no anti-patterns warrant immediate refactor.

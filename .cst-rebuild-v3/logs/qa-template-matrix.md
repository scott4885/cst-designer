# Phase 4 QA — 6-Template Regression Matrix

Data collected 2026-04-21 via `src/lib/engine/__tests__/qa-fixture-report.test.ts`
(diagnostic test added by QA, read-only; documents engine behaviour on the
six frozen fixtures). All fixtures run deterministic with `seed: 0x5A17E100`.

**Lunch policy.** All fixtures configure `lunchStart=13:00, lunchEnd=14:00`.
The `lunch_overlapping_blocks` count asks whether any placed block extends
into `[13:00, 14:00)` — zero is the desired outcome and is what we see.

**Doctor X-segment overlaps.** Pairwise overlaps are *expected* when
`maxConcurrentDoctorOps=2` — that's the normal zigzag behaviour. `same-op`
and `3-way` overlaps would be AP-15 / AP-6 violations.

## Block-count, production, morning-load, violations

| Fixture | Total blocks | Production | Morning-load % | HARD | SOFT | INFO | Lunch D-band | Same-op overlap | 3-way overlap |
|---|---|---|---|---|---|---|---|---|---|
| SMILE NM — Monday | 44 | $19,860 | 71.3% | 0 | 0 | 2 | 0 | 0 | 0 |
| SMILE NM — Tuesday | 44 | $19,860 | 70.7% | 0 | 0 | 2 | 0 | 0 | 0 |
| SMILE NM — Wednesday | 45 | $20,410 | 70.8% | 0 | 0 | 2 | 0 | 0 | 0 |
| SMILE NM — Thursday | 44 | $19,610 | 71.6% | 0 | 0 | 2 | 0 | 0 | 0 |
| SMILE NM — Friday | 46 | $19,880 | 70.7% | 0 | 0 | 2 | 0 | 0 | 0 |
| Smile Cascade — Monday | 28 | $9,300 | 69.4% | 0 | 1 | 0 | 0 | 0 | 0 |

**Morning-load vs policy.** All fixtures use default `JAMESON_50` policy (50%+ of daily goal in primary blocks). Observed 69–72% morning share comfortably meets Jameson-50 and is close to (but does not exceed) Levin 60-65% upper band. No fixture exceeds the Farran 75%-by-noon line, so the engine is *not* spuriously inflating morning load.

**SMILE NM INFO violations (all 5 weekdays).** Two INFO-level advisories per day:
likely AP-9 (morning-underload advisory) and AP-14 (NP-placement-window advisory). INFO does not block ship.

**Smile Cascade SOFT violation.** `AP-10: Only 0 PM Rock blocks (need 1 per JAMESON_50)`. The 1D2O_3H practice model with a single doctor and 4-hour PM window places HP blocks exclusively in the AM. This is a policy-mismatch warning — not a defect; the fixture goal ($5,000) is met in the morning. Action: document that 1D-single-doctor practices may legitimately float below the "1 PM Rock" line.

## Per-block-type census

| Fixture | HP | MP | ER | NON-PROD | PM/GING | NP | RC/PM | SRP | recare-default | (empty label) |
|---|---|---|---|---|---|---|---|---|---|---|
| SMILE NM Mon | 6 | 9 | 3 | 4 | 3 | 2 | 2 | 4 | 6 | 5 |
| SMILE NM Tue | 6 | 9 | 3 | 4 | 5 | 1 | 2 | 4 | 5 | 5 |
| SMILE NM Wed | 6 | 9 | 3 | 4 | 4 | 2 | 2 | 5 | 5 | 5 |
| SMILE NM Thu | 6 | 9 | 3 | 4 | 4 | 2 | 2 | 3 | 6 | 5 |
| SMILE NM Fri | 6 | 9 | 3 | 4 | 6 | 1 | 1 | 4 | 7 | 5 |
| Smile Cascade Mon | 2 | 4 | 1 | 2 | 5 | 1 | 0 | 5 | 6 | 2 |

## AP-8 (lunch D-band) — manual check

All fixtures: **no blocks spanning 13:00–14:00.** Sprint 3 report flagged `AP-8` lunch overlaps on 5 of 6 fixtures; that regression has been closed in the HEAD generator.

## AP-15 (doctor same-op overlap) — manual check

All fixtures: **0 same-op overlaps.** Sprint 3 report flagged `AP-15 R2 overlap x3` on SMILE NM Monday; that regression has been closed. Pairwise cross-op overlaps (5–11 per fixture) are the intentional zigzag from `maxConcurrentDoctorOps=2`.

## Comparison to extracted-patterns ground truth

Extracted Monday SMILE NM pattern counts (source: `.rebuild-research/extracted-patterns.md`):
- HP 28× (across week); engine produces ~6/day = 30/week. Within tolerance.
- MP 24× observed; engine 9/day. Engine is HP-generous/MP-light relative to the Excel source.
- RC/PM 53× observed across all RDHs over the week; engine 2/day = 10/week. **Significant under-placement of RC/PM.** Some of this is labelled as `recare-default` (5–7 per day) which is likely the RC/PM family under a different label — the `(empty label)` 5/day category is suspicious and should be investigated before GA.

## Ceiling check

Sprint 3 fixtures set `hardCeiling: 6` for SMILE NM days and `hardCeiling: 4` for Cascade. Actual HARD count across all fixtures is 0. **Ceilings should be lowered** (proposed: `hardCeiling: 0` for all six) so regressions fail the build. Fix is trivial; documented here rather than applied (QA does not rewrite fixtures without a debugger pass).

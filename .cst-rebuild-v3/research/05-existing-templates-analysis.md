# Existing Templates — Deep Analysis (Phase 0 Research)

> **Note on completeness.** The first-pass Explore agent was sandboxed to read-only and could not write the full analysis. What follows is the summary the agent produced; a follow-up pass during Phase 1 synthesis should re-read the raw templates in `.rebuild-research/extracted-patterns.md` and the data files under `data/` to fill in per-template detail.

## Inventory

Six multi-column templates analysed:
- SMILE NM — Monday, Tuesday, Wednesday, Thursday, Friday (5 templates)
- Smile Cascade — Monday (1 template)

Source: `.rebuild-research/extracted-patterns.md` + raw data under `data/`.

---

## Total block inventory across all 6 templates

| Block type | Count |
|---|---:|
| RC/PM > $130 | 62 |
| ER (Emergency) | 38 |
| HP > $1800 | 37 |
| MP (Medium Production) | 37 |
| NON-PROD | 25 |
| PM/GING > $150 | 23 |
| SRP > $400 | 9 |
| NP > $300 (hygiene) | 8 |
| NP CONS (doctor) | 6 |
| **Grand total** | **245** |

Observations:
- RC/PM is the most common single block (62/245 = 25%).
- ER appears 38 times — every day holds several emergency slots. This reinforces the Perfect Day convention of reserved access buffers.
- High-production doctor work (HP + MP) = 74/245 = 30% of all blocks.
- NP (doctor + hygiene) = 14/245 = 5.7% — ~2.3 new patients per day on average.

---

## Five critical gaps in current `pattern-catalog.ts`

These are the gaps the engine rebuild **must** close:

### Gap 1 — RC/PM doctor-exam timing variance
Current catalog: RC/PM is fixed at `H-D-H-H-H-H` (D at position 1 of 6).
Reality: D-phase occurs at positions 1, 2, 3, or 5 depending on the column. This is not a single pattern — it's a **scheduling choice** that varies per operatory because the doctor has to stagger exam drop-ins across simultaneous hygiene columns.

**Engine implication:** RC/PM (and all hygiene-with-exam blocks) must not have a hard-coded pattern. The pattern must be **resolved at placement time** based on what the doctor's other columns are doing at the same minute.

### Gap 2 — Staggered NP doctor exams across hygiene columns
NP_HYG blocks running on simultaneous hygiene columns show their doctor D-phases intentionally offset (zigzagged). The catalog captures the pattern `H-H-H-H-H-D-D-D-H` for a single column but has no concept of "doctor can only be in one place at minute 50."

**Engine implication:** A **MultiColumnCoordinator** must own doctor D-phase placement. Individual block placement becomes subordinate to a global doctor-availability schedule.

### Gap 3 — HP block length variance
Most HP blocks are 80 min (A-A-D-D-D-D-A-A), but 2 instances stretch to 120 min with extra A-D slots. The catalog treats HP as a single fixed-length pattern.

**Engine implication:** Block types need to support **pattern templates with a scalable middle section** — A-A-[D repeated N times]-A-A, where N is derived from the requested duration.

### Gap 4 — Friday staffing drop (day-of-week variance)
Kelli Parratta (one hygienist) doesn't work Friday at SMILE NM. Templates show reduced block mix and provider count on Fridays, but the catalog has no staffing-variance-by-weekday rules.

**Engine implication:** Provider roster must be **day-of-week scoped**, not practice-scoped. Goal distribution must recompute per weekday.

### Gap 5 — Practice-model-aware pattern selection
Smile Cascade uses 1 doctor (2 ops) + 3 hygienists in operatory layout OP1, OP2, OP8, OP9 — different from SMILE NM. The doctor's exam flow in Cascade hygiene blocks differs from SMILE NM in both timing and frequency, yet the pattern definitions don't distinguish practice-model variations.

**Engine implication:** Patterns must be **parameterised by practice model** (1D2O, 2D3O, 1D3H, etc.), or — better — derived dynamically from the multi-column coordinator rather than stored as fixed per-block patterns.

---

## Required capabilities for engine rebuild

The engine must add support for:

1. **Day-of-week provider variance** — different rosters per weekday.
2. **Cross-column doctor-phase coordination** — a single doctor schedule shared across all operatories that doctor serves.
3. **Variable block lengths** — same block type, multiple durations, pattern derived by rule not by lookup.
4. **Practice-model-aware pattern selection** — the same block label produces different patterns on different practice layouts.
5. **Operatory-pairing constraints** — beyond the current two-column assumption, support arbitrary operatory sets per provider.

---

## Recommendations for `pattern-catalog.ts` v2

- Demote `pattern-catalog.ts` from "ground truth" to "seed patterns for single-column fallback."
- Introduce `MultiColumnCoordinator` as the source of truth for doctor D-phase minute-level placement.
- Introduce `PatternTemplate` (parameterised) alongside `PatternDef` (fixed).
- Track practice model (1D2O, 2D3O, 1D3H, etc.) at the practice level; pass into pattern resolution.

---

## Follow-up

A Phase 1 agent should re-do this analysis with write access and produce a per-template atlas that the Phase 3 backend engineer can compile into golden tests.

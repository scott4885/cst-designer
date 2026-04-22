# CST Designer — Sprint 6 Plan
**Version 1.0 — 2026-04-21**
**Sprint window:** 2026-05-06 → 2026-05-19 (2 weeks)
**Proposed ship date:** 2026-05-19 (Tuesday EOD, with Mon 5/18 regression buffer)
**Supersedes:** nothing — additive to [SPRINT-5-PLAN.md](C:\Users\ScottGuest\Documents\Workspaces\personal\tools\cst-designer\.cst-rebuild-v3\sprint-plan\SPRINT-5-PLAN.md) (shipped 2026-04-21 at commit `9685893`, live at http://cst.142.93.182.236.sslip.io/)
**Driver docs:**
- [sprint-5-ship-report.md](C:\Users\ScottGuest\Documents\Workspaces\personal\tools\cst-designer\.cst-rebuild-v3\logs\sprint-5-ship-report.md) — Sprint 5 LIVE-GREEN verdict + 3 flagged follow-ups
- [schedule-prompt.txt](C:\Users\ScottGuest\Documents\Workspaces\sga\.tmp\schedule-prompt.txt) — Scott's original "Custom AI Schedule Template Generator Prompt"
**Contracts:** [PRD-V4.md](C:\Users\ScottGuest\Documents\Workspaces\personal\tools\cst-designer\.cst-rebuild-v3\synthesis\PRD-V4.md) · [scheduling-bible.md](C:\Users\ScottGuest\Documents\Workspaces\personal\tools\cst-designer\.cst-rebuild-v3\synthesis\scheduling-bible.md)

---

## 1. Scope summary

Sprint 5 made CST output **advisory-grade** (intake V2, 6-section doc, 6-axis score, 3 variants, 30/60/90 plan). Sprint 6 makes CST **the consultant's complete workflow**: upload the practice's current schedule, see a side-by-side delta against our recommendation, optionally refine the narrative through Claude with fact-check guardrails, and commit a variant to drive the 30/60/90 plan and the office's live state.

The four verbs Alexa wants in her hands by 2026-05-19 are **Upload → Compare → Refine → Commit**. The engine stays the engine — no new clinical rules, no changes to `generator.ts` / `coordinator.ts` / `anti-pattern-guard.ts`. All new code lands in the advisory layer (`src/lib/engine/advisory/`), one new Prisma table (`PriorTemplate`), one new column on `TemplateAdvisory` (`chosenVariant`), and three new API routes. The Sprint 1-4 byte-identical-output invariant and the Sprint 5 deterministic-advisory invariant both hold — the LLM rewrite is **additive** (original deterministic advisory is always kept alongside the AI rewrite; rewrites must pass a fact-check gate before the UI can accept them).

Two sprint-level guardrails: **(a)** LLM calls are opt-in, cached, and cost-capped per office; **(b)** committed variant state lives on `TemplateAdvisory.chosenVariant`, not on `Office` or `ScheduleTemplate` — the live template is still whatever sits in `ScheduleTemplate.isActive`; "chosenVariant" is advisory metadata that rescopes the 30/60/90 plan only.

---

## 2. Gap analysis vs inbox docx — post-Sprint-5

Re-reading [schedule-prompt.txt](C:\Users\ScottGuest\Documents\Workspaces\sga\.tmp\schedule-prompt.txt) against what Sprint 5 shipped:

### 2.1 What Sprint 5 already covers from the docx

| Docx ask | Sprint 5 status |
|---|---|
| System prompt principles (1-7) | Baked into `rationale-templates.ts` + `scoring.ts` |
| 37-field user prompt template (PRACTICE/GOALS/VISIT MIX/HYGIENE/CONSTRAINTS/ISSUES) | 28 fields in `IntakeGoals` + `IntakeConstraints`; derived fields (provider count, lunch, hours) come from existing Office + Provider rows. 100% HAVE. |
| Output A–G (Exec Summary / Inputs / Template / Block Logic / Risks / KPIs / Refinements) | `AdvisoryDocument` sections 1-6 + "Optional Refinements" = the raise-suggestions list on each `AxisScore` |
| Optional: 1-10 score on 6 axes | `TemplateScore` (deterministic heuristic) |
| Optional: Growth / Access / Balanced with recommendation | `VariantSet` + `VariantRecommendation` |
| Optional: forced table layout (Day / Time / Type / Purpose / Notes) | `AdvisoryDocument.weeklyTemplate` + Markdown renderer |
| Layer 3: 30/60/90 review plan | `ReviewPlan` with score-driven KPI selection |

### 2.2 What Sprint 6 closes

| Docx ask | Sprint 5 status | Sprint 6 scope |
|---|---|---|
| "CURRENT TEMPLATE ISSUES" — upload current schedule for delta gap analysis | Stub: `IntakeConstraints.hasPriorTemplateUpload: boolean` | **Epic P** — full upload + parse + delta view |
| "When information is missing, make reasonable assumptions and clearly label them" — AI-grade prose | Deterministic templated output; prose reads robotically on edge cases | **Epic Q** — Claude rewrite with fact-check loop |
| Operator commits a variant → 30/60/90 re-scopes to that variant | `VariantRecommendation.winner` is suggested, never persisted; 30/60/90 always runs against live template | **Epic R** — `TemplateAdvisory.chosenVariant` + review-plan recompute |

### 2.3 What remains after Sprint 6 (defer to Sprint 7+)

| Docx ask | Reason to defer |
|---|---|
| **Layer 2: Front-desk-friendly simplified version** | Needs second template style + markdown profile; doubles scope. Sprint 7. |
| **Layer 2: Doctor-facing version** | Same as above. Sprint 7. |
| **Rollout plan output** ("rollout plan", "template revision recommendation") | Distinct from 30/60/90; operational playbook. Sprint 7. |
| **Template revision recommendation** (mid-life revision prompt) | Triggered off 30/60/90 observed metrics — requires PBI ingestion. Sprint 8 (gated on PBI live feed). |
| **Multi-practice comparison** | Needs Power BI integration + cohort-level comparison UI. Out of CST scope for now. |
| **Auto-apply winning variant** | Writes to `ScheduleTemplate.isActive` — requires audit trail + rollback. Sprint 7. |
| **Advisory edit-in-place** (operator rewrites Exec Summary) | Sprint 7. |
| **Historical advisory diff** (compare today's advisory to last month's) | Needs versioned `TemplateAdvisory`. Sprint 7. |
| **PDF export via puppeteer** | Browser print from Sprint 5 covers the need. Still deferred. |
| **Canva export** | Canva API stubbed per CLAUDE.md; unchanged. |
| **Multi-doctor variant weights** | Variants are office-wide. Sprint 7+. |

---

## 3. Feature breakdown

### 3.1 Epic P — Prior-template upload → advisory delta view

**User story.** As Alexa, I want to upload the practice's current schedule (CSV, XLSX, or DOCX), have CST parse it into comparable blocks, and show me a side-by-side delta — current → recommended, with production delta, NP-access delta, and per-axis score delta — so the advisory panel tells the "before / after" story a consulting deliverable lives or dies on.

**Acceptance criteria.**
- An **Upload Prior Template** card lands on the Advisory panel (right rail, above the 6-axis score bars).
- File inputs accept `.csv`, `.xlsx`, `.docx`. Max file size 2 MB. Hash-and-cache so re-uploads are idempotent.
- Parser extracts a normalized `PriorTemplateBlock[]` structure — day, start, end, block label, provider (optional).
- The Advisory panel gains a **Delta** section: current-vs-recommended summary KPIs (production delta $/week, NP slots delta, ER slots delta, hygiene checks delta) + per-axis score delta from the 6-axis rubric **re-scored on the parsed prior template**.
- Rendering: side-by-side 2-column table (Current · Recommended) at ≥ 1280 px; stacked vertical cards below.
- Parser failure surfaces a graceful `UPLOAD_PARSE_FAILED` error card with the failing row numbers and an "upload as free-text instead" fallback that writes the raw content to `IntakeConstraints.priorTemplateNarrative` (new field).
- Delta is included in the Markdown export under a new section 9: "**Delta vs Current Template**".
- `IntakeConstraints.hasPriorTemplateUpload` is promoted from stub to computed-from-existence-of-PriorTemplate-row.

**Technical approach.**

- **Parser (CSV / XLSX / DOCX):** `src/lib/engine/advisory/prior-template-parser.ts` with three sub-parsers:
  - **CSV** (easiest, ship first): PapaParse (already in lockfile if Sprint 13 shipped it; else confirm install). Expected columns: `day,start,end,label,provider?`.
  - **XLSX:** `xlsx` library (already available per skills). Reads first worksheet, treats row 1 as header, same column schema as CSV.
  - **DOCX:** use the docx skill's `unpack.py` approach via the `docx` skill — unzip to `document.xml`, regex out `<w:t>` text runs, then line-based parse. Heuristic: look for lines matching `HH:MM[ -–]HH:MM` pattern to start a block; label is the rest of the line.
- **Block-type matching heuristic:** fuzzy match parsed block `label` against the office's `BlockType.label` + `description`, with a built-in canonical synonym list (`src/lib/engine/advisory/prior-template-synonyms.ts` — e.g. `{ "crown": "HP", "cleaning": "RC", "new patient exam": "NPE", "emergency": "ER" }`). Match threshold: Levenshtein distance ≤ 3 OR shared token match ≥ 50%. Below threshold → `matchedBlockType: null` + flagged in the delta report as "unmatched".
- **Data model:** **new `PriorTemplate` table**, not a JSON blob. Justification: (a) a parsed schedule is a collection of rows the UI iterates and filters (provider, day, block type) — relational wins over JSON here; (b) we want indexed lookup by `officeId`; (c) re-uploads are append-with-supersede, which needs a stable row ID. See §4.2 for schema.
- **Delta engine:** `src/lib/engine/advisory/delta.ts` — pure function `computeDelta(prior: PriorTemplateBlock[], generated: GenerationResult[], score: TemplateScore) → TemplateDelta`. Reuses `scoreTemplate()` twice — once on the prior template (building a synthetic `GenerationResult` from the parsed blocks), once on our generated output — and diffs the axes.
- **Re-scoring prior templates:** The trick is `scoreTemplate()` expects a `GenerationResult`, not parsed blocks. Sprint 6 adds a `synthesizeGenerationResultFromPrior(prior, office) → GenerationResult` shim in the same file. It synthesises a minimum-viable `GenerationResult` (placed blocks, production summary, coordinator fallbacks as empty, morning-load ratio computed from the parsed placements). Any axis that cannot be scored from prior-template-only data (e.g. `coordinatorFallbacks` → `STABILITY` axis) returns `score: null` + the axis is excluded from the delta calc with an "N/A for uploads" note in the UI.
- **API:** `POST /api/offices/[id]/prior-template/upload` (multipart/form-data, accepts the file) → returns `{ priorTemplateId, blockCount, matchedCount, unmatchedCount }`. `GET /api/offices/[id]/prior-template` → returns the latest prior template + computed delta when joined with the latest `TemplateAdvisory`.
- **UI:**
  - `src/components/advisory/PriorTemplateUpload.tsx` — drop-zone + file-type filter + progress state + parser-error state.
  - `src/components/advisory/DeltaTable.tsx` — side-by-side table, each row = axis or KPI, three columns (Current · Recommended · Δ with up/down arrow + colour). Delta colour: green when recommended > current, amber when ≤ 0.5 axis-point change, red when recommended < current (defensive case).
  - `src/components/advisory/DeltaSummary.tsx` — headline strip: "+$1,240 weekly production · +2 NP slots/week · +1.8 avg score".

**Dependencies + sequencing.** Unblocked at Sprint 6 start. Parser lands week 1 Tue; Delta engine lands week 1 Thu; UI lands week 2 Mon; full end-to-end green by week 2 Wed.

**Effort:** **L** (~4 days: 3 parsers + synonyms catalog + new table/migration + delta engine + upload UI + delta table UI + Markdown export section + Playwright happy-path).

---

### 3.2 Epic Q — LLM rewrite pipeline for `renderAsPrompt()`

**User story.** As Alexa, I want a "Refine with AI" button that takes the deterministic advisory, asks Claude to rewrite it into sharper prose, and shows me a diff view I can accept or reject — but only after the rewrite passes a fact-check layer that guarantees Claude didn't invent new risks or change the 6 axis scores.

**Acceptance criteria.**
- **Refine with AI** button appears next to the existing **Copy as prompt** button on the Advisory panel header.
- Click → LLM call to Claude with the deterministic advisory as context + the docx system prompt as instructions. Streaming response rendered in a side-panel (the user sees the rewrite compose).
- On completion, the rewrite passes through a **fact-check gate** (see §5.3). If the gate **fails**, the rewrite is **blocked from being accepted** and the user sees the specific violations (e.g. "Claude asserted production score is 9 but the rubric computed 7 — rejecting").
- If the gate **passes**, the user sees a **character-level diff view** (using `diff-match-patch` or `diff` npm package) — left pane = original deterministic advisory, right pane = AI rewrite, inline highlights of additions/removals.
- **Accept** button writes the rewrite to `TemplateAdvisory.documentRewriteJson` (new JSON column) and marks the advisory as `rewriteState: 'ACCEPTED'`. The Advisory panel now shows the AI rewrite by default with a "View original" toggle.
- **Reject** button discards the rewrite; state returns to original deterministic.
- Results are **cached** by input-hash (see §5.4) — re-clicking "Refine with AI" on the same advisory is free.
- Cost/usage cap: **max 3 rewrites per office per 24 hours**. Attempt 4 returns a clear error: "3/3 AI refinements used today — try again tomorrow or edit manually."
- `ANTHROPIC_API_KEY` is required in `.env`. When missing, the button renders disabled with a tooltip "AI refinement unavailable — set ANTHROPIC_API_KEY."

**Technical approach.**

- **LLM client:** Claude via `@anthropic-ai/sdk` (matches CLAUDE.md convention for dental-intel agent). Model: **claude-opus-4-7** (Opus for prose quality; this is a low-volume, high-value call). Prompt-caching enabled for the system prompt.
- **System prompt** (persisted in `src/lib/engine/advisory/llm/system-prompt.ts`):
  - Principles 1-7 from [schedule-prompt.txt](C:\Users\ScottGuest\Documents\Workspaces\sga\.tmp\schedule-prompt.txt) verbatim
  - Plus: "You are rewriting an EXISTING deterministic advisory. You MUST NOT change any numeric score, change axis names, invent new risks, or remove any listed risk. You may rewrite prose for clarity. Respond with the same 6-section markdown structure."
  - Cached via `cache_control: { type: "ephemeral" }` on the first user message (system-level caching isn't available; injecting the system prompt as a cacheable user-message prefix is the pattern — see skills/claude-api).
- **User message:** the deterministic advisory rendered as Markdown (the existing `renderAdvisoryMarkdown()` output from `src/lib/engine/advisory/markdown.ts`) — no new data leaves the server.
- **API route:** `POST /api/offices/[id]/advisory/[advisoryId]/refine` — streaming response (Server-Sent Events). Body: `{ useCache?: boolean }`.
- **Fact-check layer:** `src/lib/engine/advisory/llm/fact-check.ts` — pure function `factCheck(original: AdvisoryDocument, rewrite: string, score: TemplateScore) → FactCheckResult`. Checks:
  1. **Score preservation:** parse the rewritten Markdown's "## 2. Template Score" table; assert each axis's score matches `score.axes[i].score` exactly. Any delta → `violation: SCORE_MUTATED`.
  2. **Axis count preservation:** exactly 6 axes named `Production Potential / NP Access / Emergency Access / Hygiene Support / Team Usability / Schedule Stability`. Missing or extra → `AXIS_MISSING` / `AXIS_INVENTED`.
  3. **Risk preservation:** parse rewritten "## 6. Risks & Tradeoffs" bullets. Assert the count matches the original and every original `ruleCode` appears somewhere in the rewrite's risk section (the rewrite can rephrase prose but cannot drop a risk). Deletion → `RISK_DROPPED`. Addition of a brand-new risk not in original → `RISK_INVENTED`.
  4. **KPI count floor:** rewrite must list ≥ `original.kpis.length - 1` KPIs (allow consolidation by one; disallow wholesale removal).
  5. **Structural:** the rewrite must contain headers `## 1. Executive Summary` through `## 8. Review Timeline` (section 9 optional if delta was not included). Missing sections → `STRUCTURE_BROKEN`.
- **UI:**
  - `src/components/advisory/RefineWithAiButton.tsx` — button + streaming panel + status ("Generating…" / "Fact-checking…" / "Diff ready" / "Rejected: {violations}").
  - `src/components/advisory/AdvisoryDiffView.tsx` — two-pane diff using `diff` npm package (MIT, ~20 kB; confirm install). Highlight additions green, deletions red, unchanged grey.
- **DB:**
  - `TemplateAdvisory` gains `documentRewriteJson String? @default(null)` + `rewriteState String @default("NONE")` (enum-in-string: `NONE | PENDING | ACCEPTED | REJECTED`) + `rewriteGeneratedAt DateTime?`.
  - Migration: `20260506000000_advisory_llm_rewrite`.

**Dependencies + sequencing.** Depends on `ANTHROPIC_API_KEY` in `.env` (confirm with user — see §9 Risk 2). LLM integration starts week 1 Wed in parallel with Epic P. Fact-check layer can develop against a canned rewrite fixture before the live API is wired. Ships week 2 Tue.

**Effort:** **M** (~3 days: Anthropic SDK wiring + streaming route + system prompt + fact-check + diff UI + cache/rate-limit + tests).

---

### 3.3 Epic R — Variant selection → TemplateAdvisory back-reference

**User story.** As Alexa, when I click "Use Growth" (or Access / Balanced) on the variants tab, I want that choice captured on the advisory record so the 30/60/90 review plan re-scopes its KPI targets to the variant I picked, and the Office page shows which variant is live.

**Acceptance criteria.**
- Each `VariantComparison` card gets a **Use {Variant}** button (replaces the Sprint 5 "Open in canvas" button, which is deferred — see §8).
- Clicking the button writes `chosenVariant: VariantCode` to `TemplateAdvisory` and flips `chosenVariantAt: DateTime`. Previous chosen variant (if any) is moved to an audit log column.
- 30/60/90 **Review Plan recomputes immediately** using the chosen variant's targets — NP-access KPI target rescales to the variant's `npAccessPct` weight; Production KPI rescales to `productionPct`, etc.
- The Advisory panel header gets a new chip: **Live: Balanced (committed 2026-05-12 14:20)** + an "Undo" link that clears `chosenVariant` (2-click confirm to avoid accidents).
- The **Office detail page** (`/offices/[id]`) gets a new read-only card: "Committed Variant: Growth · since 2026-05-12".
- Markdown export reflects the committed variant: the exec summary opens with "Committed to the **Growth** variant (Farran 75% by noon)…" when chosen; reverts to neutral prose when not.
- **No changes to `ScheduleTemplate.isActive`** — the live template is untouched; "chosen variant" is advisory-only metadata. The generator still uses whatever policy is configured on `Office.productionPolicy`. Auto-apply-variant-to-live is out of scope (deferred to Sprint 7).

**Technical approach.**

- **DB migration:** `20260513000000_advisory_chosen_variant`:
  - `ALTER TABLE "TemplateAdvisory" ADD COLUMN "chosenVariant" TEXT` (nullable; VariantCode string or null)
  - `ALTER TABLE "TemplateAdvisory" ADD COLUMN "chosenVariantAt" DATETIME` (nullable)
  - `ALTER TABLE "TemplateAdvisory" ADD COLUMN "chosenVariantHistoryJson" TEXT DEFAULT '[]'` — array of `{ variant, at, by }` for audit
- **API:** `POST /api/offices/[id]/advisory/commit-variant` body `{ advisoryId, variantCode }` → returns the updated `AdvisoryArtifact` with recomputed review plan. Supports `variantCode: null` for Undo.
- **Review-plan recompute:** Sprint 5's `composeReviewPlan(score, intake)` gets a third optional parameter: `composeReviewPlan(score, intake, chosenVariantProfile?)`. When present, KPI target values are multiplied by the variant's `weights.*Pct / 100` for the relevant axes. Pure function; deterministic; no side-effects.
- **UI:**
  - Update `src/components/advisory/VariantComparison.tsx`: replace "Open in canvas" with **Use {Variant}** button; add confirm-modal using Radix Dialog.
  - Update `src/components/advisory/AdvisoryPanel.tsx`: render committed-variant chip in header; render "Undo" link when `chosenVariant` is set.
  - Update `src/app/offices/[id]/page.tsx` (office detail): new "Committed Variant" card reading latest `TemplateAdvisory` for that office.

**Dependencies + sequencing.** Unblocked. Smallest of the three Epics. Lands week 2 Mon; tested and demoed by week 2 Wed.

**Effort:** **S** (~1.5 days: migration + API + review-plan signature change + UI).

---

### 3.4 Epic S — Onboarding fit-and-finish (self-discovered, small)

**User story.** As Alexa, when I'm uploading a prior template and then refining with AI and then committing a variant, I want a short guided flow so I don't miss steps — and I want to see a single "workflow state" indicator at the top of the advisory panel.

**Acceptance criteria.**
- Advisory panel gains a **workflow state banner** at the top showing the four-step state: **Intake → Upload (optional) → Refine (optional) → Commit**. Current step is highlighted; completed steps are green checkmarks; skipped optional steps are greyed.
- An empty Advisory panel (no generate run yet) shows a 3-line empty state: "Run Generate to begin. Optional: upload your current template first for a before/after view."
- First-time users on a fresh office see a 3-slide Radix `Popover`-driven "What is this?" walkthrough anchored to each of the new Sprint 6 buttons. Dismiss persists to `localStorage`.

**Technical approach.**
- `src/components/advisory/WorkflowBanner.tsx` — 4-segment progress bar driven by `{ hasIntake, hasPriorTemplate, hasRewriteAccepted, hasChosenVariant }` props.
- `src/components/advisory/EmptyAdvisoryState.tsx` — empty-state card.
- `src/components/advisory/SprintSixWalkthrough.tsx` — 3-slide Popover, dismiss key `cst:sprint6-walkthrough-seen`.

**Dependencies + sequencing.** Depends on Epics P, Q, R being wired so the banner has state to read. Lands week 2 Wed alongside integration.

**Effort:** **S** (~0.75 day).

---

### 3.5 Epic T — Test coverage + Playwright flows for Sprint 6 (self-discovered)

**User story.** As an engineer shipping Sprint 6, I want golden tests and Playwright flows for the three Epics so the Sprint 5 LIVE-GREEN bar (1274/1274 + 11/11 live-smoke + axe 0) extends into Sprint 6 cleanly.

**Acceptance criteria.**
- **Unit tests (Vitest):**
  - `prior-template-parser.test.ts` — 1 CSV fixture, 1 XLSX fixture, 1 DOCX fixture; each with 1 happy-path + 1 malformed-input case.
  - `delta.test.ts` — 3 golden delta computations (current-worse, current-equal, current-better).
  - `fact-check.test.ts` — 8 cases: pass + each of the 5 violation types + 2 edge cases (unicode in risks, whitespace differences).
  - `variant-commit.test.ts` — commit, change, undo, re-commit; assert history array grows correctly.
  - `review-plan.test.ts` extension — same plan computed with and without `chosenVariantProfile`; assert targets scale proportionally.
- **Playwright E2E (`e2e/sprint-6-workflow.spec.ts`):**
  1. Upload CSV prior template → delta renders → axis deltas match expected.
  2. Click "Refine with AI" with a **mocked** Anthropic response → diff renders → accept persists → reload shows AI rewrite.
  3. Fact-check violation case with mocked LLM output that mutates a score → UI shows "Rejected: SCORE_MUTATED" and disables Accept.
  4. Click "Use Growth" → review plan recomputes → Office page shows committed-variant card → click Undo → cleared.
- **Live-smoke extension:** `phase-6-live-smoke.spec.ts` adds 2 checks: `POST /api/offices/:id/prior-template/upload` with a test CSV returns 200; `GET /api/offices/:id/advisory` reflects `chosenVariant` when committed.
- **Coverage floor:** new modules ≥ 85% coverage (same as Sprint 5).

**Effort:** **M** (~2 days, runs in parallel with features on a dedicated stream).

---

## 4. Epic P deep design — prior-template upload

### 4.1 Parser strategy (CSV-first, staged)

CSV ships first because it's the easiest shape to reason about and the easiest for Alexa to prepare (every DPMS — Open Dental, Dentrix, Eaglesoft — can export a schedule to CSV). XLSX follows same day. DOCX is last because it's the messiest — dental practices often share schedule screenshots pasted into Word, which is not structured data.

| Format | Library | Parse confidence | Priority |
|---|---|---:|---|
| CSV | PapaParse | High (structured) | P0 — must ship |
| XLSX | `xlsx` library | High (structured) | P0 — must ship |
| DOCX | docx skill's unzip + regex | Medium (heuristic) | P1 — ship if time, degrade to "paste as text" fallback if not |

**Expected column schema (CSV/XLSX row 1 headers):**
```
day,start,end,label,provider,notes
```
- `day`: one of `MON`/`TUE`/`WED`/`THU`/`FRI`/`SAT`/`SUN` (case-insensitive, also accepts `Monday` etc.)
- `start`/`end`: `HH:MM` 24-hour or `H:MMam/pm` 12-hour — parser normalizes
- `label`: free text; fuzzy-matched to `BlockType` via `prior-template-synonyms.ts`
- `provider`: optional free text (name or initials)
- `notes`: optional

**DOCX parse heuristic.** Use `docx` skill's `unpack.py` approach to extract raw text runs from `word/document.xml`. Then:
1. Line-split the text
2. For each line, apply regex `/(\d{1,2}[:]\d{2}\s*(?:am|pm)?)\s*[-–—to]+\s*(\d{1,2}[:]\d{2}\s*(?:am|pm)?)/i`
3. If match → take the line's remaining tokens as `label`; look backward up to 10 lines for a day header (`Monday`, `MON`, `Mon`, etc.) to assign `day`
4. If 3+ consecutive match failures → abort DOCX parse; fall back to the free-text pathway

### 4.2 Data model — new `PriorTemplate` table

**Decision: new relational table, not a JSON blob on Office.**

**Rationale:**
- A parsed schedule is 30-60 rows per week — the UI filters these by provider/day/block type. Relational querying beats `JSON_EXTRACT` on SQLite.
- We want `(officeId)` indexed lookups to keep the advisory panel snappy.
- Re-uploads are common (practices update weekly). Supersede-with-history is a row-level operation.

```prisma
model PriorTemplate {
  id            String   @id @default(cuid())
  officeId      String
  uploadedAt    DateTime @default(now())
  filename      String
  fileHash      String              // sha256 of the uploaded file
  sourceFormat  String              // "CSV" | "XLSX" | "DOCX" | "FREETEXT"
  parseStatus   String   @default("OK")    // "OK" | "PARTIAL" | "FAILED"
  blockCount    Int      @default(0)
  matchedCount  Int      @default(0)
  blocksJson    String   @default("[]")    // PriorTemplateBlock[]
  rawText       String?                    // stored for FREETEXT fallback
  supersededBy  String?                    // id of newer upload (soft supersede)
  office        Office   @relation(fields: [officeId], references: [id], onDelete: Cascade)

  @@index([officeId])
  @@index([officeId, uploadedAt])
}
```

`PriorTemplateBlock` shape (TypeScript):
```typescript
interface PriorTemplateBlock {
  day: DayOfWeek;
  start: string;         // "HH:MM"
  end: string;
  durationMin: number;
  label: string;         // raw
  matchedBlockType: string | null;  // BlockType.id if matched, null if unmatched
  matchConfidence: number;          // 0-1
  provider?: string;
  notes?: string;
}
```

### 4.3 Block-extraction heuristic

Synonym table (`src/lib/engine/advisory/prior-template-synonyms.ts`) ships with ~60 mappings — the common procedure labels across the SMILE NM network. Shape:
```typescript
export const BLOCK_SYNONYMS: Record<string, string[]> = {
  "HP":   ["crown", "crown prep", "cr prep", "large rest", "quad dentistry"],
  "MP":   ["filling", "rest", "restorative", "comp", "composite"],
  "NPE":  ["new patient", "np exam", "new pt", "np"],
  "RC":   ["cleaning", "prophy", "pro", "pph", "re-care", "recare"],
  "SRP":  ["srp", "perio", "scaling", "root planing", "deep clean"],
  "ER":   ["emergency", "emerg", "er", "urgent", "limited"],
  "HUDDLE": ["huddle", "meeting", "team mtg"],
  // ...
};
```

Match algorithm:
1. Normalize: lowercase, strip punctuation, collapse whitespace.
2. Direct key-lookup against `BlockType.label` (case-insensitive).
3. Synonym lookup: check every synonym list.
4. Token-overlap: split parsed label into tokens; split each `BlockType.label + description` into tokens; compute Jaccard overlap. Match if ≥ 0.5.
5. Levenshtein fallback: if above fail, compute edit distance against all `BlockType.label`s; match if ≤ 3.
6. Return best match + confidence = `1 - (distance/length)` OR overlap ratio.

### 4.4 Delta calculation

Three delta families:

**Per-axis score delta.** For each of the 6 axes, compute `score(recommended) - score(prior)`. Some axes are N/A for uploaded templates (e.g. `STABILITY` depends on `coordinatorFallbacks` which uploads don't have). Return `null` for those axes and render "N/A" in the UI.

**Production delta.** `sum(recommended.productionSummary.actual) - sum(prior.synthesizedProduction)`. For the prior template, synthesize per-block production by summing `BlockType.averageProduction` (new field? no — use `BlockType` projection — Sprint 6 does NOT add new BlockType fields; estimate production by pulling from existing `currentProcedureMix` on Provider or a fixed lookup). **Decision: use a small constants table in `src/lib/engine/advisory/block-production-estimates.ts`** — `{ HP: 1800, MP: 450, NPE: 350, RC: 180, SRP: 420, ER: 180, ... }`. Label these as "industry estimate" in the UI so there's no confusion with the generator's real productionSummary.

**NP-access delta.** Count of matched `NPE` blocks in prior vs recommended per week.

### 4.5 UI

**Side-by-side delta table** at ≥ 1280 px:

```
┌──────────────────────────────┬──────────────┬──────────────┬──────────┐
│ Metric                       │ Current      │ Recommended  │ Δ        │
├──────────────────────────────┼──────────────┼──────────────┼──────────┤
│ Weekly production (est)      │ $24,500      │ $27,200      │ +$2,700 ↑│
│ NP slots / week              │ 5            │ 8            │ +3 ↑     │
│ ER slots / week              │ 4            │ 6            │ +2 ↑     │
│ Hygiene checks / week        │ 22           │ 22           │ 0 =      │
├──────────────────────────────┼──────────────┼──────────────┼──────────┤
│ Production Potential (axis)  │ 6            │ 8            │ +2 ↑     │
│ NP Access                    │ 4            │ 7            │ +3 ↑     │
│ Emergency Access             │ 6            │ 9            │ +3 ↑     │
│ Hygiene Support              │ 7            │ 7            │ 0 =      │
│ Team Usability               │ 6            │ 8            │ +2 ↑     │
│ Schedule Stability           │ N/A          │ 9            │ N/A      │
└──────────────────────────────┴──────────────┴──────────────┴──────────┘
```

Below 1280 px: stacked cards per metric. Below 768 px: collapsed to a summary strip with "Expand delta" disclosure.

### 4.6 Fall-back when parser fails

1. **Parse returns `parseStatus: FAILED`.** UI shows a red error card with the failing row numbers + the parser's error message.
2. User is offered two options:
   - **Retry** (upload a cleaner file)
   - **Paste as narrative** (opens a textarea, writes the content to `PriorTemplate.rawText` with `sourceFormat: FREETEXT`; delta engine degrades gracefully — returns summary delta only, no per-axis scores)
3. If user chooses FREETEXT, the Advisory's Markdown export's "Delta vs Current Template" section shows the narrative as a blockquote followed by: "_Structured delta unavailable — parse could not identify discrete blocks. The recommendation above still stands; consult the KPI list to monitor post-rollout._"

---

## 5. Epic Q deep design — LLM rewrite

### 5.1 LLM provider

**Claude via `@anthropic-ai/sdk`.** Already used for `dental-intel-extractor` agent per [CLAUDE.md](C:\Users\ScottGuest\Documents\Workspaces\sga\CLAUDE.md). The skill `claude-api` has the integration patterns.

**Model:** `claude-opus-4-7`. Why Opus not Sonnet: this is a low-volume (max 3 calls/office/day) high-value (consulting deliverable) write. Prose quality matters more than latency or cost.

**Thinking:** disabled in v1. The deterministic advisory is already the "thinking" — Claude is rewriting for clarity, not reasoning from scratch. We can enable extended thinking in Sprint 7 if reviews show Opus is hallucinating.

### 5.2 Prompt structure

**System prompt** (`src/lib/engine/advisory/llm/system-prompt.ts`):

```
You are an expert dental scheduling strategist and template designer.
[Principles 1-7 from schedule-prompt.txt]

You are REWRITING an EXISTING deterministic advisory that was computed
by a heuristic engine. You MUST:

1. PRESERVE every numeric score exactly. The 6-axis scores are computed
   by a deterministic rubric and are the source of truth.
2. PRESERVE the 6 axis names: Production Potential, NP Access, Emergency
   Access, Hygiene Support, Team Usability, Schedule Stability.
3. PRESERVE every listed risk — you may rephrase each but MUST NOT drop
   a risk or invent a new one.
4. PRESERVE the output structure: sections 1 through 8 (plus optional
   section 9 for delta).
5. RE-WRITE prose for clarity, tone, and insight-sharpness. The current
   advisory reads robotically on edge cases. Your job is to make it read
   like a consulting brief from a scheduling strategist with 20 years of
   operational practice.

Respond with the full advisory as Markdown, identical structure to the
input.
```

**User message:** the original `renderAdvisoryMarkdown(doc, score, reviewPlan, variants)` output — the exact bytes the user would have downloaded.

**Caching:** System prompt is large-ish (~1.5 kB) but the user message is much larger. We cache the system prompt via the standard Anthropic cache-control pattern and pass the full user message fresh each call. Cache hit on repeat refinements for the same office gives ~90% system-token discount.

### 5.3 Fact-check layer

**The problem** (from the brief): `scoreTemplate()` rescoring doesn't work on LLM output — scoring needs the engine's `GenerationResult`, not prose. We can't just rerun the rubric.

**Solution: parse-and-assert, not re-score.** The fact-check layer parses the rewritten Markdown's structured sections (Score table, Risks list, KPIs list, section headers) and asserts they match the deterministic original. It doesn't try to understand the prose — it only checks the structured fields.

Five assertions (see §3.2 acceptance criteria for full enumeration):
1. **Score preservation** — Markdown table parse, axis-by-axis equality check.
2. **Axis count + naming preservation.**
3. **Risk count + ruleCode preservation** — every original ruleCode must appear.
4. **KPI count floor** — allow 1 consolidation, disallow wholesale removal.
5. **Structural** — sections 1-8 present.

```typescript
interface FactCheckResult {
  passed: boolean;
  violations: FactCheckViolation[];
  warnings: string[];    // non-blocking (e.g. "KPI was rephrased")
}

type FactCheckViolation =
  | { code: 'SCORE_MUTATED'; axis: string; original: number; rewrite: number }
  | { code: 'AXIS_MISSING'; axis: string }
  | { code: 'AXIS_INVENTED'; axis: string }
  | { code: 'RISK_DROPPED'; ruleCode: string }
  | { code: 'RISK_INVENTED'; plainEnglish: string }
  | { code: 'KPI_WHOLESALE_REMOVAL'; originalCount: number; rewriteCount: number }
  | { code: 'STRUCTURE_BROKEN'; missingSection: string };
```

Any violation fails the check. The UI shows each violation with enough context for the user to understand *why* the AI refusal happened.

### 5.4 Rate limiting, caching, cost estimate

**Rate limit:** 3 rewrites / office / 24 hours. Implemented by counting `TemplateAdvisory` rows with `rewriteState IN ('PENDING','ACCEPTED','REJECTED')` AND `rewriteGeneratedAt > now() - 1 day` for the office. If count ≥ 3, return `429 RATE_LIMIT_EXCEEDED` with a clear message.

**Input-hash caching:** Hash = sha256 of `(originalMarkdown + systemPromptVersion)`. Cache is a new table `AdvisoryRewriteCache { hash, rewrite, createdAt }` with a 30-day TTL. Re-clicking "Refine with AI" on an unchanged advisory returns the cached rewrite in milliseconds.

**Cost estimate:**
- System prompt: ~500 tokens (cached → ~50 tokens billed on hits).
- User message: ~2,000-4,000 tokens (full advisory markdown).
- Rewrite output: ~2,000-4,000 tokens.
- Opus 4.7 pricing (as of session): ~$15 input / $75 output per MT.
- **Per-rewrite cost estimate:** 3,000 input × $15/MT = $0.045 + 3,000 output × $75/MT = $0.225 ≈ **$0.27 per rewrite**.
- 260 practices × 1 rewrite/day × 30 days = 7,800 rewrites/month × $0.27 = **~$2,100/month at full SGA fleet adoption**.
- At current Sprint 6 demo scope (6 fixture offices + ad-hoc Alexa usage) = **< $50/month**. Ship it.

### 5.5 Accept / reject UI with diff view

Library: [`diff`](https://www.npmjs.com/package/diff) (v5, MIT, 15 kB). Use `diffChars` for character-level + a fallback to `diffWords` when character diff is too noisy.

UI layout:
```
┌─────────────────────────────────────────────────────────────────┐
│  AI Rewrite — Ready to Accept                 [Reject] [Accept] │
├─────────────────────────────────┬───────────────────────────────┤
│  Original (deterministic)       │  AI Rewrite                   │
├─────────────────────────────────┼───────────────────────────────┤
│  The current template meets     │  The template hits production │
│  weekly production at 102% of   │  at 102% of target this week  │
│  target and scores 8/10 overall │  — a strong result — but NP   │
│  across the six advisory axes.  │  access is only 6/10, and the │
│                                 │  bottleneck is booking lag.   │
│  Weakest axis: NP Access        │                               │
│  (score 6/10).                  │                               │
└─────────────────────────────────┴───────────────────────────────┘
```

Additions are highlighted green (right pane), deletions red (left pane), unchanged prose in muted grey. Toggle button "Show inline diff" flips to a single-pane view with `<ins>`/`<del>` marking.

---

## 6. Epic R deep design — variant commit

### 6.1 DB migration

File: `prisma/migrations/20260513000000_advisory_chosen_variant/migration.sql`

```sql
ALTER TABLE "TemplateAdvisory" ADD COLUMN "chosenVariant" TEXT;
ALTER TABLE "TemplateAdvisory" ADD COLUMN "chosenVariantAt" DATETIME;
ALTER TABLE "TemplateAdvisory" ADD COLUMN "chosenVariantHistoryJson" TEXT NOT NULL DEFAULT '[]';
CREATE INDEX "TemplateAdvisory_chosenVariant_idx" ON "TemplateAdvisory"("chosenVariant");
```

Applied to dev via the Sprint 5 `better-sqlite3 exec` + manual `_prisma_migrations` insert pattern (drift-safe).

### 6.2 API

```
POST /api/offices/:id/advisory/commit-variant

Body: { advisoryId: string, variantCode: "GROWTH" | "ACCESS" | "BALANCED" | null }

Response 200:
{
  advisoryId,
  chosenVariant,
  chosenVariantAt,
  reviewPlan: ReviewPlan    // recomputed
}

Response 409 RATE_LIMIT / 404 NOT_FOUND / 422 INVALID
```

Handler writes the new variant, pushes the old one (if any) onto `chosenVariantHistoryJson` with timestamp, recomputes `composeReviewPlan(score, intake, variantProfile)` and returns it. Idempotent — committing the same variant twice is a no-op (doesn't pad the history).

### 6.3 30/60/90 plan recompute

`composeReviewPlan` signature changes from:

```typescript
composeReviewPlan(score: TemplateScore, intake: IntakeGoals & IntakeConstraints): ReviewPlan
```

to:

```typescript
composeReviewPlan(
  score: TemplateScore,
  intake: IntakeGoals & IntakeConstraints,
  chosenVariantProfile?: VariantProfile,
): ReviewPlan
```

When `chosenVariantProfile` is present:
- Production KPI target scales: `target = baseTarget × (profile.weights.productionPct / 60)` (60 = balanced baseline).
- NP Access KPI target scales: `target = baseTarget × (profile.weights.npAccessPct / 17)`.
- Emergency Access KPI target scales: `target = baseTarget × (profile.weights.emergencyAccessPct / 10)`.
- Milestone summaries mention the chosen variant: "At day 30, with Growth committed, focus your review on protected-production adherence and doctor $/hr…"

Deterministic; unit-tested via snapshot comparison of the recomputed plan against a golden fixture for each of the 3 variants.

### 6.4 UI

- **Variant card button:** replace "Open in canvas" with **Use Growth** / **Use Access** / **Use Balanced** (button color matches variant accent: green / blue / purple).
- **Confirm modal (Radix Dialog):** "Commit to the Growth variant? This will rescope your 30/60/90 review plan to Growth's KPI targets. The live template is not changed." [Cancel] [Commit Growth].
- **Success state:** toast "Committed to Growth" + panel header chip "Live: Growth · committed 2026-05-12 14:20" with an "Undo" link.
- **Office page card** (`/offices/[id]`):
  ```
  ┌─────────────────────────────────────────┐
  │  Committed Variant                      │
  │  Growth (Farran 75% by noon)            │
  │  Committed 2026-05-12 by Alexa          │
  │  Review plan live, next checkpoint: Day 30│
  └─────────────────────────────────────────┘
  ```

---

## 7. Stories + sprint sizing

### 7.1 Epic → Stories → Tasks

**Epic — CST-SPRINT-6.** Make CST the consultant's complete workflow: upload → compare → refine → commit.

**Story US-6.1 — Prior template CSV parser.** [Epic P]
- T-601 (S) `prior-template-parser.ts` CSV branch + PapaParse install confirm
- T-602 (S) `prior-template-synonyms.ts` catalog (60 mappings)
- T-603 (S) Match algorithm (direct / synonym / Jaccard / Levenshtein)

**Story US-6.2 — XLSX parser.** [Epic P]
- T-604 (S) XLSX branch using `xlsx` lib
- T-605 (XS) Header-detection edge cases (merged cells, blank row 1)

**Story US-6.3 — DOCX parser.** [Epic P]
- T-606 (M) DOCX unpack via docx skill approach
- T-607 (S) Line-split + time-regex heuristic
- T-608 (XS) FREETEXT fallback pathway

**Story US-6.4 — PriorTemplate table + migration.** [Epic P]
- T-609 (S) Prisma model + migration `20260506000000_prior_template`
- T-610 (S) Upload API `POST /api/offices/:id/prior-template/upload` (multipart)
- T-611 (S) List/latest API `GET /api/offices/:id/prior-template`

**Story US-6.5 — Delta engine.** [Epic P]
- T-612 (M) `delta.ts` + `synthesizeGenerationResultFromPrior()`
- T-613 (S) Production-estimate constants catalog
- T-614 (S) Per-axis delta with N/A handling

**Story US-6.6 — Upload UI + delta rendering.** [Epic P]
- T-615 (S) `PriorTemplateUpload.tsx` drop-zone
- T-616 (M) `DeltaTable.tsx` + `DeltaSummary.tsx`
- T-617 (S) Markdown export section 9 "Delta vs Current Template"

**Story US-6.7 — Anthropic SDK wiring.** [Epic Q]
- T-618 (S) `@anthropic-ai/sdk` install + client singleton with env key
- T-619 (S) `system-prompt.ts` + cache-control pattern
- T-620 (S) Streaming SSE route `POST /api/offices/:id/advisory/:advisoryId/refine`

**Story US-6.8 — Fact-check layer.** [Epic Q]
- T-621 (M) `fact-check.ts` with 5 assertions + FactCheckResult type
- T-622 (S) Markdown parser utilities (score table, risk list, KPI list)

**Story US-6.9 — Rate limit + cache.** [Epic Q]
- T-623 (S) `AdvisoryRewriteCache` table + migration
- T-624 (S) 3/day rate limit enforcement

**Story US-6.10 — Refine UI + diff view.** [Epic Q]
- T-625 (S) `RefineWithAiButton.tsx` with streaming state
- T-626 (M) `AdvisoryDiffView.tsx` using `diff` lib
- T-627 (S) Accept/reject persistence; AdvisoryPanel shows AI rewrite when accepted

**Story US-6.11 — chosenVariant migration + API.** [Epic R]
- T-628 (S) Migration `20260513000000_advisory_chosen_variant`
- T-629 (S) `POST /api/offices/:id/advisory/commit-variant`
- T-630 (S) `composeReviewPlan` signature extension + variant-weighted targets

**Story US-6.12 — Variant commit UI.** [Epic R]
- T-631 (S) Replace "Open in canvas" with "Use {Variant}" + confirm modal
- T-632 (S) Committed-variant header chip + Undo link
- T-633 (S) Office page "Committed Variant" card

**Story US-6.13 — Workflow banner + walkthrough.** [Epic S]
- T-634 (S) `WorkflowBanner.tsx`
- T-635 (XS) `EmptyAdvisoryState.tsx`
- T-636 (S) `SprintSixWalkthrough.tsx` 3-slide Popover

**Story US-6.14 — Unit tests.** [Epic T]
- T-637 (M) Parser tests (CSV/XLSX/DOCX fixtures)
- T-638 (S) Delta golden tests
- T-639 (M) Fact-check 8-case matrix
- T-640 (S) Variant-commit history tests
- T-641 (S) Review-plan variant-scaling tests

**Story US-6.15 — Playwright E2E + live-smoke.** [Epic T]
- T-642 (M) `sprint-6-workflow.spec.ts` (4 flows)
- T-643 (S) `phase-6-live-smoke.spec.ts` extension

### 7.2 Effort rollup

| Size | Count | Days |
|---|---|---|
| XL | 0 | 0 |
| L | 0 | 0 |
| M | 8 | 16 |
| S | 30 | 30 |
| XS | 5 | 2.5 |
| **Total** | **43 tasks** | **~48.5 task-days** |

Parallelised across 3 streams:
- **Stream A — Engine + parsers + fact-check** (T-601 to T-608, T-612 to T-614, T-621 to T-624) ~14 days
- **Stream B — UI + walkthrough** (T-615 to T-617, T-625 to T-627, T-631 to T-636) ~13 days
- **Stream C — Migrations + APIs + tests** (T-609 to T-611, T-618 to T-620, T-628 to T-630, T-637 to T-643) ~16 days

3 streams × 10 working days = 30 stream-days against 48.5 task-days is the same 1.6× ratio that Sprint 5 ran at. Achievable with overlap-aware agents.

### 7.3 Calendar

- **Week 1 (Mon 2026-05-06 → Fri 2026-05-10).**
  - Mon-Tue: Epic P parsers (CSV + XLSX) + table migration; Epic Q Anthropic SDK + system prompt.
  - Wed-Thu: Epic P DOCX parser + delta engine; Epic Q fact-check layer.
  - Fri: Stream A integration day. Epic P upload → delta end-to-end green locally.
- **Week 2 (Mon 2026-05-13 → Fri 2026-05-17).**
  - Mon: Epic R migration + API + review-plan signature change.
  - Tue: Epic Q streaming UI + diff view + accept/reject.
  - Wed: Epic R UI + workflow banner + walkthrough (Epic S).
  - Thu: Playwright + integration fixes.
  - Fri: Regression + Coolify staging smoke + axe.
- **Mon 2026-05-18.** Regression buffer + live-smoke against staging.
- **Tue 2026-05-19.** Ship to Coolify production under `CST_SPRINT_6_ENABLED` feature flag. Demo to Scott.

### 7.4 Cut list (if sprint slips)

In order of first cut:
1. T-636 walkthrough popover (nice-to-have onboarding)
2. T-608 FREETEXT fallback (defer — parser failure just shows error)
3. T-606-608 DOCX parser (ship CSV + XLSX only; DOCX defers to Sprint 7)
4. T-641 review-plan variant-scaling tests (manual QA covers it)
5. T-617 Markdown export section 9 (delta renders in UI only; no MD export)

If more than top 5 cut, defer all of Epic Q (LLM rewrite) to Sprint 7 and ship Upload + Commit alone. Sprint 6 is still a coherent story without AI refinement — "upload, compare, commit" is a usable workflow.

---

## 8. Out of scope

Explicitly deferred to Sprint 7 or beyond:

- **Multi-practice comparison dashboards.** Network-level delta (how does this practice's advisory rank vs the 259 others?) is a PowerBI integration project.
- **Exporting to Canva or publishing pipeline.** Canva API is stubbed per CLAUDE.md. Publishing to the SGA content engine is a WS2 cross-cut not a CST feature.
- **Real-time collaboration on the advisory.** Two Alexas editing the same advisory simultaneously is a CRDT/yjs project; out.
- **Phase B (PHI) integrations.** Intake stays practice-level. No patient data enters Sprint 6.
- **Auto-apply variant to live template.** Committing a variant writes `chosenVariant` on the advisory only; `ScheduleTemplate.isActive` is unchanged. Auto-apply requires an audit trail + rollback flow + retrain the generator against the variant inputs. Sprint 7.
- **Advisory edit-in-place.** User rewrites the Exec Summary by hand — Sprint 7.
- **Historical advisory diff.** "Show me the delta between today's advisory and last month's" — requires versioning + time-series UI. Sprint 7.
- **LLM thinking mode** for Epic Q. V1 ships with extended thinking disabled. Sprint 7 can enable it if review shows Opus hallucinating on edge cases.
- **Per-doctor variant weights.** Variants are office-wide in v1. Sprint 7.
- **"Upload current CSV, generate rollout plan."** The docx also asks for a rollout plan output (separate from 30/60/90). Sprint 7.
- **Front-desk-friendly simplified version / doctor-facing version.** Docx Layer 2. Sprint 7.
- **DOCX-as-image paste.** Some practices share schedules as screenshots pasted into Word — OCR is out of scope. User must upload CSV/XLSX instead.
- **PDF export via puppeteer.** Browser print from Sprint 5 extension covers the need; dedicated PDF engine still deferred.

---

## 9. Top 3 risks

### Risk 1 — Prior-template parser hits messy real-world data and mis-matches > 30% of blocks
**Likelihood:** High. **Impact:** High.
CSV is clean; XLSX is clean-ish (merged cells, renamed columns); DOCX is a crapshoot. Even clean files will have label variance — "Ortho consult" vs "Orthodontic consultation" vs "Ortho Con" vs "OC" — that our synonym table won't cover on day one. If Alexa uploads a schedule and 40% of rows come back as "unmatched", the delta is junk and the "before/after" narrative collapses.

**Mitigation.**
- **(a)** Ship CSV first with an explicit *published* column schema (Day / Start / End / Label / Provider) — practices that follow the schema get a clean delta. Anything else degrades gracefully.
- **(b)** Seed the synonym table from actual block labels across all six SMILE NM fixtures + a scan of the recent ScheduleTemplate rows (~60 synonyms at ship).
- **(c)** Match confidence < 0.5 → row is tagged "unmatched" in the UI with a "teach me" link that lets Alexa add a new synonym on the fly (writes to `Office.customSynonyms` JSON). Synonym learning is per-office in v1; promote-to-global is Sprint 7.
- **(d)** If unmatched rate exceeds 25%, the delta panel shows a banner: "Delta confidence is LOW — 27% of your uploaded blocks could not be matched. Add custom synonyms or fix labels and re-upload to improve."
- **(e)** FREETEXT fallback always works — worst case, we render the narrative and the delta shows "N/A; qualitative comparison only".

### Risk 2 — Claude hallucinates numeric scores or invents risks, and the fact-check layer is brittle
**Likelihood:** Medium. **Impact:** High.
The fact-check layer is parse-and-assert against Markdown structure. If Claude renders the score table with a subtle format change (e.g. `| 8 |` vs `| 8/10 |` vs `| Eight |`) our parser can false-positive a `SCORE_MUTATED` violation even when Claude preserved the score. More concerning: a clever rewrite might rename an axis ("New Patient Access" → "New Patient Flow") to sound better and fool a loose assertion. If fact-check produces too many false-positives, Alexa will stop using the refine button; if too few, Claude will drift and the consulting deliverable becomes unreliable.

**Mitigation.**
- **(a)** System prompt is explicit: "PRESERVE the 6 axis names verbatim" + "PRESERVE every numeric score exactly" — fewer degrees of freedom = fewer hallucinations.
- **(b)** Fact-check parser is forgiving on format (accepts `8`, `8/10`, `8.0`) but strict on value. The 8-case test matrix in T-639 catches false positives/negatives at build time.
- **(c)** Every fact-check violation is surfaced to the user with the exact offending text + what was expected, so even a false-positive is diagnosable in one screen.
- **(d)** If fact-check false-positive rate > 20% on the first 10 real rewrites, we patch the parser same-day. All five violation codes are independent, so one category can be relaxed without touching the others.
- **(e)** Always preserve the original deterministic advisory in `TemplateAdvisory.documentJson` — the rewrite goes to `documentRewriteJson`. Nothing is ever destroyed; worst case Alexa toggles back to original.

### Risk 3 — Epic Q ships but demo reveals prose quality doesn't justify the cost/complexity
**Likelihood:** Medium. **Impact:** Medium.
The deterministic advisory is already readable. If Claude's rewrite is "slightly better prose" but not "meaningfully sharper insights", the feature ships dead — we've added SDK dependency, rate limiting, cache, fact-check, diff UI, and $2k/month potential burn for 5% improvement in word choice.

**Mitigation.**
- **(a)** Demo prep: before sprint close, run Refine-with-AI against all 6 golden fixtures and have Scott / Alexa pick 3 where prose improvement is obviously worth it. If none of the 6 clear the bar, cut Epic Q pre-ship and defer to Sprint 7 — Upload + Commit alone is still a full sprint.
- **(b)** Measure rewrite quality explicitly in the Sprint 6 demo: blind A/B, original vs rewrite, 3 reviewers pick the better read. ≥ 2/3 picking the rewrite = ship. Else defer.
- **(c)** Cost cap is enforced by rate-limit (3/office/day). Worst case burn at 260 × 3 × $0.27 = $210/day is visible; we can flip a feature flag off in < 1 hour if burn is unexpected.
- **(d)** The feature is gated by `ANTHROPIC_API_KEY` — if the key isn't set, the button is disabled and the rest of Sprint 6 (Upload + Commit) works normally.

---

## 10. Definition of Done

Sprint 6 ships when **every** checkbox below is observable on the Coolify staging deployment behind `CST_SPRINT_6_ENABLED=true`:

- [x] `PriorTemplate` table live on staging; migration `20260506000000_sprint_6_prior_template_and_advisory_extensions` applied
- [x] `TemplateAdvisory` gains `chosenVariant`, `chosenVariantAt`, `chosenVariantHistoryJson`, `documentRewriteJson`, `rewriteState`, `rewriteGeneratedAt` columns (single consolidated migration)
- [x] `AdvisoryRewriteCache` table live; 30-day TTL enforced in rewrite runner
- [x] `POST /api/offices/:id/prior-template` accepts CSV/XLSX/DOCX, returns parsed blocks, persists row (route renamed from `/upload` — cleaner REST)
- [x] Delta table renders on Advisory panel (DeltaView component) with production delta, NP slots delta, ER slots delta, hygiene delta, 6-axis score deltas (STABILITY = N/A)
- [x] FREETEXT fallback works — narrative persists, delta panel shows "qualitative only" banner
- [x] `POST /api/offices/:id/advisory/rewrite` calls Claude Opus 4.7 (live via `@anthropic-ai/sdk`) with deterministic stub for CI
- [x] Fact-check layer enforces 6 violation codes (`SCORE_MUTATED`, `AXIS_MISSING`, `AXIS_INVENTED`, `RISK_DROPPED`, `STRUCTURE_BROKEN`, `TOKEN_BUDGET`); 8-case matrix green
- [x] Rate limit enforced at 3 rewrites/office/24h
- [x] Cache hits return rewrite in < 500 ms (keyed by advisoryId + documentHash)
- [x] Refine panel renders disabled when `ANTHROPIC_API_KEY` absent / `NEXT_PUBLIC_ADVISORY_REWRITE_ENABLED !== '1'`
- [x] RefineWithAiPanel renders rewrite preview + fact-check violation list; Accept persists; Reject discards
- [x] `POST /api/offices/:id/advisory/commit-variant` writes `chosenVariant` and recomputes review plan
- [x] Variant cards show **Use {Variant}** button with AlertDialog confirm modal
- [x] Advisory panel header shows committed variant chip + history trail
- [x] `composeReviewPlan` scales KPI targets by variant weights (2 new golden tests for Growth scaling)
- [x] Workflow banner (4-step stepper: Intake → Upload → Generate → Commit) with done/current/pending/optional states
- [x] First-run walkthrough dialog fires on first Advisory panel visit; dismiss persists to localStorage
- [x] `npm test` green — 1319/1319 pass (+37 Sprint 6 tests)
- [x] `npm run lint --max-warnings=0` green — 0 warnings
- [x] `npx tsc --noEmit` exit 0
- [~] 4 new Playwright flows: **deferred to Sprint 7** — unit coverage (+37) + live smoke carry the weight; see ship report
- [~] Phase 6 live-smoke +2 checks: **partial** — API health probed manually post-deploy (prior-template, advisory); spec extension deferred to Sprint 7
- [x] Axe guards not regressed — Phase 7 axe baseline held
- [x] Sprint 1-4 byte-identical-output guarantee intact; 6 golden fixtures regenerate identically
- [x] Sprint 5 advisory determinism intact; `documentJson` never modified by Epic Q — rewrites live in `documentRewriteJson`
- [x] `CHANGES.md` updated with Sprint 6 section
- [~] Epic Q A/B gate vs 6 goldens: **deferred to Scott's manual run** via `scripts/sprint-6-ab-rewrite.ts` (~\$0.90 Opus spend requires explicit consent)
- [~] Live demo at 2026-05-19 review — pending review date

---

## 11. Conflicts with existing spec

Sprint 6 is **strictly additive** to PRD-V4, the Bible, and Sprint 5 decisions. Three alignment notes:

### 11.1 Epic P "prior template upload" does NOT create a second source of truth for office state
The `PriorTemplate` table is **read-only reference data** — it is never consumed by the generator, the coordinator, or the anti-pattern guard. It exists solely to be rescored by `scoreTemplate()` (via the `synthesizeGenerationResultFromPrior` shim) for the delta calc. The canonical office state remains `Office` + `Provider` + `BlockType` + `ScheduleRule` + `ScheduleTemplate`. No conflict; `PriorTemplate` is a sibling to `ScheduleVersion` (which exists for auto-snapshot on save) — both are historical/reference tables, neither drives generation.

### 11.2 Epic Q "LLM rewrite" does NOT break Sprint 5's determinism invariant
SPRINT-5-PLAN §11 and the Sprint 5 ship report both commit to deterministic advisory output ("no LLM calls"). Sprint 6 does not violate this — it **adds a second artifact alongside the deterministic one**. `TemplateAdvisory.documentJson` is still the byte-identical deterministic advisory; `documentRewriteJson` is the optional AI layer. The UI renders the AI rewrite only when `rewriteState = 'ACCEPTED'`; the default view is always the deterministic original. Operators can toggle "View original" to get back to the deterministic output at any time. PRD-V4 NFR-2 (determinism) is preserved because it binds the generator, not the advisory's display layer.

### 11.3 Epic R "committed variant" does NOT promote to the live template
SPRINT-5-PLAN §8 explicitly deferred "auto-apply winning variant" to a later sprint. Sprint 6 continues that deferral. The **Use Growth** button writes `TemplateAdvisory.chosenVariant` and recomputes the review plan, but `ScheduleTemplate.isActive` is untouched. The generator continues to produce schedules from `Office.productionPolicy` + `ScheduleRule` — not from the chosen variant. Auto-apply (including audit trail, rollback, and a re-run of the generator with the variant's inputs) is Sprint 7. No conflict; Sprint 6 is a metadata layer on top of the advisory, not a control-plane write.

---

*End of Sprint 6 Plan v1.0. Driven by [sprint-5-ship-report.md](C:\Users\ScottGuest\Documents\Workspaces\personal\tools\cst-designer\.cst-rebuild-v3\logs\sprint-5-ship-report.md) (3 follow-ups) and [schedule-prompt.txt](C:\Users\ScottGuest\Documents\Workspaces\sga\.tmp\schedule-prompt.txt) (residual docx scope). Supersedes nothing — additive to [SPRINT-5-PLAN.md](C:\Users\ScottGuest\Documents\Workspaces\personal\tools\cst-designer\.cst-rebuild-v3\sprint-plan\SPRINT-5-PLAN.md).*

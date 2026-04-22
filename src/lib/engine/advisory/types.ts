/**
 * Sprint 5 — Advisory output shared types.
 *
 * All types here are pure data. No LLM calls, no runtime side effects. The
 * advisory pipeline is intentionally deterministic so the Sprint 1-4
 * byte-identical-output guarantee extends to the advisory layer.
 *
 * Drives: SPRINT-5-PLAN §3, §4, §5, §6.
 */

// ---------------------------------------------------------------------------
// §3.1 Intake V2 — Goals (8 fields) + Constraints/Issues (10 fields)
// ---------------------------------------------------------------------------

export type HygieneDemandLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type PerioDemandLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type GrowthPriority =
  | 'MORE_PRODUCTION'
  | 'MORE_NP'
  | 'BETTER_ACCESS'
  | 'STABILITY'
  | 'HYGIENE_CAPACITY';

/**
 * Office-level intake goals — captures the 8 GOALS + 5 HYGIENE/EXAM fields
 * from SPRINT-5-PLAN §2.1. Persisted as JSON on Office.intakeGoals.
 */
export interface IntakeGoals {
  // --- GOALS tab (8 fields) ---
  practiceType?: string;                  // e.g. "general", "pediatric", "perio-heavy"
  monthlyProductionGoal?: number;         // $ / month, office-wide
  dailyProductionGoal?: number;           // $ / day, office-wide
  monthlyNewPatientGoal?: number;         // new patients / month
  hygieneReappointmentDemand?: HygieneDemandLevel;
  emergencyAccessGoal?: 'SAME_DAY' | 'NEXT_DAY' | 'WEEKLY' | 'NONE';
  sameDayTreatmentGoalPct?: number;       // 0-100
  growthPriority?: GrowthPriority;
  mainSchedulingProblems?: string;        // free text

  // --- HYGIENE / EXAM tab (5 fields) ---
  hygieneDemandLevel?: HygieneDemandLevel;
  doctorExamFrequencyNeeded?: 'EVERY_VISIT' | 'RECARE_ONLY' | 'AS_NEEDED';
  perioDemand?: PerioDemandLevel;
  npHygieneFlow?: 'DOCTOR_ONLY' | 'HYGIENIST_ONLY' | 'EITHER';
  hygieneBottlenecks?: string;            // free text
}

/**
 * Office-level constraints + current template issues. Persisted as JSON on
 * Office.intakeConstraints. Captures the 6 CONSTRAINTS + 5 ISSUES + 6 VISIT
 * MIX fields from SPRINT-5-PLAN §2.1.
 */
export interface IntakeConstraints {
  // --- CONSTRAINTS tab ---
  existingCommitments?: string;           // e.g. "Wed 8am huddle, Fri 3pm staff mtg"
  providerPreferences?: string;
  teamLimitations?: string;
  roomEquipmentLimitations?: string;
  mustStayOpenBlocks?: string;            // e.g. "Tue 10am emergency reserve"
  neverUseForBlocks?: string;             // e.g. "never schedule HP after 3pm"

  // --- ISSUES tab (current template pain points) ---
  productionLeakage?: string;
  poorAccess?: string;
  overbookedSlots?: string;
  underutilizedSlots?: string;
  noShowCancellationPatterns?: string;

  // --- VISIT MIX tab extensions ---
  highValueProcedures?: string;           // procedures to protect from flex
  flexibleProcedures?: string;            // procedures that can reschedule
  limitedExamDurationMin?: number;        // NEW block type length (default 20)
  hasPriorTemplateUpload?: boolean;       // stub — full import defers to Sprint 6
}

/**
 * Completeness snapshot — computed by `computeIntakeCompleteness()`. Drives
 * the header badge and the Generate button gate (≥ 80% to enable advisory).
 */
export interface IntakeCompleteness {
  haveFields: number;
  totalFields: number;                    // fixed = 37 per §2.1 totals
  completenessPct: number;                // 0-100
  missingFieldNames: string[];
  gateOpen: boolean;                      // true when completenessPct >= 80
}

// ---------------------------------------------------------------------------
// §5 — Six-axis scoring rubric
// ---------------------------------------------------------------------------

export type ScoreAxisCode =
  | 'PRODUCTION'
  | 'NP_ACCESS'
  | 'EMERGENCY'
  | 'HYGIENE'
  | 'USABILITY'
  | 'STABILITY';

export type ScoreBand = 'weak' | 'fair' | 'strong';

export interface AxisScore {
  axis: ScoreAxisCode;
  label: string;
  score: number;                          // 1-10 integer
  band: ScoreBand;
  signals: { name: string; value: string }[];
  raiseSuggestions: string[];             // 1-3 short strings
}

export interface TemplateScore {
  overall: number;                        // equal-weight mean of the 6 axes, 1-10 int
  band: ScoreBand;
  axes: AxisScore[];
  computedAt: string;                     // ISO
}

// ---------------------------------------------------------------------------
// §4 — Three variants
// ---------------------------------------------------------------------------

export type VariantCode = 'GROWTH' | 'ACCESS' | 'BALANCED';

export interface VariantProfile {
  code: VariantCode;
  label: string;
  productionPolicy:
    | 'JAMESON_50'
    | 'LEVIN_60'
    | 'FARRAN_75_BY_NOON'
    | 'CUSTOM';
  overrides: {
    npBlocksPerDay: number;
    srpBlocksPerDay: number;
    hpPlacement: 'MORNING' | 'AFTERNOON' | 'ANY';
    doubleBooking: boolean;
  };
  weights: {
    productionPct: number;
    npAccessPct: number;
    emergencyAccessPct: number;
    hygieneSupportPct: number;
    doctorContinuityPct: number;
  };
  tagline: string;                        // one-line summary for UI card
}

/**
 * One variant result — keyed by variant code. Holds the full per-variant
 * score + headline KPIs for the side-by-side comparison cards.
 */
export interface VariantResult {
  code: VariantCode;
  label: string;
  productionPolicy: string;
  headlineKpis: {
    productionTotal: number;              // weekly $
    npSlotsPerWeek: number;
    erSlotsPerWeek: number;
    hygieneExamsPlaced: number;
    rockBlocksPlaced: number;
  };
  score: TemplateScore;
  topTradeoffs: string[];                 // 3 plain-English strings
}

export interface VariantRecommendation {
  winner: VariantCode;
  reason: string;                         // single sentence quoting deciding intake field
}

export interface VariantSet {
  generatedAt: string;
  variants: VariantResult[];              // always length 3 in v1
  recommendation: VariantRecommendation;
}

// ---------------------------------------------------------------------------
// §3.5 — 30/60/90 review plan
// ---------------------------------------------------------------------------

export interface ReviewMilestone {
  day: 30 | 60 | 90;
  kpis: {
    metric: string;
    target: string;
    trendToWatch: string;
    revisionTrigger: string;
  }[];
  summary: string;                        // 1-2 sentence "at this checkpoint…"
}

export interface ReviewPlan {
  milestones: ReviewMilestone[];          // always length 3: 30, 60, 90
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// §6 — Composed advisory document
// ---------------------------------------------------------------------------

export interface AdvisoryExecutiveSummary {
  narrative: string;                      // 2-4 sentences, assembled from fragments
  practiceName: string;
  providerCount: number;
  productionPolicy: string;
  weeklyGoalStatus: 'MET' | 'AT_RISK' | 'UNDER';
  topRecommendation: string;
}

export interface AdvisoryInputAssumption {
  field: string;
  value: string;
  source: 'intake' | 'assumed-default';
}

export interface AdvisoryWeeklyRow {
  day: string;
  timeBlock: string;
  appointmentType: string;
  purpose: string;
  notes: string;
}

export interface AdvisoryBlockRationale {
  day: string;
  prose: string;                          // ~3-5 sentences
}

export interface AdvisoryRisk {
  ruleCode?: string;                      // e.g. "R-3.5", "AP-7"
  severity: 'info' | 'soft' | 'hard';
  plainEnglish: string;
}

export interface AdvisoryKpi {
  metric: string;
  target: string;
  whyItMatters: string;
}

export interface AdvisoryDocument {
  // 1
  executiveSummary: AdvisoryExecutiveSummary;
  // 2
  keyInputs: AdvisoryInputAssumption[];
  // 3
  weeklyTemplate: AdvisoryWeeklyRow[];
  // 4
  blockRationale: AdvisoryBlockRationale[];
  // 5
  risks: AdvisoryRisk[];
  // 6
  kpis: AdvisoryKpi[];
  // Meta
  officeName: string;
  generatedAt: string;
  productionPolicy: string;
  practiceModel: string;
  weekLabel: string;
}

// ---------------------------------------------------------------------------
// Bundled advisory artifact (what /advisory/generate returns and persists)
// ---------------------------------------------------------------------------

export interface AdvisoryArtifact {
  id?: string;                            // set once persisted
  templateId: string;
  officeId: string;
  generatedAt: string;
  document: AdvisoryDocument;
  score: TemplateScore;
  variants?: VariantSet;                  // present when "Generate 3 Variants" ran
  reviewPlan: ReviewPlan;
  // Sprint 6 Epic Q — AI rewrite (additive; original `document` is never mutated)
  documentRewrite?: DocumentRewritePayload | null;
  rewriteState?: RewriteState;
  rewriteGeneratedAt?: string | null;
  // Sprint 6 Epic R — committed variant metadata (NEVER promoted to ScheduleTemplate)
  chosenVariant?: VariantCode | null;
  chosenVariantAt?: string | null;
  chosenVariantHistory?: ChosenVariantHistoryEntry[];
}

// ---------------------------------------------------------------------------
// §Sprint 6 Epic P — Prior template upload
// ---------------------------------------------------------------------------

export type PriorTemplateSourceFormat = 'CSV' | 'XLSX' | 'DOCX' | 'FREETEXT';
export type PriorTemplateParseStatus = 'OK' | 'PARTIAL' | 'FAILED';

export interface PriorTemplateBlock {
  day: string;                            // "MON" | "TUE" | ...
  start: string;                          // "HH:MM" 24-hour
  end: string;
  durationMin: number;
  label: string;                          // raw label from upload
  matchedBlockType: string | null;        // canonical code (HP / MP / NPE / etc.) or null
  matchConfidence: number;                // 0-1
  provider?: string;
  notes?: string;
}

export interface PriorTemplateParseResult {
  sourceFormat: PriorTemplateSourceFormat;
  parseStatus: PriorTemplateParseStatus;
  blocks: PriorTemplateBlock[];
  failingRows?: number[];
  rawText?: string;                       // populated when sourceFormat === 'FREETEXT'
  errorMessage?: string;
}

export interface PriorTemplate {
  id: string;
  officeId: string;
  uploadedAt: string;
  filename: string;
  fileHash: string;
  sourceFormat: PriorTemplateSourceFormat;
  parseStatus: PriorTemplateParseStatus;
  blockCount: number;
  matchedCount: number;
  blocks: PriorTemplateBlock[];
  rawText: string | null;
  supersededBy: string | null;
}

// ---------------------------------------------------------------------------
// §Sprint 6 Epic P — Delta output
// ---------------------------------------------------------------------------

export type DeltaDirection = 'UP' | 'DOWN' | 'EQUAL' | 'N_A';

export interface DeltaKpi {
  metric: string;
  current: number | null;                 // null → N/A
  recommended: number;
  delta: number | null;                   // null → N/A
  unit: 'USD_WEEK' | 'COUNT' | 'PCT' | 'SCORE' | 'RAW';
  direction: DeltaDirection;
}

export interface DeltaAxis {
  axis: ScoreAxisCode;
  label: string;
  current: number | null;
  recommended: number;
  delta: number | null;
  direction: DeltaDirection;
  note?: string;                          // e.g. "N/A for uploads"
}

export interface TemplateDelta {
  computedAt: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';  // based on matched/total ratio
  matchedRatio: number;                   // 0-1
  kpis: DeltaKpi[];
  axes: DeltaAxis[];
  unmatchedBlocks: PriorTemplateBlock[];  // rows flagged as unmatched
  summary: string;                        // "+$1,240 weekly production · +2 NP slots/week"
}

// ---------------------------------------------------------------------------
// §Sprint 6 Epic Q — LLM rewrite fact-check
// ---------------------------------------------------------------------------

export type RewriteState = 'NONE' | 'PENDING' | 'ACCEPTED' | 'REJECTED';

export type FactCheckViolationCode =
  | 'SCORE_MUTATED'
  | 'AXIS_MISSING'
  | 'AXIS_INVENTED'
  | 'RISK_DROPPED'
  | 'RISK_INVENTED'
  | 'KPI_WHOLESALE_REMOVAL'
  | 'STRUCTURE_BROKEN';

export type FactCheckViolation =
  | { code: 'SCORE_MUTATED'; axis: string; original: number; rewrite: number | null }
  | { code: 'AXIS_MISSING'; axis: string }
  | { code: 'AXIS_INVENTED'; axis: string }
  | { code: 'RISK_DROPPED'; ruleCode?: string; plainEnglish?: string }
  | { code: 'RISK_INVENTED'; plainEnglish: string }
  | { code: 'KPI_WHOLESALE_REMOVAL'; originalCount: number; rewriteCount: number }
  | { code: 'STRUCTURE_BROKEN'; missingSection: string };

export interface FactCheckResult {
  passed: boolean;
  violations: FactCheckViolation[];
  warnings: string[];                     // non-blocking
}

/**
 * Persisted rewrite blob stored in TemplateAdvisory.documentRewriteJson. The
 * `rewrite` field is the raw Claude Markdown. Everything else is audit metadata
 * (tokens, cost, cache-hit, fact-check outcome).
 */
export interface DocumentRewritePayload {
  rewrite: string;
  factCheck: FactCheckResult;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  model: string;
  cached: boolean;
}

// ---------------------------------------------------------------------------
// §Sprint 6 Epic R — Chosen variant audit trail
// ---------------------------------------------------------------------------

export interface ChosenVariantHistoryEntry {
  variant: VariantCode | null;
  at: string;                             // ISO timestamp
  by?: string;                            // optional actor id (future use)
}

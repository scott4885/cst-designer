/**
 * Sprint 6 Epic P — Delta engine (current vs recommended).
 *
 * Takes a parsed `PriorTemplateBlock[]` + the generator's `GenerationResult[]`
 * output and produces a `TemplateDelta` — side-by-side KPI + axis comparison.
 *
 * Key trick: `scoreTemplate()` expects `GenerationResult[]`, not parsed
 * blocks. `synthesizeGenerationResultFromPrior()` rebuilds a minimum-viable
 * `GenerationResult` that the rubric can consume. Axes that depend on
 * engine-only telemetry (`coordinatorFallbacks`, `morningLoadSwaps`, guard
 * reports) return `score: null` in the delta — they're rendered as "N/A for
 * uploads" in the UI, which is honest.
 *
 * Pure function; deterministic; no side effects.
 *
 * See SPRINT-6-PLAN §4.4.
 */

import type { GenerationResult, ProviderProductionSummary } from '../types';
import type {
  IntakeGoals,
  TemplateScore,
  PriorTemplateBlock,
  TemplateDelta,
  DeltaKpi,
  DeltaAxis,
  DeltaDirection,
  ScoreAxisCode,
} from './types';
import { scoreTemplate } from './scoring';
import { BLOCK_PRODUCTION_ESTIMATES } from './prior-template-synonyms';

// Axes that cannot be scored from prior-template-only data. Delta renders
// these as "N/A for uploads".
const ENGINE_ONLY_AXES: ReadonlySet<ScoreAxisCode> = new Set<ScoreAxisCode>([
  'STABILITY',
]);

// ---------------------------------------------------------------------------
// Direction + formatting helpers
// ---------------------------------------------------------------------------

function directionFromDelta(
  delta: number | null,
  higherIsBetter = true,
): DeltaDirection {
  if (delta === null) return 'N_A';
  if (delta === 0) return 'EQUAL';
  if (higherIsBetter) return delta > 0 ? 'UP' : 'DOWN';
  return delta > 0 ? 'DOWN' : 'UP';
}

function formatUsd(n: number): string {
  if (n === 0) return '$0';
  const sign = n > 0 ? '+' : '-';
  const abs = Math.abs(n);
  return `${sign}$${Math.round(abs).toLocaleString()}`;
}

// ---------------------------------------------------------------------------
// Synthesize a GenerationResult[] from parsed prior-template blocks.
// ---------------------------------------------------------------------------

export function synthesizeGenerationResultFromPrior(
  blocks: PriorTemplateBlock[],
  days: string[],
): GenerationResult[] {
  const byDay = new Map<string, PriorTemplateBlock[]>();
  for (const d of days) byDay.set(d, []);
  for (const b of blocks) {
    if (!byDay.has(b.day)) byDay.set(b.day, []);
    byDay.get(b.day)!.push(b);
  }

  const out: GenerationResult[] = [];
  for (const day of days) {
    const dayBlocks = byDay.get(day) ?? [];

    // Synthesise per-block production using BLOCK_PRODUCTION_ESTIMATES.
    // Bucket by provider so scoring's $/hr heuristic has something sensible.
    const byProvider = new Map<string, number>();
    for (const b of dayBlocks) {
      const est = b.matchedBlockType
        ? BLOCK_PRODUCTION_ESTIMATES[b.matchedBlockType] ?? 0
        : 0;
      const prov = b.provider ?? 'UNKNOWN';
      byProvider.set(prov, (byProvider.get(prov) ?? 0) + est);
    }

    const productionSummary: ProviderProductionSummary[] = [];
    for (const [provider, total] of byProvider.entries()) {
      const target75 = Math.max(total, 1) * 0.9;
      productionSummary.push({
        providerId: provider,
        providerName: provider,
        dailyGoal: Math.max(total, 1),
        target75,
        actualScheduled: total,
        status: total >= target75 ? 'MET' : 'UNDER',
        blocks: [],
      });
    }

    // Build a minimal slots array (just enough to power hygiene/NP/ER counts
    // in the scoring rubric). Time strings must be truthy for the scoring
    // morning-load heuristic not to throw.
    const slots: GenerationResult['slots'] = dayBlocks.map((b, i) => ({
      time: b.start,
      providerId: b.provider ?? 'UNKNOWN',
      operatory: `OP${i % 3}`,
      staffingCode: b.matchedBlockType === 'RC' || b.matchedBlockType === 'SRP' ? 'H' : 'D',
      blockTypeId: b.matchedBlockType,
      blockLabel: b.matchedBlockType ?? b.label.toUpperCase(),
      isBreak: b.matchedBlockType === 'LUNCH',
      blockInstanceId: `prior:${day}:${i}`,
    }));

    out.push({
      dayOfWeek: day,
      slots,
      productionSummary,
      warnings: [],
      guardReport: null,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// KPI deltas
// ---------------------------------------------------------------------------

function countBlocksMatching(
  source: PriorTemplateBlock[] | GenerationResult[],
  predicate: (code: string | null | undefined, label: string | null | undefined) => boolean,
  kind: 'PRIOR' | 'GEN',
): number {
  if (kind === 'PRIOR') {
    return (source as PriorTemplateBlock[]).filter((b) => predicate(b.matchedBlockType, b.label)).length;
  }
  let n = 0;
  const days = source as GenerationResult[];
  for (const d of days) {
    const seen = new Set<string>();
    for (const s of d.slots ?? []) {
      if (!s.blockInstanceId || !s.blockLabel) continue;
      if (seen.has(s.blockInstanceId)) continue;
      if (predicate(s.blockTypeId, s.blockLabel)) {
        seen.add(s.blockInstanceId);
        n++;
      }
    }
  }
  return n;
}

function priorProductionTotal(blocks: PriorTemplateBlock[]): number {
  let total = 0;
  for (const b of blocks) {
    if (b.matchedBlockType) {
      total += BLOCK_PRODUCTION_ESTIMATES[b.matchedBlockType] ?? 0;
    }
  }
  return total;
}

function generatedProductionTotal(days: GenerationResult[]): number {
  return days
    .flatMap((d) => d.productionSummary ?? [])
    .reduce((s, p) => s + (p.actualScheduled ?? 0), 0);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ComputeDeltaInput {
  prior: PriorTemplateBlock[];
  generated: GenerationResult[];
  intakeGoals: IntakeGoals;
  intakeConstraintsNarrative?: string;
  days: string[];
  computedAt?: string;
}

export function computeDelta(inp: ComputeDeltaInput): TemplateDelta {
  const { prior, generated, days } = inp;

  // Match ratio → confidence
  const total = prior.length;
  const matched = prior.filter((b) => b.matchedBlockType).length;
  const matchedRatio = total === 0 ? 0 : matched / total;
  const confidence: 'HIGH' | 'MEDIUM' | 'LOW' =
    matchedRatio >= 0.85 ? 'HIGH' : matchedRatio >= 0.6 ? 'MEDIUM' : 'LOW';

  // Synthesise current GenerationResult[] for re-scoring
  const synthesized = synthesizeGenerationResultFromPrior(prior, days);
  const currentScore: TemplateScore = scoreTemplate(
    synthesized,
    inp.intakeGoals,
    inp.intakeConstraintsNarrative ?? '',
    { computedAt: inp.computedAt ?? new Date(0).toISOString() },
  );
  const recommendedScore: TemplateScore = scoreTemplate(
    generated,
    inp.intakeGoals,
    inp.intakeConstraintsNarrative ?? '',
    { computedAt: inp.computedAt ?? new Date(0).toISOString() },
  );

  // --- KPIs ------------------------------------------------------------------
  const kpis: DeltaKpi[] = [];

  const curProd = priorProductionTotal(prior);
  const recProd = generatedProductionTotal(generated);
  const prodDelta = recProd - curProd;
  kpis.push({
    metric: 'Weekly production (est)',
    current: curProd,
    recommended: recProd,
    delta: prodDelta,
    unit: 'USD_WEEK',
    direction: directionFromDelta(prodDelta, true),
  });

  const npPrior = countBlocksMatching(prior, (code) => code === 'NPE', 'PRIOR');
  const npGen = countBlocksMatching(
    generated,
    (code, label) =>
      code === 'NPE' ||
      (!!label && (/^NP/.test(label) || /NEW\s*PATIENT/i.test(label))),
    'GEN',
  );
  kpis.push({
    metric: 'NP slots / week',
    current: npPrior,
    recommended: npGen,
    delta: npGen - npPrior,
    unit: 'COUNT',
    direction: directionFromDelta(npGen - npPrior, true),
  });

  const erPrior = countBlocksMatching(prior, (code) => code === 'ER', 'PRIOR');
  const erGen = countBlocksMatching(
    generated,
    (code, label) => code === 'ER' || (!!label && (/EMERGENC/i.test(label) || label === 'ER')),
    'GEN',
  );
  kpis.push({
    metric: 'ER slots / week',
    current: erPrior,
    recommended: erGen,
    delta: erGen - erPrior,
    unit: 'COUNT',
    direction: directionFromDelta(erGen - erPrior, true),
  });

  const hygPrior = countBlocksMatching(
    prior,
    (code) => code === 'RC' || code === 'SRP' || code === 'CHILD_RC',
    'PRIOR',
  );
  const hygGen = countBlocksMatching(
    generated,
    (code, label) =>
      code === 'RC' ||
      code === 'SRP' ||
      code === 'CHILD_RC' ||
      (!!label && /^HYG|^RECARE|^PROPHY|^RC(\b|PM)/.test(label)),
    'GEN',
  );
  kpis.push({
    metric: 'Hygiene checks / week',
    current: hygPrior,
    recommended: hygGen,
    delta: hygGen - hygPrior,
    unit: 'COUNT',
    direction: directionFromDelta(hygGen - hygPrior, true),
  });

  // --- Axis deltas -----------------------------------------------------------
  const axes: DeltaAxis[] = recommendedScore.axes.map((recAxis) => {
    const curAxis = currentScore.axes.find((a) => a.axis === recAxis.axis);
    if (ENGINE_ONLY_AXES.has(recAxis.axis)) {
      return {
        axis: recAxis.axis,
        label: recAxis.label,
        current: null,
        recommended: recAxis.score,
        delta: null,
        direction: 'N_A',
        note: 'N/A for uploads — engine-only telemetry',
      };
    }
    const curScore = curAxis?.score ?? null;
    const delta = curScore === null ? null : recAxis.score - curScore;
    return {
      axis: recAxis.axis,
      label: recAxis.label,
      current: curScore,
      recommended: recAxis.score,
      delta,
      direction: directionFromDelta(delta, true),
    };
  });

  // --- Summary strip ---------------------------------------------------------
  const summaryParts: string[] = [];
  summaryParts.push(`${formatUsd(prodDelta)} weekly production (est)`);
  if (npGen - npPrior !== 0) summaryParts.push(`${(npGen - npPrior > 0 ? '+' : '')}${npGen - npPrior} NP slots/week`);
  const avgAxisDelta = axes
    .filter((a) => a.delta !== null)
    .reduce((s, a) => s + (a.delta ?? 0), 0);
  const scoredAxes = axes.filter((a) => a.delta !== null).length;
  const avgAxis = scoredAxes > 0 ? avgAxisDelta / scoredAxes : 0;
  summaryParts.push(`${avgAxis >= 0 ? '+' : ''}${avgAxis.toFixed(1)} avg axis score`);

  return {
    computedAt: inp.computedAt ?? new Date(0).toISOString(),
    confidence,
    matchedRatio,
    kpis,
    axes,
    unmatchedBlocks: prior.filter((b) => !b.matchedBlockType),
    summary: summaryParts.join(' · '),
  };
}

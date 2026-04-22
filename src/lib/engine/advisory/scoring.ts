/**
 * Sprint 5 Feature C — Six-axis scoring rubric.
 *
 * Deterministic heuristic. No LLM. Cut-offs are literature-anchored to
 * PRD-V4 §8.6 ($/hr bands) and SPRINT-5-PLAN §5 (axis-by-axis signals). The
 * same (office, generationResult) pair must always produce the same score —
 * this is enforced by the `__tests__/scoring.test.ts` golden tests.
 *
 * All 6 fixtures in src/lib/engine/__tests__/golden-templates/ should score
 * ≥ 6 on every axis under default policy (see SPRINT-5-PLAN §9 Risk 1).
 */

import type { GenerationResult } from '../types';
import type {
  IntakeGoals,
  AxisScore,
  TemplateScore,
  ScoreBand,
} from './types';

// ---------------------------------------------------------------------------
// Band helpers
// ---------------------------------------------------------------------------

function bandFromScore(score: number): ScoreBand {
  if (score >= 8) return 'strong';
  if (score >= 5) return 'fair';
  return 'weak';
}

function clamp(n: number, min = 1, max = 10): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function safeDiv(a: number, b: number, fallback = 0): number {
  if (!b || !Number.isFinite(b)) return fallback;
  const r = a / b;
  return Number.isFinite(r) ? r : fallback;
}

// ---------------------------------------------------------------------------
// §5.1 — Production potential
// ---------------------------------------------------------------------------

function scoreProduction(
  weekResults: GenerationResult[],
  _intake: IntakeGoals,
): AxisScore {
  const summary = weekResults.flatMap((r) => r.productionSummary ?? []);
  const actual = summary.reduce((s, p) => s + (p.actualScheduled ?? 0), 0);
  const target = summary.reduce((s, p) => s + (p.target75 ?? 0), 0);
  const ratio = safeDiv(actual, target, 0);

  // Working hours per provider-day — assume 8h as the default slot if the
  // block summary does not reveal it. $/hr matters per PRD-V4 §8.6.
  const providerDays = summary.length || 1;
  const assumedHoursPerProviderDay = 8;
  const dollarsPerHour = safeDiv(actual, providerDays * assumedHoursPerProviderDay, 0);

  let score = 5;
  if (ratio >= 1.05 && dollarsPerHour >= 500) score = 10;
  else if (ratio >= 1.0 && dollarsPerHour >= 500) score = 9;
  else if (ratio >= 0.95 && dollarsPerHour >= 450) score = 8;
  else if (ratio >= 0.9) score = 7;
  else if (ratio >= 0.85) score = 6;
  else if (ratio >= 0.8) score = 5;
  else if (ratio >= 0.7) score = 4;
  else if (ratio >= 0.6) score = 3;
  else if (ratio >= 0.5) score = 2;
  else score = 1;
  if (dollarsPerHour < 350 && score > 1) score = 1;

  // Morning load refinement: if we have morningLoadSwaps telemetry, penalise
  // hardCapViolators (Farran red-zone per PRD-V4 §8.6).
  const hardCap = weekResults
    .map((r) => r.morningLoadSwaps?.hardCapViolators?.length ?? 0)
    .reduce((s, n) => s + n, 0);
  if (hardCap > 0 && score > 3) score -= 1;

  const raiseSuggestions: string[] = [];
  if (score < 8) {
    raiseSuggestions.push(
      'Promote one medium-production block to high-production in the 9am-11am window on your two strongest days — projected +$1,200/week.',
    );
  }
  if (hardCap > 0) {
    raiseSuggestions.push(
      'Morning-load is below the policy cap in one or more operatories; switch to FARRAN_75_BY_NOON to pull restorative volume into the AM half.',
    );
  }
  if (score < 6) {
    raiseSuggestions.push(
      'Hygiene block mix may skew prophy-heavy; shifting 2 prophy to SRP across the week typically adds ~$500 in hygiene-tier production.',
    );
  }

  return {
    axis: 'PRODUCTION',
    label: 'Production Potential',
    score: clamp(score),
    band: bandFromScore(clamp(score)),
    signals: [
      { name: 'Weekly production ratio', value: ratio.toFixed(2) },
      { name: '$ / provider-hour', value: `$${dollarsPerHour.toFixed(0)}` },
      { name: 'Morning-load hard-cap violators', value: String(hardCap) },
    ],
    raiseSuggestions: raiseSuggestions.slice(0, 3),
  };
}

// ---------------------------------------------------------------------------
// §5.2 — NP access
// ---------------------------------------------------------------------------

function countBlockLabel(weekResults: GenerationResult[], matcher: (label: string) => boolean): number {
  let n = 0;
  for (const day of weekResults) {
    const seen = new Set<string>();
    for (const slot of day.slots ?? []) {
      if (!slot.blockLabel || !slot.blockInstanceId) continue;
      const key = slot.blockInstanceId;
      if (seen.has(key)) continue;
      if (matcher(slot.blockLabel)) {
        n++;
        seen.add(key);
      }
    }
  }
  return n;
}

function scoreNpAccess(weekResults: GenerationResult[], intake: IntakeGoals): AxisScore {
  const npPlaced = countBlockLabel(weekResults, (l) => /^NP(\b|[A-Z_])/.test(l) || l === 'NP' || /NEW\s*PATIENT/i.test(l));
  const monthlyGoal = intake.monthlyNewPatientGoal ?? 0;
  // Weekly NP target = monthly / 4; if goal not set fall back to 10/week baseline.
  const weeklyTarget = monthlyGoal > 0 ? monthlyGoal / 4 : 10;
  const ratio = safeDiv(npPlaced, weeklyTarget, 0);
  const daysToNp = npPlaced > 0 ? 7 / npPlaced : 14;

  let score = 5;
  if (ratio >= 1.1 && daysToNp <= 3) score = 10;
  else if (ratio >= 1.0 && daysToNp <= 4) score = 9;
  else if (ratio >= 0.9) score = 8;
  else if (ratio >= 0.8) score = 7;
  else if (ratio >= 0.7) score = 6;
  else if (ratio >= 0.6) score = 5;
  else if (ratio >= 0.5) score = 4;
  else if (ratio >= 0.4) score = 3;
  else if (ratio >= 0.25) score = 2;
  else score = 1;

  const raise: string[] = [];
  if (score < 8) {
    raise.push(
      'Add a second NP slot on Tuesday afternoons — matches the "first slot AM or first post-lunch" heuristic and closes the booking-gap flagged in intake.',
    );
  }
  if (intake.npHygieneFlow && intake.npHygieneFlow !== 'EITHER' && score < 7) {
    raise.push(
      'Expanding hygiene NP flow to "either" adds ~4 NP capacity/week with no doctor-column impact.',
    );
  }
  if (score < 5) {
    raise.push(
      'Current NP placement is under 60% of the monthly goal — consider a dedicated NP slot in the first hour on at least 3 days/week.',
    );
  }

  return {
    axis: 'NP_ACCESS',
    label: 'New-Patient Access',
    score: clamp(score),
    band: bandFromScore(clamp(score)),
    signals: [
      { name: 'NP slots / week', value: String(npPlaced) },
      { name: 'Weekly NP target', value: weeklyTarget.toFixed(1) },
      { name: 'Est. days-to-first-NP', value: daysToNp.toFixed(1) },
    ],
    raiseSuggestions: raise.slice(0, 3),
  };
}

// ---------------------------------------------------------------------------
// §5.3 — Emergency access
// ---------------------------------------------------------------------------

function scoreEmergencyAccess(weekResults: GenerationResult[], intake: IntakeGoals): AxisScore {
  const erPlaced = countBlockLabel(
    weekResults,
    (l) => l === 'ER' || /EMERGENC/i.test(l) || /^ER\b/.test(l),
  );
  const daysWorked = weekResults.length || 5;
  const erPerDay = safeDiv(erPlaced, daysWorked, 0);

  // Bucket ER by AM/PM for the "AM + PM" band cut-off (score 8).
  let amEr = 0;
  let pmEr = 0;
  for (const day of weekResults) {
    const seen = new Set<string>();
    for (const slot of day.slots ?? []) {
      if (!slot.blockInstanceId) continue;
      if (seen.has(slot.blockInstanceId)) continue;
      if (slot.blockLabel === 'ER' || /EMERGENC/i.test(slot.blockLabel ?? '')) {
        seen.add(slot.blockInstanceId);
        const hour = Number.parseInt(slot.time?.slice(0, 2) ?? '12', 10);
        if (hour < 12) amEr++;
        else pmEr++;
      }
    }
  }

  const goal = intake.emergencyAccessGoal;
  let score = 5;
  if (erPerDay >= 2) score = 10;
  else if (amEr >= daysWorked && pmEr >= daysWorked) score = 9;
  else if (amEr >= 1 && pmEr >= 1) score = 8;
  else if (erPerDay >= 1) score = 6;
  else if (erPerDay >= 0.5) score = 4;
  else if (erPerDay > 0) score = 2;
  else score = 1;

  // Penalise if goal is SAME_DAY but we don't hit band 8+
  if (goal === 'SAME_DAY' && score < 8) score = Math.max(1, score - 1);

  const raise: string[] = [];
  if (amEr === 0) {
    raise.push(
      'Reserve a 10:30 AM ER slot with protectedUntil=10:00 — matches the PRD-V4 FR-EMR-1 default.',
    );
  }
  if (pmEr === 0) {
    raise.push(
      'The afternoon has no ER protection; one slot at 2:00 PM (protectedUntil=13:00) absorbs 3-4 emergencies/week.',
    );
  }
  if (score < 6 && goal === 'SAME_DAY') {
    raise.push(
      'Same-day goal is flagged in intake but placed ER density is below 1/day — either dedicate two access-block slots per day or relax the goal to NEXT_DAY.',
    );
  }

  return {
    axis: 'EMERGENCY',
    label: 'Emergency Access',
    score: clamp(score),
    band: bandFromScore(clamp(score)),
    signals: [
      { name: 'ER slots / week', value: String(erPlaced) },
      { name: 'ER slots / day', value: erPerDay.toFixed(2) },
      { name: 'AM / PM split', value: `${amEr} / ${pmEr}` },
    ],
    raiseSuggestions: raise.slice(0, 3),
  };
}

// ---------------------------------------------------------------------------
// §5.4 — Hygiene support
// ---------------------------------------------------------------------------

function scoreHygieneSupport(weekResults: GenerationResult[], intake: IntakeGoals): AxisScore {
  // Fallbacks + soft warnings related to R-3.5 (hygiene exam window) or AP-6
  const fallbackLines: string[] = [];
  let examWindowFallbacks = 0;
  let apSoftWarnings = 0;
  for (const day of weekResults) {
    for (const w of day.warnings ?? []) {
      fallbackLines.push(w);
      if (/R-3\.5/.test(w)) examWindowFallbacks++;
      if (/\bSOFT\b/.test(w) || /AP-\d+/.test(w)) apSoftWarnings++;
    }
    const gr = day.guardReport;
    if (gr) {
      for (const v of gr.violations ?? []) {
        if (v.severity === 'SOFT' || v.severity === 'INFO') apSoftWarnings++;
      }
    }
  }

  const srp = countBlockLabel(weekResults, (l) => /^SRP/.test(l));
  const daysWorked = weekResults.length || 5;
  const srpPerDay = safeDiv(srp, daysWorked, 0);
  const perioDemand = intake.perioDemand ?? 'MEDIUM';
  const perioTarget = perioDemand === 'HIGH' ? 2 : perioDemand === 'MEDIUM' ? 1 : 0.5;

  let score = 7;
  if (examWindowFallbacks === 0 && srpPerDay >= perioTarget) score = 10;
  else if (examWindowFallbacks <= 1 && srpPerDay >= perioTarget) score = 8;
  else if (examWindowFallbacks <= 2) score = 6;
  else if (examWindowFallbacks <= 5) score = 4;
  else score = 2;

  if (apSoftWarnings > 10) score = Math.max(1, score - 1);

  const raise: string[] = [];
  if (examWindowFallbacks > 0) {
    raise.push(
      'Hygiene columns are competing for doctor exam coverage; add maxConcurrentDoctorOps=3 (requires EFDA scope) or stagger hygiene starts by 10 min.',
    );
  }
  if (srpPerDay < perioTarget) {
    raise.push(
      `Intake flagged ${perioDemand.toLowerCase()} perio demand but only ${srpPerDay.toFixed(1)} SRP slots/day; target ${perioTarget.toFixed(1)}.`,
    );
  }
  if (intake.doctorExamFrequencyNeeded === 'EVERY_VISIT' && score < 8) {
    raise.push(
      '"Exam every visit" is flagged — consider a dedicated 15-min doctor checkpoint between every 2 hygiene blocks.',
    );
  }

  return {
    axis: 'HYGIENE',
    label: 'Hygiene Support',
    score: clamp(score),
    band: bandFromScore(clamp(score)),
    signals: [
      { name: 'Exam-window fallbacks / week', value: String(examWindowFallbacks) },
      { name: 'SRP placements / day', value: srpPerDay.toFixed(2) },
      { name: 'AP soft warnings', value: String(apSoftWarnings) },
    ],
    raiseSuggestions: raise.slice(0, 3),
  };
}

// ---------------------------------------------------------------------------
// §5.5 — Team usability
// ---------------------------------------------------------------------------

function shannonEntropy(labelCounts: Record<string, number>): number {
  const total = Object.values(labelCounts).reduce((s, n) => s + n, 0);
  if (!total) return 0;
  let e = 0;
  for (const c of Object.values(labelCounts)) {
    if (!c) continue;
    const p = c / total;
    e -= p * Math.log2(p);
  }
  return e;
}

function scoreTeamUsability(weekResults: GenerationResult[]): AxisScore {
  const labelCounts: Record<string, number> = {};
  for (const day of weekResults) {
    const seen = new Set<string>();
    for (const slot of day.slots ?? []) {
      if (!slot.blockInstanceId || !slot.blockLabel) continue;
      if (seen.has(slot.blockInstanceId)) continue;
      seen.add(slot.blockInstanceId);
      labelCounts[slot.blockLabel] = (labelCounts[slot.blockLabel] ?? 0) + 1;
    }
  }
  const entropy = shannonEntropy(labelCounts);

  // Back-to-back complex run detector: two HP/Crown blocks on the same
  // providerId with no NON-PROD in between.
  let btbComplex = 0;
  for (const day of weekResults) {
    const byProvider: Record<string, { t: string; label: string }[]> = {};
    const seen = new Set<string>();
    for (const slot of day.slots ?? []) {
      if (!slot.blockInstanceId || !slot.blockLabel || !slot.providerId) continue;
      if (seen.has(slot.blockInstanceId)) continue;
      seen.add(slot.blockInstanceId);
      (byProvider[slot.providerId] ??= []).push({ t: slot.time, label: slot.blockLabel });
    }
    for (const list of Object.values(byProvider)) {
      list.sort((a, b) => a.t.localeCompare(b.t));
      for (let i = 1; i < list.length; i++) {
        const a = list[i - 1];
        const b = list[i];
        if (/(HP|CROWN|LARGE)/i.test(a.label) && /(HP|CROWN|LARGE)/i.test(b.label)) {
          btbComplex++;
        }
      }
    }
  }

  let score = 5;
  if (entropy >= 2.5 && btbComplex === 0) score = 10;
  else if (entropy >= 2.2 && btbComplex <= 2) score = 8;
  else if (entropy >= 1.8) score = 6;
  else if (entropy >= 1.4) score = 4;
  else score = 2;

  const raise: string[] = [];
  if (btbComplex > 0) {
    raise.push(
      `There are ${btbComplex} back-to-back complex block pairs — insert a 20-min NON-PROD buffer between them to reduce lateness risk.`,
    );
  }
  if (entropy < 1.8) {
    raise.push(
      'Block variety is low (Shannon entropy < 1.8); introducing 1-2 hygiene procedure-variety slots per column lifts team engagement.',
    );
  }
  if (Object.keys(labelCounts).length <= 3) {
    raise.push(
      'Only 3 distinct block types are placed; consider adding NPHYG or ER-access to broaden the day.',
    );
  }

  return {
    axis: 'USABILITY',
    label: 'Team Usability',
    score: clamp(score),
    band: bandFromScore(clamp(score)),
    signals: [
      { name: 'Block-type variety (Shannon)', value: entropy.toFixed(2) },
      { name: 'Back-to-back complex pairs', value: String(btbComplex) },
      { name: 'Distinct block types', value: String(Object.keys(labelCounts).length) },
    ],
    raiseSuggestions: raise.slice(0, 3),
  };
}

// ---------------------------------------------------------------------------
// §5.6 — Schedule stability
// ---------------------------------------------------------------------------

function scoreScheduleStability(
  weekResults: GenerationResult[],
  constraintsNarrative: string,
): AxisScore {
  let hardCount = 0;
  let softCount = 0;
  for (const day of weekResults) {
    const gr = day.guardReport;
    if (!gr) continue;
    for (const v of gr.violations ?? []) {
      if (v.severity === 'HARD') hardCount++;
      else if (v.severity === 'SOFT') softCount++;
    }
  }
  const totalFallbacks = hardCount + softCount;

  // Check for a risky PM rock when intake flagged late-afternoon cancellation risk
  const pmCancelFlagged = /afternoon|pm|late/i.test(constraintsNarrative) && /cancel|no[-\s]*show/i.test(constraintsNarrative);
  let pmRockInRiskyWindow = 0;
  if (pmCancelFlagged) {
    for (const day of weekResults) {
      const seen = new Set<string>();
      for (const slot of day.slots ?? []) {
        if (!slot.blockInstanceId || !slot.blockLabel) continue;
        if (seen.has(slot.blockInstanceId)) continue;
        seen.add(slot.blockInstanceId);
        const hour = Number.parseInt(slot.time?.slice(0, 2) ?? '12', 10);
        if (hour >= 15 && /(HP|CROWN|LARGE)/i.test(slot.blockLabel)) pmRockInRiskyWindow++;
      }
    }
  }

  let score = 7;
  if (totalFallbacks === 0 && softCount === 0) score = 10;
  else if (totalFallbacks <= 1 && softCount <= 2) score = 8;
  else if (totalFallbacks <= 3) score = 6;
  else if (totalFallbacks <= 6) score = 4;
  else score = 2;
  if (hardCount > 0) score = Math.max(1, score - 2);
  if (pmRockInRiskyWindow > 0) score = Math.max(1, score - 1);

  const raise: string[] = [];
  if (hardCount > 0) {
    raise.push(
      `There are ${hardCount} HARD coordinator fallbacks; review the Guard Report and tighten the offending rule before shipping to a live office.`,
    );
  }
  if (pmRockInRiskyWindow > 0) {
    raise.push(
      `Intake flagged late-afternoon cancellations — move the ${pmRockInRiskyWindow} PM high-production block(s) to the morning.`,
    );
  }
  if (softCount > 2) {
    raise.push(
      `${softCount} SOFT warnings are present; tighten stagger offsets (R-3.4) and verify rock placement (AP-1).`,
    );
  }

  return {
    axis: 'STABILITY',
    label: 'Schedule Stability',
    score: clamp(score),
    band: bandFromScore(clamp(score)),
    signals: [
      { name: 'Hard fallbacks', value: String(hardCount) },
      { name: 'Soft warnings', value: String(softCount) },
      { name: 'Risky PM rock placements', value: String(pmRockInRiskyWindow) },
    ],
    raiseSuggestions: raise.slice(0, 3),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute the six-axis template score. `weekResults` should be one
 * GenerationResult per working day (5 in most practices). `intakeGoals` and
 * `intakeConstraintsNarrative` drive the access/emergency/hygiene
 * comparisons and the stability risk penalty.
 *
 * Pure function; `computedAt` is derived from a stable seed so repeated
 * calls with the same inputs produce byte-identical JSON.
 */
export function scoreTemplate(
  weekResults: GenerationResult[],
  intakeGoals: IntakeGoals,
  constraintsNarrative = '',
  opts: { computedAt?: string } = {},
): TemplateScore {
  const axes: AxisScore[] = [
    scoreProduction(weekResults, intakeGoals),
    scoreNpAccess(weekResults, intakeGoals),
    scoreEmergencyAccess(weekResults, intakeGoals),
    scoreHygieneSupport(weekResults, intakeGoals),
    scoreTeamUsability(weekResults),
    scoreScheduleStability(weekResults, constraintsNarrative),
  ];
  const avg = axes.reduce((s, a) => s + a.score, 0) / axes.length;
  const overall = clamp(avg);
  return {
    overall,
    band: bandFromScore(overall),
    axes,
    computedAt: opts.computedAt ?? new Date(0).toISOString(), // deterministic default
  };
}

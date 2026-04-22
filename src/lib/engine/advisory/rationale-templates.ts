/**
 * Sprint 5 Feature B — Rationale templates + rule-code → plain-English map.
 *
 * ~25 canned paragraphs keyed by (policy, day-shape, dominant-tier). Used by
 * compose.ts to produce the "Block Rationale" and "Risks & Tradeoffs"
 * sections of the Advisory document. Deterministic — no LLM.
 */

import type { GenerationResult } from '../types';

/** Dominant tier of the day — derived from block labels for rationale selection. */
export type DayShape = 'PRODUCTION_HEAVY' | 'HYGIENE_HEAVY' | 'MIXED' | 'LIGHT';

export function dayShape(day: GenerationResult): DayShape {
  const labelCounts: Record<string, number> = {};
  const seen = new Set<string>();
  for (const slot of day.slots ?? []) {
    if (!slot.blockInstanceId || !slot.blockLabel) continue;
    if (seen.has(slot.blockInstanceId)) continue;
    seen.add(slot.blockInstanceId);
    labelCounts[slot.blockLabel] = (labelCounts[slot.blockLabel] ?? 0) + 1;
  }
  const hygiene = Object.entries(labelCounts)
    .filter(([l]) => /^HYG|^RC|^PROPHY|^SRP/.test(l))
    .reduce((s, [, n]) => s + n, 0);
  const rocks = Object.entries(labelCounts)
    .filter(([l]) => /^HP|^CROWN|^LARGE/.test(l))
    .reduce((s, [, n]) => s + n, 0);
  const total = Object.values(labelCounts).reduce((s, n) => s + n, 0);
  if (total < 10) return 'LIGHT';
  if (rocks / Math.max(1, total) > 0.4) return 'PRODUCTION_HEAVY';
  if (hygiene / Math.max(1, total) > 0.5) return 'HYGIENE_HEAVY';
  return 'MIXED';
}

interface RationaleKey {
  policy: string;
  shape: DayShape;
}

const RATIONALE_TEMPLATES: Record<string, string> = {
  'FARRAN_75_BY_NOON:PRODUCTION_HEAVY':
    'This day leads with a morning-heavy production pattern — the Farran 75-by-noon policy drives High-Production blocks into the 8am-noon window, with Water-tier hygiene and recare flowing around them. The rocks-first placement protects doctor attention for high-revenue procedures before decision fatigue sets in, and afternoons are left lighter intentionally.',
  'FARRAN_75_BY_NOON:MIXED':
    'Farran 75-by-noon is in effect but the day is a mix of restorative and hygiene demand. The engine placed the largest rocks between 8am and 11am, then matrixed hygiene columns in the gaps; the PM half absorbs flexible blocks and access slots.',
  'FARRAN_75_BY_NOON:HYGIENE_HEAVY':
    'Despite the Farran 75% policy, this day is hygiene-heavy — the office calendar plus staff mix is driving the shape. Rocks are pushed into the first hour; hygiene columns run in parallel with doctor exam checkpoints at the 30-min centre of each appointment.',
  'FARRAN_75_BY_NOON:LIGHT':
    'This is a light day on the calendar. The engine placed available rocks into the AM per the Farran policy but kept the afternoon low-intensity to match the intake-declared schedule.',

  'JAMESON_50:PRODUCTION_HEAVY':
    'Jameson-50 keeps the morning restorative load near 50% — rocks are concentrated in the 9am-11am band, leaving early-morning for NP/ER access blocks and afternoon for re-care and flex treatment. Expect steady-state production with room for same-day add-ins.',
  'JAMESON_50:MIXED':
    'Jameson-50 allows a balanced AM/PM profile. Rocks land between 9am and 11am; hygiene columns work in stagger throughout the day; two access slots (morning + afternoon) absorb walk-ins and same-day emergencies.',
  'JAMESON_50:HYGIENE_HEAVY':
    'Hygiene demand dominates this day under the Jameson-50 policy. Doctor rocks are placed in the first productive hour; the remaining doctor time is spent on exam checkpoints — the 50% morning band is easy to hit.',
  'JAMESON_50:LIGHT':
    'A light Jameson-50 day. The engine reserved AM and PM access slots and kept restorative production modest, matching the intake-declared day length.',

  'LEVIN_60:PRODUCTION_HEAVY':
    'Levin-60 targets a 60-65% morning production share — rocks fill 8am-11am with 1-2 protected slots that survive same-day rescheduling. Hygiene matrixes across both halves of the day; afternoons hold flex restorative and the second NP slot.',
  'LEVIN_60:MIXED':
    'The Levin-60 policy produces the classic balanced day: rocks in the AM, hygiene matrixed across the day, one AM + one PM NP slot, and emergency access blocks morning and afternoon.',
  'LEVIN_60:HYGIENE_HEAVY':
    'Under Levin-60, this hygiene-heavy day keeps 60% of doctor restorative in the morning while hygiene columns carry most of the work. Exam coverage is middle-30-min per hygiene appointment; the PM holds flex and recare.',
  'LEVIN_60:LIGHT':
    'A light day under Levin-60. The AM morning-load policy is honoured with 1-2 rocks; afternoons absorb walk-ins and NP/ER access.',

  'CUSTOM:PRODUCTION_HEAVY':
    'Custom production policy is in effect; the engine placed rocks first per the pattern catalog and then matrixed the remainder.',
  'CUSTOM:MIXED':
    'Custom policy on a mixed day — the engine placed per the pattern catalog and used default stagger / matrixing behaviours.',
  'CUSTOM:HYGIENE_HEAVY':
    'Custom policy on a hygiene-heavy day — hygiene columns dominated; rocks placed only where they fit the catalog.',
  'CUSTOM:LIGHT':
    'Custom policy on a light day — minimal rock placement, standard access coverage.',
};

/**
 * Return the best-fit rationale prose for a given (policy, day-shape) pair.
 * Falls through to CUSTOM:MIXED when a key is not in the catalog.
 */
export function rationaleFor(key: RationaleKey): string {
  return (
    RATIONALE_TEMPLATES[`${key.policy}:${key.shape}`] ??
    RATIONALE_TEMPLATES[`${key.policy}:MIXED`] ??
    RATIONALE_TEMPLATES['CUSTOM:MIXED']
  );
}

// ---------------------------------------------------------------------------
// Rule-code → plain-English map for the Risks section
// ---------------------------------------------------------------------------

export const RULE_CODE_MAP: Record<string, string> = {
  'AP-1': 'Rock blocks were expected in the AM half but placement slipped — consider tightening morning protections.',
  'AP-2': 'The stagger offset between doctor and assistant segments drifted off canonical timing.',
  'AP-3': 'A hygiene column was left unmatrixed with the doctor — exam coverage at risk.',
  'AP-4': 'Two doctor D-segments competed for the same operatory slot.',
  'AP-5': 'The expected Sand tier density was below policy minimum.',
  'AP-6': 'Hygiene exam window fell outside the canonical middle-30-min band.',
  'AP-7': 'Restorative block ran past the daily production cap.',
  'AP-8': 'The canonical lunch window was violated.',
  'AP-9': 'An operatory was scheduled beyond its posted working hours.',
  'AP-10': 'PM Rock count fell below the policy minimum.',
  'AP-11': 'Doctor stagger between two consecutive ops went below safe minimum.',
  'AP-12': 'NP slot placement drifted outside the preferred AM/post-lunch windows.',
  'AP-13': 'Emergency access block was not protected long enough into the day.',
  'AP-14': 'Block-type variety fell below the usability floor for the day.',
  'AP-15': 'More concurrent doctor operatories were in use than EFDA scope allows.',
  'R-3.4': 'Zigzag stagger — consider tightening the offset to the canonical 10 minutes to remove.',
  'R-3.5': 'Hygiene exam window required expansion to find a placement; hygiene column load may be too high.',
  'R-5.1': 'Double-booking inferred despite the office rule disabling it — review the affected column.',
};

/** Translate a rule code in any string (e.g. "SOFT [AP-10] ...") to English. */
export function plainEnglishForRule(ruleText: string): string {
  const match = ruleText.match(/(AP-\d+|R-\d+(\.\d+)?)/);
  if (!match) return ruleText;
  const code = match[1];
  return RULE_CODE_MAP[code] ?? ruleText;
}

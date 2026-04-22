/**
 * Sprint 6 Epic Q — LLM rewrite fact-check layer.
 *
 * The LLM is allowed to rewrite prose. It is NOT allowed to:
 *   1. Change any numeric axis score.
 *   2. Drop, invent, or rename the 6 canonical axes.
 *   3. Drop a risk (may rephrase; cannot remove).
 *   4. Invent a risk that was not in the original.
 *   5. Wholesale-remove the KPI list (allow consolidation by at most 1).
 *   6. Break the section structure (## 1 through ## 8 must be present; section 9 optional).
 *
 * This module is parse-and-assert against Markdown structure — it does NOT
 * re-score or re-reason the rewrite. If the rewrite mutates structure, the
 * fact-check blocks acceptance and the user sees the exact violations.
 *
 * See SPRINT-6-PLAN §5.3.
 */

import type {
  AdvisoryDocument,
  FactCheckResult,
  FactCheckViolation,
  TemplateScore,
} from './types';

// Canonical axis labels — must match those rendered by the Markdown writer.
const CANONICAL_AXIS_LABELS = new Set<string>([
  'Production Potential',
  'NP Access',
  'Emergency Access',
  'Hygiene Support',
  'Team Usability',
  'Schedule Stability',
]);

// Canonical section headers — must each appear in the rewrite.
// Section 9 ("Delta vs Current Template") is optional (only when a prior
// template was uploaded) and is excluded from the mandatory structural check.
const REQUIRED_SECTIONS = [
  '## 1. Executive Summary',
  '## 2. Key Inputs',
  '## 3. Recommended Weekly Template',
  '## 4. Block Rationale',
  '## 5. Risks',
  '## 6. KPIs',
  '## 7. Variants',
  '## 8. Review Timeline',
];

// ---------------------------------------------------------------------------
// Markdown parsers
// ---------------------------------------------------------------------------

/**
 * Parse the "## 2. Template Score" section's axis table. Forgiving on
 * format (accepts `8`, `8/10`, `8.0`) but strict on value. Returns a map
 * from canonical axis label → parsed numeric score.
 *
 * Accepts any `## 2.` heading variant — the Markdown writer renders
 * "## 2. Template Score" or "## 2. Key Inputs & Assumptions" depending on
 * section ordering. We scan the entire document for axis rows.
 */
export function extractRewriteAxisScores(rewrite: string): Map<string, number | null> {
  const out = new Map<string, number | null>();
  const lines = rewrite.split(/\r?\n/);
  for (const line of lines) {
    // Match rows like "| Production Potential | 8 | ..." OR "| Production Potential | 8/10 | ..."
    // OR "- Production Potential: 8 / 10" OR "- Production Potential: 8"
    const mPipe = line.match(/^\s*\|\s*([A-Za-z ]+?)\s*\|\s*([\d.]+)\s*(?:\/\s*10)?\s*\|/);
    if (mPipe) {
      const label = mPipe[1].trim();
      if (CANONICAL_AXIS_LABELS.has(label)) {
        const n = Number(mPipe[2]);
        if (Number.isFinite(n)) out.set(label, Math.round(n));
      }
      continue;
    }
    const mDash = line.match(/^\s*[-*]\s*([A-Za-z ]+?)\s*[:\-\u2013]\s*([\d.]+)\s*(?:\/\s*10)?/);
    if (mDash) {
      const label = mDash[1].trim();
      if (CANONICAL_AXIS_LABELS.has(label)) {
        const n = Number(mDash[2]);
        if (Number.isFinite(n)) out.set(label, Math.round(n));
      }
      continue;
    }
    // Also support inline "Production Potential (8/10)" prose
    for (const label of CANONICAL_AXIS_LABELS) {
      const re = new RegExp(`${label}[^\\d]{0,10}(\\d+)(?:\\s*/\\s*10)?`, 'i');
      const m = line.match(re);
      if (m && !out.has(label)) {
        const n = Number(m[1]);
        if (Number.isFinite(n)) out.set(label, Math.round(n));
      }
    }
  }
  return out;
}

/**
 * Extract the Risks section as an array of "risk lines" — each bullet under
 * "## 5. Risks" (forgiving on heading case/typography).
 */
export function extractRewriteRisks(rewrite: string): string[] {
  const lines = rewrite.split(/\r?\n/);
  const risks: string[] = [];
  let inSection = false;
  for (const line of lines) {
    const sectionMatch = line.match(/^##\s*\d+\.\s*(.+?)\s*$/);
    if (sectionMatch) {
      const name = sectionMatch[1].toLowerCase();
      inSection = name.includes('risk');
      continue;
    }
    if (!inSection) continue;
    // Bullet detection
    const bullet = line.match(/^\s*[-*]\s*(.+)$/);
    if (bullet) risks.push(bullet[1].trim());
  }
  return risks;
}

/**
 * Extract KPI bullets from "## 6. KPIs". Each line must start with a
 * bullet. Returns the full bullet text (we only count them).
 */
export function extractRewriteKpis(rewrite: string): string[] {
  const lines = rewrite.split(/\r?\n/);
  const kpis: string[] = [];
  let inSection = false;
  for (const line of lines) {
    const sectionMatch = line.match(/^##\s*\d+\.\s*(.+?)\s*$/);
    if (sectionMatch) {
      const name = sectionMatch[1].toLowerCase();
      inSection = name.includes('kpi') || name.includes('monitor');
      continue;
    }
    if (!inSection) continue;
    const bullet = line.match(/^\s*[-*]\s*(.+)$/);
    if (bullet) kpis.push(bullet[1].trim());
  }
  return kpis;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface FactCheckInput {
  original: AdvisoryDocument;
  rewrite: string;                          // raw Markdown from Claude
  score: TemplateScore;
}

export function factCheck(inp: FactCheckInput): FactCheckResult {
  const violations: FactCheckViolation[] = [];
  const warnings: string[] = [];

  // --- 1. Structural: every required section must appear --------------------
  for (const sec of REQUIRED_SECTIONS) {
    const rx = new RegExp(sec.replace(/\./g, '\\.').replace(/\s+/g, '\\s+'), 'i');
    if (!rx.test(inp.rewrite)) {
      violations.push({ code: 'STRUCTURE_BROKEN', missingSection: sec });
    }
  }

  // --- 2. Axis preservation --------------------------------------------------
  const rewriteAxes = extractRewriteAxisScores(inp.rewrite);
  const originalByLabel = new Map(inp.score.axes.map((a) => [a.label, a.score]));

  for (const [label, origScore] of originalByLabel.entries()) {
    const rewriteScore = rewriteAxes.get(label);
    if (rewriteScore === undefined) {
      violations.push({ code: 'AXIS_MISSING', axis: label });
      continue;
    }
    if (rewriteScore !== origScore) {
      violations.push({
        code: 'SCORE_MUTATED',
        axis: label,
        original: origScore,
        rewrite: rewriteScore,
      });
    }
  }

  for (const label of rewriteAxes.keys()) {
    if (!originalByLabel.has(label)) {
      violations.push({ code: 'AXIS_INVENTED', axis: label });
    }
  }

  // --- 3. Risk preservation --------------------------------------------------
  const originalRisks = inp.original.risks ?? [];
  const rewriteRiskLines = extractRewriteRisks(inp.rewrite);
  const rewriteBody = rewriteRiskLines.join('\n').toLowerCase();

  for (const orig of originalRisks) {
    const prose = (orig.plainEnglish ?? '').toLowerCase();
    // A risk is "present" if its ruleCode OR at least 3 meaningful tokens from
    // its prose appear somewhere in the rewrite's risks section.
    let present = false;
    if (orig.ruleCode && rewriteBody.includes(orig.ruleCode.toLowerCase())) {
      present = true;
    } else {
      // Token-overlap fallback: at least 40% of prose words of length ≥ 4
      // must appear in the rewrite risks body.
      const tokens = prose.match(/[a-z]{4,}/g) ?? [];
      if (tokens.length === 0) {
        // Short prose — look for exact substring via first 20 chars
        if (rewriteBody.includes(prose.slice(0, 20))) present = true;
      } else {
        const found = tokens.filter((t) => rewriteBody.includes(t)).length;
        if (found / tokens.length >= 0.4) present = true;
      }
    }
    if (!present) {
      violations.push({
        code: 'RISK_DROPPED',
        ruleCode: orig.ruleCode,
        plainEnglish: orig.plainEnglish,
      });
    }
  }

  // Detection of invented risks: any rewrite risk that contains a rule-code
  // pattern (R-X.Y or AP-N) not present in any original.
  const originalCodes = new Set(
    originalRisks
      .map((r) => r.ruleCode)
      .filter((c): c is string => Boolean(c))
      .map((c) => c.toUpperCase()),
  );
  for (const line of rewriteRiskLines) {
    const m = line.match(/\b(AP-\d+|R-\d+(?:\.\d+)?)\b/i);
    if (m && !originalCodes.has(m[1].toUpperCase())) {
      violations.push({ code: 'RISK_INVENTED', plainEnglish: line.slice(0, 120) });
    }
  }

  // --- 4. KPI count floor ----------------------------------------------------
  const rewriteKpis = extractRewriteKpis(inp.rewrite);
  const originalKpiCount = (inp.original.kpis ?? []).length;
  if (rewriteKpis.length < originalKpiCount - 1) {
    violations.push({
      code: 'KPI_WHOLESALE_REMOVAL',
      originalCount: originalKpiCount,
      rewriteCount: rewriteKpis.length,
    });
  } else if (rewriteKpis.length === originalKpiCount - 1) {
    warnings.push('KPI list was consolidated by one entry (allowed).');
  }

  return {
    passed: violations.length === 0,
    violations,
    warnings,
  };
}

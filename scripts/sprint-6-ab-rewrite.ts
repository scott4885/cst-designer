/**
 * Sprint 6 Epic Q — A/B rewrite gate.
 *
 * Runs the deterministic advisory pipeline against each golden template,
 * renders the Markdown, then calls Claude Opus (live, via ANTHROPIC_API_KEY)
 * to produce a rewrite. Writes both versions to .cst-rebuild-v3/logs/
 * sprint-6-ab/<fixture>/ so a human can compare them.
 *
 * COSTS REAL MONEY — ~$0.15 per fixture × 6 fixtures ≈ $0.90 per run.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-ant-... tsx scripts/sprint-6-ab-rewrite.ts
 *
 * Or (free / CI-safe) with stub:
 *   ADVISORY_REWRITE_STUB=1 tsx scripts/sprint-6-ab-rewrite.ts
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { scoreTemplate } from '../src/lib/engine/advisory/scoring';
import { composeAdvisory } from '../src/lib/engine/advisory/compose';
import { composeReviewPlan } from '../src/lib/engine/advisory/review-plan';
import { renderAdvisoryMarkdown } from '../src/lib/engine/advisory/markdown';
import { resolveRewriteRunner } from '../src/lib/engine/advisory/rewrite';
import { factCheck } from '../src/lib/engine/advisory/fact-check';
import { generateSchedule } from '../src/lib/engine/generator';
import { advisorySeed } from '../src/lib/engine/advisory/seed';
import type { GenerationInput, GenerationResult } from '../src/lib/engine/types';

const FIXTURES = [
  'smile-cascade-monday',
  'smile-nm-monday',
  'smile-nm-tuesday',
  'smile-nm-wednesday',
  'smile-nm-thursday',
  'smile-nm-friday',
];

const OUT_DIR = path.join(
  process.cwd(),
  '.cst-rebuild-v3',
  'logs',
  'sprint-6-ab',
);

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const runner = resolveRewriteRunner();
  const summary: Array<{ fixture: string; passed: boolean; violations: number; cost: number }> = [];

  for (const fixture of FIXTURES) {
    console.log(`\n=== ${fixture} ===`);
    const mod = await import(
      `../src/lib/engine/__tests__/golden-templates/${fixture}.fixture`
    );
    const input: GenerationInput = mod.default ?? mod.input ?? mod;
    const seededInput: GenerationInput = {
      ...input,
      seed: advisorySeed('ab-rewrite', 'MAIN', input.dayOfWeek),
    };
    const weekResults: GenerationResult[] = [generateSchedule(seededInput)];

    const score = scoreTemplate(weekResults, {}, '', {
      computedAt: new Date(0).toISOString(),
    });
    const document = composeAdvisory({
      officeName: fixture,
      practiceModel: '1D2O',
      productionPolicy: 'LEVIN_60',
      weekLabel: 'Week A',
      providerCount: seededInput.providers.length,
      weekResults,
      score,
      intakeGoals: {},
      intakeConstraints: {},
      generatedAt: new Date(0).toISOString(),
    });
    const reviewPlan = composeReviewPlan(score, {}, {}, {
      generatedAt: new Date(0).toISOString(),
    });
    const originalMarkdown = renderAdvisoryMarkdown(document, score, reviewPlan);

    const result = await runner({ originalMarkdown, original: document, score });
    const check = factCheck({ original: document, rewrite: result.rewrite, score });

    const outSub = path.join(OUT_DIR, fixture);
    await fs.mkdir(outSub, { recursive: true });
    await fs.writeFile(path.join(outSub, 'original.md'), originalMarkdown, 'utf8');
    await fs.writeFile(path.join(outSub, 'rewrite.md'), result.rewrite, 'utf8');
    await fs.writeFile(
      path.join(outSub, 'fact-check.json'),
      JSON.stringify(check, null, 2),
      'utf8',
    );
    await fs.writeFile(
      path.join(outSub, 'meta.json'),
      JSON.stringify(
        {
          model: result.model,
          cached: result.cached,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          estimatedCostUsd: result.estimatedCostUsd,
        },
        null,
        2,
      ),
      'utf8',
    );

    summary.push({
      fixture,
      passed: check.passed,
      violations: check.violations.length,
      cost: result.estimatedCostUsd,
    });
    console.log(
      `  ${check.passed ? 'PASS' : 'FAIL'} · ${check.violations.length} violations · ≈$${result.estimatedCostUsd.toFixed(3)}`,
    );
  }

  const totalCost = summary.reduce((s, x) => s + x.cost, 0);
  const passed = summary.filter((s) => s.passed).length;
  console.log(`\nSummary: ${passed}/${summary.length} passed, total ≈$${totalCost.toFixed(3)}`);

  await fs.writeFile(
    path.join(OUT_DIR, 'summary.json'),
    JSON.stringify({ summary, totalCost, passed, total: summary.length }, null, 2),
    'utf8',
  );

  // Exit code: pass if ≥ 4/6 fact-check (A/B threshold is subjective prose;
  // this only enforces that at least the fact-check bar holds).
  process.exit(passed >= 4 ? 0 : 2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

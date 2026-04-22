/**
 * Sprint 6 Epic Q — Claude Opus rewrite pipeline.
 *
 * Inputs: deterministic advisory Markdown + 6-axis score.
 * Output: Opus-rewritten Markdown (if fact-check passes) or violation list.
 *
 * Safeguards:
 *   • ANTHROPIC_API_KEY must be set (router returns 503 otherwise).
 *   • Feature flag NEXT_PUBLIC_ADVISORY_REWRITE_ENABLED=1 controls UI exposure.
 *   • Hash-keyed cache (AdvisoryRewriteCache table, 30d TTL).
 *   • Daily spend cap (ADVISORY_REWRITE_DAILY_CAP_USD, default $50).
 *   • Rate limit: max 3 rewrites per office per 24h (enforced in the API
 *     route, not here — this module is pure).
 *
 * See SPRINT-6-PLAN §5.
 */

import crypto from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import type { AdvisoryDocument, TemplateScore, FactCheckResult } from './types';
import { factCheck } from './fact-check';

export const SYSTEM_PROMPT_VERSION = '1';

export const SYSTEM_PROMPT = `You are an expert dental scheduling strategist and template designer working for Scheduling Growth Advisors (SGA).

Principles (verbatim, from the CST advisory spec):
1. Every template must translate an office's goals and constraints into a clear, defensible weekly schedule.
2. Production and access are inseparable; a template that hits production but starves NP access is failing.
3. Morning load is the single biggest leading indicator of a template's health.
4. Hygiene must be scheduled so the doctor's exam window is protected.
5. Emergency capacity is not optional; it is built into the base template.
6. Team usability beats theoretical optimisation — if the team cannot run the schedule, it does not matter how well it scores.
7. Every recommendation is traceable to an intake input, a score axis, or a rule.

You are REWRITING an EXISTING deterministic advisory that was computed by a heuristic engine. You MUST:

1. PRESERVE every numeric score EXACTLY. The 6-axis scores are computed by a deterministic rubric and are the source of truth.
2. PRESERVE the 6 axis names verbatim: Production Potential, NP Access, Emergency Access, Hygiene Support, Team Usability, Schedule Stability.
3. PRESERVE every listed risk. You may rephrase each for clarity but MUST NOT drop a risk or invent a new one. If a risk has a rule code (e.g. AP-7, R-3.5), keep the code.
4. PRESERVE the output structure: sections 1 through 8 (plus optional section 9 for delta).
5. RE-WRITE prose for clarity, tone, and insight-sharpness. The current advisory reads robotically on edge cases. Make it read like a consulting brief from a scheduling strategist with 20 years of operational practice.

Respond with the full advisory as Markdown, identical structure to the input.`;

// ---------------------------------------------------------------------------
// Cost model (as of Opus 4.7: ~$15 in / $75 out per million tokens)
// ---------------------------------------------------------------------------

const OPUS_INPUT_USD_PER_MTOK = 15;
const OPUS_OUTPUT_USD_PER_MTOK = 75;

export function estimateCostUsd(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens * OPUS_INPUT_USD_PER_MTOK) / 1_000_000 +
    (outputTokens * OPUS_OUTPUT_USD_PER_MTOK) / 1_000_000
  );
}

// ---------------------------------------------------------------------------
// Hash for cache keys
// ---------------------------------------------------------------------------

export function rewriteCacheHash(originalMarkdown: string): string {
  return crypto
    .createHash('sha256')
    .update(`${SYSTEM_PROMPT_VERSION}\n${originalMarkdown}`)
    .digest('hex');
}

// ---------------------------------------------------------------------------
// API key resolution
// ---------------------------------------------------------------------------

export function isRewriteEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function dailyCapUsd(): number {
  const fromEnv = Number(process.env.ADVISORY_REWRITE_DAILY_CAP_USD ?? '50');
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : 50;
}

// ---------------------------------------------------------------------------
// Call Claude — non-streaming v1 (streaming UI planned but add later)
// ---------------------------------------------------------------------------

export interface RewriteInput {
  originalMarkdown: string;
  original: AdvisoryDocument;
  score: TemplateScore;
}

export interface RewriteOutput {
  rewrite: string;                       // raw Markdown from Claude
  factCheck: FactCheckResult;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  model: string;
  cached: boolean;
}

export async function runRewrite(inp: RewriteInput): Promise<RewriteOutput> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set');
  }
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 4096,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `Please rewrite the following deterministic advisory. Keep all axis scores, risks, and section structure intact; only improve the prose.\n\n${inp.originalMarkdown}`,
      },
    ],
  });

  // Extract text
  const rewriteText = response.content
    .filter((c): c is Anthropic.TextBlock => c.type === 'text')
    .map((c) => c.text)
    .join('\n');

  const check = factCheck({
    original: inp.original,
    rewrite: rewriteText,
    score: inp.score,
  });

  const usage = response.usage;
  const inputTokens = usage?.input_tokens ?? 0;
  const outputTokens = usage?.output_tokens ?? 0;

  return {
    rewrite: rewriteText,
    factCheck: check,
    inputTokens,
    outputTokens,
    estimatedCostUsd: estimateCostUsd(inputTokens, outputTokens),
    model: response.model ?? 'claude-opus-4-7',
    cached: false,
  };
}

// ---------------------------------------------------------------------------
// Test hook: stubbed rewrite used by unit + Playwright tests so we never
// hit the live Anthropic API in CI. Activated by NEXT_PUBLIC_ADVISORY_REWRITE_STUB=1.
// The stub echoes the original Markdown back (trivially passes fact-check)
// so the route pipeline can be exercised.
// ---------------------------------------------------------------------------

export async function runRewriteStub(inp: RewriteInput): Promise<RewriteOutput> {
  const check = factCheck({
    original: inp.original,
    rewrite: inp.originalMarkdown,
    score: inp.score,
  });
  return {
    rewrite: inp.originalMarkdown,
    factCheck: check,
    inputTokens: 0,
    outputTokens: 0,
    estimatedCostUsd: 0,
    model: 'stub',
    cached: false,
  };
}

/** Router — returns stub in test mode, live Claude otherwise. */
export function resolveRewriteRunner(): (inp: RewriteInput) => Promise<RewriteOutput> {
  if (process.env.ADVISORY_REWRITE_STUB === '1') return runRewriteStub;
  return runRewrite;
}

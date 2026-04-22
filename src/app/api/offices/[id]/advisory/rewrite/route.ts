/**
 * Sprint 6 Epic Q — Advisory rewrite + accept/reject endpoint.
 *
 * POST /api/offices/:id/advisory/rewrite
 *   Body: { advisoryId: string, action: "GENERATE" | "ACCEPT" | "REJECT" }
 *   - GENERATE: run Claude rewrite (or stub), fact-check, cache; return rewrite + check.
 *     Rate-limit: 3 rewrites / office / 24h (enforced server-side).
 *     Requires ANTHROPIC_API_KEY (503 otherwise).
 *   - ACCEPT: writes rewriteState='ACCEPTED' on the advisory (must have been generated).
 *   - REJECT: writes rewriteState='REJECTED' + clears documentRewriteJson.
 *
 * Response: {
 *   rewrite?: string, factCheck?: FactCheckResult, cached?: boolean,
 *   state: RewriteState, ok: boolean
 * }
 *
 * See SPRINT-6-PLAN §5.
 */

import { NextResponse } from 'next/server';
import { getOfficeById } from '@/lib/data-access';
import { ApiError, handleApiError } from '@/lib/api-error';
import { prisma } from '@/lib/db';
import {
  isRewriteEnabled,
  resolveRewriteRunner,
  rewriteCacheHash,
  SYSTEM_PROMPT_VERSION,
} from '@/lib/engine/advisory/rewrite';
import { renderAdvisoryMarkdown } from '@/lib/engine/advisory/markdown';
import type {
  AdvisoryDocument,
  TemplateScore,
  RewriteState,
  VariantSet,
  ReviewPlan,
} from '@/lib/engine/advisory/types';

const DAILY_RATE_LIMIT = 3;

interface RewriteBody {
  advisoryId?: string;
  action?: 'GENERATE' | 'ACCEPT' | 'REJECT';
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as RewriteBody;

    const office = await getOfficeById(id);
    if (!office) throw new ApiError(404, 'Office not found');

    const action = body.action ?? 'GENERATE';
    if (!['GENERATE', 'ACCEPT', 'REJECT'].includes(action)) {
      throw new ApiError(400, `Unknown action: ${action}`);
    }
    if (!body.advisoryId) throw new ApiError(400, 'advisoryId is required');

    const advisory = await prisma.templateAdvisory.findUnique({
      where: { id: body.advisoryId },
    });
    if (!advisory || advisory.officeId !== office.id) {
      throw new ApiError(404, 'Advisory not found');
    }

    if (action === 'ACCEPT') {
      if (!advisory.documentRewriteJson) {
        throw new ApiError(422, 'No rewrite present — run GENERATE first');
      }
      const updated = await prisma.templateAdvisory.update({
        where: { id: advisory.id },
        data: { rewriteState: 'ACCEPTED' },
      });
      return NextResponse.json({ ok: true, state: updated.rewriteState as RewriteState });
    }

    if (action === 'REJECT') {
      const updated = await prisma.templateAdvisory.update({
        where: { id: advisory.id },
        data: { rewriteState: 'REJECTED', documentRewriteJson: null },
      });
      return NextResponse.json({ ok: true, state: updated.rewriteState as RewriteState });
    }

    // ---- GENERATE -----------------------------------------------------------
    if (!isRewriteEnabled() && process.env.ADVISORY_REWRITE_STUB !== '1') {
      throw new ApiError(503, 'ANTHROPIC_API_KEY is not configured');
    }

    // Rate limit — count rewrite attempts for this office in last 24h
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recent = await prisma.templateAdvisory.count({
      where: {
        officeId: office.id,
        rewriteGeneratedAt: { gte: since },
      },
    });
    if (recent >= DAILY_RATE_LIMIT) {
      throw new ApiError(
        429,
        `${DAILY_RATE_LIMIT}/${DAILY_RATE_LIMIT} AI refinements used today — try again tomorrow or edit manually.`,
      );
    }

    const original: AdvisoryDocument = JSON.parse(advisory.documentJson);
    const score: TemplateScore = JSON.parse(advisory.scoreJson);
    const variants: VariantSet | null = advisory.variantsJson ? JSON.parse(advisory.variantsJson) : null;
    const reviewPlan: ReviewPlan = JSON.parse(advisory.reviewPlanJson);

    const originalMarkdown = renderAdvisoryMarkdown(
      original,
      score,
      reviewPlan,
      variants ?? undefined,
    );

    // Cache check
    const hash = rewriteCacheHash(originalMarkdown);
    const cacheHit = await prisma.advisoryRewriteCache.findUnique({
      where: { hash },
    });

    let rewrite: string;
    let factCheckResult;
    let cached: boolean;
    let inputTokens = 0;
    let outputTokens = 0;
    let costUsd = 0;
    let model = 'cache';

    if (cacheHit) {
      rewrite = cacheHit.rewrite;
      // Re-run fact-check on the cached rewrite (original may have drifted).
      const { factCheck } = await import('@/lib/engine/advisory/fact-check');
      factCheckResult = factCheck({ original, rewrite, score });
      cached = true;
    } else {
      const runner = resolveRewriteRunner();
      const result = await runner({ originalMarkdown, original, score });
      rewrite = result.rewrite;
      factCheckResult = result.factCheck;
      inputTokens = result.inputTokens;
      outputTokens = result.outputTokens;
      costUsd = result.estimatedCostUsd;
      model = result.model;
      cached = false;

      // Cache only if fact-check passed — don't poison the cache with bad rewrites.
      if (factCheckResult.passed) {
        await prisma.advisoryRewriteCache.upsert({
          where: { hash },
          update: { rewrite, systemPromptVersion: SYSTEM_PROMPT_VERSION },
          create: { hash, rewrite, systemPromptVersion: SYSTEM_PROMPT_VERSION },
        });
      }
    }

    // Persist the rewrite on the advisory (regardless of fact-check — UI
    // needs to show violations).
    const updated = await prisma.templateAdvisory.update({
      where: { id: advisory.id },
      data: {
        documentRewriteJson: JSON.stringify({
          rewrite,
          factCheck: factCheckResult,
          inputTokens,
          outputTokens,
          estimatedCostUsd: costUsd,
          model,
          cached,
        }),
        rewriteState: 'PENDING',
        rewriteGeneratedAt: new Date(),
      },
    });

    return NextResponse.json({
      ok: true,
      rewrite,
      factCheck: factCheckResult,
      cached,
      state: updated.rewriteState as RewriteState,
      costUsd,
      tokens: { input: inputTokens, output: outputTokens },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

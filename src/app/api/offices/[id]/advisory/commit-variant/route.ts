/**
 * Sprint 6 Epic R — Commit chosen variant.
 *
 * POST /api/offices/:id/advisory/commit-variant
 *   Body: { advisoryId: string, variantCode: "GROWTH"|"ACCESS"|"BALANCED"|null }
 *   Writes chosenVariant on the advisory and returns the recomputed
 *   ReviewPlan (KPI targets rescaled to the variant's weights).
 *
 * Important: this does NOT touch `ScheduleTemplate.isActive`. The live
 * template is unchanged. Sprint 6 treats chosenVariant as advisory
 * metadata only. Auto-apply to live is Sprint 7.
 *
 * See SPRINT-6-PLAN §6.
 */

import { NextResponse } from 'next/server';
import { getOfficeById } from '@/lib/data-access';
import { ApiError, handleApiError } from '@/lib/api-error';
import { prisma } from '@/lib/db';
import { composeReviewPlan } from '@/lib/engine/advisory/review-plan';
import { VARIANT_PROFILES } from '@/lib/engine/advisory/variants';
import type {
  IntakeGoals,
  IntakeConstraints,
  TemplateScore,
  VariantCode,
  ChosenVariantHistoryEntry,
} from '@/lib/engine/advisory/types';

interface CommitBody {
  advisoryId?: string;
  variantCode?: VariantCode | null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as CommitBody;
    const office = await getOfficeById(id);
    if (!office) throw new ApiError(404, 'Office not found');

    if (!body.advisoryId) throw new ApiError(400, 'advisoryId is required');
    const variantCode = body.variantCode ?? null;
    if (variantCode !== null && !['GROWTH', 'ACCESS', 'BALANCED'].includes(variantCode)) {
      throw new ApiError(400, `Invalid variantCode: ${variantCode}`);
    }

    const advisory = await prisma.templateAdvisory.findUnique({
      where: { id: body.advisoryId },
    });
    if (!advisory || advisory.officeId !== office.id) {
      throw new ApiError(404, 'Advisory not found');
    }

    // Idempotency: same variant twice is a no-op (no history padding)
    if ((advisory.chosenVariant ?? null) === variantCode) {
      const intakeGoals = (office.intakeGoals ?? {}) as IntakeGoals;
      const intakeConstraints = (office.intakeConstraints ?? {}) as IntakeConstraints;
      const score: TemplateScore = JSON.parse(advisory.scoreJson);
      const reviewPlan = composeReviewPlan(score, intakeGoals, intakeConstraints, {
        generatedAt: new Date(0).toISOString(),
        chosenVariantProfile: variantCode ? VARIANT_PROFILES[variantCode] : undefined,
      });
      return NextResponse.json({
        advisoryId: advisory.id,
        chosenVariant: advisory.chosenVariant,
        chosenVariantAt: advisory.chosenVariantAt?.toISOString() ?? null,
        reviewPlan,
        idempotent: true,
      });
    }

    // Push old variant onto history
    const history: ChosenVariantHistoryEntry[] = JSON.parse(advisory.chosenVariantHistoryJson);
    if (advisory.chosenVariant) {
      history.push({
        variant: advisory.chosenVariant as VariantCode,
        at: (advisory.chosenVariantAt ?? advisory.generatedAt).toISOString(),
      });
    }

    const now = new Date();
    const updated = await prisma.templateAdvisory.update({
      where: { id: advisory.id },
      data: {
        chosenVariant: variantCode,
        chosenVariantAt: variantCode ? now : null,
        chosenVariantHistoryJson: JSON.stringify(history),
      },
    });

    // Recompute review plan with the new variant profile.
    const intakeGoals = (office.intakeGoals ?? {}) as IntakeGoals;
    const intakeConstraints = (office.intakeConstraints ?? {}) as IntakeConstraints;
    const score: TemplateScore = JSON.parse(updated.scoreJson);
    const reviewPlan = composeReviewPlan(score, intakeGoals, intakeConstraints, {
      generatedAt: new Date(0).toISOString(),
      chosenVariantProfile: variantCode ? VARIANT_PROFILES[variantCode] : undefined,
    });

    // Persist the recomputed review plan (so the UI and subsequent GETs see it)
    await prisma.templateAdvisory.update({
      where: { id: advisory.id },
      data: { reviewPlanJson: JSON.stringify(reviewPlan) },
    });

    return NextResponse.json({
      advisoryId: updated.id,
      chosenVariant: updated.chosenVariant,
      chosenVariantAt: updated.chosenVariantAt?.toISOString() ?? null,
      reviewPlan,
      idempotent: false,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

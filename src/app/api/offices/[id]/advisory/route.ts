/**
 * Sprint 5 — Advisory API.
 *
 * POST /api/offices/:id/advisory
 *   Body: { includeVariants?: boolean, days?: string[] }
 *   Runs the engine across the working days, composes the advisory
 *   document, scores it, generates 3 variants if requested, composes the
 *   30/60/90 review plan, and persists one TemplateAdvisory row.
 *   Response: { advisory: AdvisoryArtifact, completeness: IntakeCompleteness }
 *
 * GET /api/offices/:id/advisory
 *   Returns the most recent TemplateAdvisory for the office (computed on
 *   the fly from the office's current state when none is persisted).
 */

import { NextResponse } from 'next/server';
import { getOfficeById } from '@/lib/data-access';
import { ApiError, handleApiError } from '@/lib/api-error';
import { prisma } from '@/lib/db';
import { generateSchedule } from '@/lib/engine/generator';
import type { GenerationInput, GenerationResult } from '@/lib/engine/types';
import { scoreTemplate } from '@/lib/engine/advisory/scoring';
import { composeAdvisory } from '@/lib/engine/advisory/compose';
import { composeReviewPlan } from '@/lib/engine/advisory/review-plan';
import { generateThreeVariants } from '@/lib/engine/advisory/variants';
import { computeIntakeCompleteness } from '@/lib/engine/advisory/completeness';
import type {
  IntakeGoals,
  IntakeConstraints,
  AdvisoryArtifact,
} from '@/lib/engine/advisory/types';

function intakeNarrativeFrom(c: IntakeConstraints): string {
  return [
    c.noShowCancellationPatterns,
    c.productionLeakage,
    c.overbookedSlots,
    c.underutilizedSlots,
    c.poorAccess,
  ]
    .filter(Boolean)
    .join(' ');
}

function derivedHaveCountFor(office: { providers: unknown[]; workingDays: unknown[]; blockTypes: unknown[] }): number {
  // 9 derived fields per completeness.ts — count the subset we can verify
  // from the office record.
  let n = 0;
  if (office.workingDays && office.workingDays.length > 0) n++; // Practice working days
  if (office.providers && office.providers.length > 0) {
    n += 4; // working hours + lunch + #doctors + #hygienists inferable
  }
  if (office.blockTypes && office.blockTypes.length > 0) {
    n += 3; // most common procedures + average durations + NP length
  }
  // Operatories — always defaulted, so count it
  n++;
  return Math.min(n, 9);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      includeVariants?: boolean;
      days?: string[];
      templateId?: string;
    };

    const office = await getOfficeById(id);
    if (!office) throw new ApiError(404, 'Office not found');

    const intakeGoals = (office.intakeGoals ?? {}) as IntakeGoals;
    const intakeConstraints = (office.intakeConstraints ?? {}) as IntakeConstraints;
    const completeness = computeIntakeCompleteness(
      intakeGoals,
      intakeConstraints,
      derivedHaveCountFor(office),
    );

    // Gate: advisory still renders below 80% but flags completeness in response.
    // Days default to office.workingDays, capped to 5 for runtime budget.
    const dayNames = (body.days && body.days.length > 0 ? body.days : office.workingDays).slice(0, 5);
    const dayCodeMap: Record<string, string> = {
      MONDAY: 'MON', TUESDAY: 'TUE', WEDNESDAY: 'WED', THURSDAY: 'THU', FRIDAY: 'FRI', SATURDAY: 'SAT', SUNDAY: 'SUN',
      MON: 'MON', TUE: 'TUE', WED: 'WED', THU: 'THU', FRI: 'FRI', SAT: 'SAT', SUN: 'SUN',
    };
    const days = dayNames.map((d) => dayCodeMap[String(d).toUpperCase()] ?? String(d).slice(0, 3).toUpperCase());

    // Generate the template across the week using the current office config.
    const weekResults: GenerationResult[] = [];
    for (const day of days) {
      const input: GenerationInput = {
        providers: office.providers,
        blockTypes: office.blockTypes,
        rules: office.rules,
        timeIncrement: office.timeIncrement,
        dayOfWeek: day,
      };
      try {
        weekResults.push(generateSchedule(input));
      } catch (err) {
        weekResults.push({
          dayOfWeek: day,
          slots: [],
          productionSummary: [],
          warnings: [`GEN-FAIL: ${String(err)}`],
          guardReport: null,
        });
      }
    }

    const score = scoreTemplate(
      weekResults,
      intakeGoals,
      intakeNarrativeFrom(intakeConstraints),
      { computedAt: new Date().toISOString() },
    );

    const variants = body.includeVariants
      ? generateThreeVariants({
          officeId: office.id,
          officeName: office.name,
          practiceModel: '1D2O',
          providers: office.providers,
          blockTypes: office.blockTypes,
          rules: office.rules,
          timeIncrement: office.timeIncrement,
          days,
          intakeGoals,
          intakeConstraintsNarrative: intakeNarrativeFrom(intakeConstraints),
        })
      : undefined;

    const providerCount = office.providers.length;
    const productionPolicy = ((office as unknown as { productionPolicy?: string }).productionPolicy) ?? 'LEVIN_60';
    const practiceModel = ((office as unknown as { practiceModel?: string }).practiceModel) ?? '1D2O';

    const document = composeAdvisory({
      officeName: office.name,
      practiceModel,
      productionPolicy,
      weekLabel: 'Week A',
      providerCount,
      weekResults,
      score,
      intakeGoals,
      intakeConstraints,
      winningVariantLabel: variants?.recommendation.winner,
      generatedAt: new Date().toISOString(),
    });

    const reviewPlan = composeReviewPlan(score, intakeGoals, intakeConstraints, {
      generatedAt: new Date().toISOString(),
    });

    const templateId = body.templateId ?? `live-${office.id}`;
    const persisted = await prisma.templateAdvisory.create({
      data: {
        templateId,
        officeId: office.id,
        documentJson: JSON.stringify(document),
        scoreJson: JSON.stringify(score),
        variantsJson: JSON.stringify(variants ?? null),
        reviewPlanJson: JSON.stringify(reviewPlan),
      },
    });

    const artifact: AdvisoryArtifact = {
      id: persisted.id,
      templateId,
      officeId: office.id,
      generatedAt: persisted.generatedAt.toISOString(),
      document,
      score,
      variants,
      reviewPlan,
    };

    return NextResponse.json({ advisory: artifact, completeness });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const office = await getOfficeById(id);
    if (!office) throw new ApiError(404, 'Office not found');

    const latest = await prisma.templateAdvisory.findFirst({
      where: { officeId: office.id },
      orderBy: { generatedAt: 'desc' },
    });
    if (!latest) {
      const intakeGoals = (office.intakeGoals ?? {}) as IntakeGoals;
      const intakeConstraints = (office.intakeConstraints ?? {}) as IntakeConstraints;
      const completeness = computeIntakeCompleteness(
        intakeGoals,
        intakeConstraints,
        derivedHaveCountFor(office),
      );
      return NextResponse.json({ advisory: null, completeness });
    }

    const intakeGoals = (office.intakeGoals ?? {}) as IntakeGoals;
    const intakeConstraints = (office.intakeConstraints ?? {}) as IntakeConstraints;
    const completeness = computeIntakeCompleteness(
      intakeGoals,
      intakeConstraints,
      derivedHaveCountFor(office),
    );

    const artifact: AdvisoryArtifact = {
      id: latest.id,
      templateId: latest.templateId,
      officeId: latest.officeId,
      generatedAt: latest.generatedAt.toISOString(),
      document: JSON.parse(latest.documentJson),
      score: JSON.parse(latest.scoreJson),
      variants: latest.variantsJson ? JSON.parse(latest.variantsJson) : undefined,
      reviewPlan: JSON.parse(latest.reviewPlanJson),
    };

    return NextResponse.json({ advisory: artifact, completeness });
  } catch (error) {
    return handleApiError(error);
  }
}

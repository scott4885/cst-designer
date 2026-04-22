/**
 * Sprint 6 Epic P — Delta computation endpoint.
 *
 * GET /api/offices/:id/prior-template/delta?variant=MAIN|GROWTH|ACCESS|BALANCED
 *   Joins the latest PriorTemplate with the latest TemplateAdvisory for the
 *   office. Synthesises a GenerationResult[] from the prior template, runs
 *   the deterministic re-score, and diffs against the recommended advisory.
 *
 * Response: { delta: TemplateDelta | null, hasPriorTemplate: boolean }
 *
 * See SPRINT-6-PLAN §4.4.
 */

import { NextResponse } from 'next/server';
import { getOfficeById } from '@/lib/data-access';
import { ApiError, handleApiError } from '@/lib/api-error';
import { prisma } from '@/lib/db';
import { generateSchedule } from '@/lib/engine/generator';
import { computeDelta } from '@/lib/engine/advisory/delta';
import { advisorySeed } from '@/lib/engine/advisory/seed';
import type { GenerationInput, GenerationResult } from '@/lib/engine/types';
import type {
  IntakeGoals,
  IntakeConstraints,
  PriorTemplateBlock,
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

const DAY_CODE_MAP: Record<string, string> = {
  MONDAY: 'MON', TUESDAY: 'TUE', WEDNESDAY: 'WED', THURSDAY: 'THU', FRIDAY: 'FRI', SATURDAY: 'SAT', SUNDAY: 'SUN',
  MON: 'MON', TUE: 'TUE', WED: 'WED', THU: 'THU', FRI: 'FRI', SAT: 'SAT', SUN: 'SUN',
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const office = await getOfficeById(id);
    if (!office) throw new ApiError(404, 'Office not found');

    const prior = await prisma.priorTemplate.findFirst({
      where: { officeId: office.id, supersededBy: null },
      orderBy: { uploadedAt: 'desc' },
    });
    if (!prior) return NextResponse.json({ delta: null, hasPriorTemplate: false });

    const blocks: PriorTemplateBlock[] = JSON.parse(prior.blocksJson);
    if (blocks.length === 0) {
      // FREETEXT or failed parse — no structured delta possible
      return NextResponse.json({
        delta: null,
        hasPriorTemplate: true,
        priorSourceFormat: prior.sourceFormat,
        parseStatus: prior.parseStatus,
      });
    }

    const intakeGoals = (office.intakeGoals ?? {}) as IntakeGoals;
    const intakeConstraints = (office.intakeConstraints ?? {}) as IntakeConstraints;

    const dayNames = (office.workingDays && office.workingDays.length > 0 ? office.workingDays : ['MON', 'TUE', 'WED', 'THU', 'FRI']).slice(0, 5);
    const days = dayNames.map((d) => DAY_CODE_MAP[String(d).toUpperCase()] ?? String(d).slice(0, 3).toUpperCase());

    const weekResults: GenerationResult[] = [];
    for (const day of days) {
      const input: GenerationInput = {
        providers: office.providers,
        blockTypes: office.blockTypes,
        rules: office.rules,
        timeIncrement: office.timeIncrement,
        dayOfWeek: day,
        seed: advisorySeed(office.id, 'MAIN', day),
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

    const delta = computeDelta({
      prior: blocks,
      generated: weekResults,
      intakeGoals,
      intakeConstraintsNarrative: intakeNarrativeFrom(intakeConstraints),
      days,
      computedAt: new Date(0).toISOString(),
    });

    return NextResponse.json({
      delta,
      hasPriorTemplate: true,
      priorSourceFormat: prior.sourceFormat,
      parseStatus: prior.parseStatus,
      priorFilename: prior.filename,
      priorUploadedAt: prior.uploadedAt.toISOString(),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

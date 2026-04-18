import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ApiError, handleApiError } from '@/lib/api-error';
import { TemplateApplyInputSchema } from '@/lib/contracts/api-schemas';

interface TemplateSlot {
  providerId: string;
  time?: string;
  blockTypeId?: string | null;
  blockLabel?: string | null;
  isBreak?: boolean;
  operatory?: string;
  staffingCode?: 'D' | 'A' | 'H' | null;
  [key: string]: unknown;
}

/**
 * POST /api/template-library/:id/apply
 * Apply a library template to a target office.
 *
 * Body: { targetOfficeId: string }
 *
 * Apply logic:
 * - Slots are stored role-relative in the library (DOCTOR_0, HYGIENIST_0…)
 * - Map those indices to actual provider IDs at the target office
 * - Return the mapped schedule so the client can load it into the store
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const parsed = TemplateApplyInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, 'Invalid request', parsed.error.flatten());
    }
    const { targetOfficeId } = parsed.data;

    const [libraryItem, office] = await Promise.all([
      prisma.templateLibraryItem.findUnique({ where: { id } }),
      prisma.office.findUnique({
        where: { id: targetOfficeId },
        include: { providers: true },
      }),
    ]);

    if (!libraryItem) {
      throw new ApiError(404, 'Template not found');
    }
    if (!office) {
      throw new ApiError(404, 'Target office not found');
    }

    const templateSlots: Record<string, TemplateSlot[]> = JSON.parse(libraryItem.slotsJson || '{}');

    // Build role-index → actual provider ID mapping
    const doctors = office.providers.filter(p => p.role === 'DOCTOR');
    const hygienists = office.providers.filter(p => p.role === 'HYGIENIST');

    const roleIndexToProviderId: Record<string, string> = {};
    doctors.forEach((d, i) => { roleIndexToProviderId[`DOCTOR_${i}`] = d.id; });
    hygienists.forEach((h, i) => { roleIndexToProviderId[`HYGIENIST_${i}`] = h.id; });

    const warnings: string[] = [];

    // Map template slots per day-of-week
    const mappedDaySchedules: Record<string, TemplateSlot[]> = {};
    for (const [day, slots] of Object.entries(templateSlots)) {
      if (!Array.isArray(slots)) continue;
      const mappedSlots = slots.map((slot) => {
        const realProviderId = roleIndexToProviderId[slot.providerId];
        if (!realProviderId) {
          // Extra template slots (no matching provider)
          return null;
        }
        return { ...slot, providerId: realProviderId };
      }).filter((s): s is TemplateSlot => s !== null);

      mappedDaySchedules[day] = mappedSlots;
    }

    // Build warnings for slot count mismatches
    const templateDoctorCount = Object.keys(roleIndexToProviderId).filter(k => k.startsWith('DOCTOR_')).length;
    const templateHygCount = Object.keys(roleIndexToProviderId).filter(k => k.startsWith('HYGIENIST_')).length;
    if (doctors.length > templateDoctorCount) {
      warnings.push(`Office has ${doctors.length} doctor(s) but template only covers ${templateDoctorCount}. Extra providers will have empty schedules.`);
    }
    if (hygienists.length > templateHygCount) {
      warnings.push(`Office has ${hygienists.length} hygienist(s) but template only covers ${templateHygCount}. Extra providers will have empty schedules.`);
    }

    return NextResponse.json({
      templateName: libraryItem.name,
      category: libraryItem.category,
      daySchedules: mappedDaySchedules,
      warnings,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

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
    const { targetOfficeId } = await request.json();

    if (!targetOfficeId) {
      return NextResponse.json({ error: 'targetOfficeId is required' }, { status: 400 });
    }

    const [libraryItem, office] = await Promise.all([
      prisma.templateLibraryItem.findUnique({ where: { id } }),
      prisma.office.findUnique({
        where: { id: targetOfficeId },
        include: { providers: true },
      }),
    ]);

    if (!libraryItem) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }
    if (!office) {
      return NextResponse.json({ error: 'Target office not found' }, { status: 404 });
    }

    const templateSlots: Record<string, any[]> = JSON.parse(libraryItem.slotsJson || '{}');

    // Build role-index → actual provider ID mapping
    const doctors = office.providers.filter(p => p.role === 'DOCTOR');
    const hygienists = office.providers.filter(p => p.role === 'HYGIENIST');

    const roleIndexToProviderId: Record<string, string> = {};
    doctors.forEach((d, i) => { roleIndexToProviderId[`DOCTOR_${i}`] = d.id; });
    hygienists.forEach((h, i) => { roleIndexToProviderId[`HYGIENIST_${i}`] = h.id; });

    const warnings: string[] = [];

    // Map template slots per day-of-week
    const mappedDaySchedules: Record<string, any[]> = {};
    for (const [day, slots] of Object.entries(templateSlots)) {
      if (!Array.isArray(slots)) continue;
      const mappedSlots = (slots as any[]).map((slot: any) => {
        const realProviderId = roleIndexToProviderId[slot.providerId];
        if (!realProviderId) {
          // Extra template slots (no matching provider)
          return null;
        }
        return { ...slot, providerId: realProviderId };
      }).filter(Boolean);

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
    console.error('Error applying template:', error);
    return NextResponse.json({ error: 'Failed to apply template' }, { status: 500 });
  }
}

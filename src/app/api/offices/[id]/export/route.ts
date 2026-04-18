import { generateExcel, ExportInput, ExportDaySchedule } from '@/lib/export/excel';
import { getOfficeById, getSchedules } from '@/lib/data-access';
import { ApiError, handleApiError } from '@/lib/api-error';
import { ExportInputSchema } from '@/lib/contracts/api-schemas';
import type { TimeSlotOutput, ProviderProductionSummary, BlockTypeInput } from '@/lib/engine/types';

interface ExportScheduleEntry {
  dayOfWeek: string;
  variant?: string;
  slots: TimeSlotOutput[];
  productionSummary: ProviderProductionSummary[];
}

/**
 * POST /api/offices/:id/export
 * Generate and download Excel file for an office schedule.
 *
 * Two modes:
 *   1. Body contains `schedules` array — uses client-provided data (legacy).
 *   2. Body contains `weekType` (no schedules) — reads WORKING schedules from DB.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const parsed = ExportInputSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new ApiError(400, 'Invalid request', parsed.error.flatten());
    }
    const parsedBody = parsed.data;

    // Find the office in database
    const office = await getOfficeById(id);

    if (!office) {
      throw new ApiError(404, 'Office not found');
    }

    // Determine schedule data source
    let schedules: ExportScheduleEntry[];

    if (parsedBody.schedules && Array.isArray(parsedBody.schedules)) {
      // Legacy mode: schedules provided in request body
      schedules = parsedBody.schedules as unknown as ExportScheduleEntry[];
    } else {
      // DB mode: read WORKING schedules from database
      const weekType = parsedBody.weekType || 'A';
      const dbSchedules = await getSchedules(id, { weekType, type: 'WORKING' });

      if (dbSchedules.length === 0) {
        throw new ApiError(400, 'No saved schedules found for this office. Generate or save schedules first.');
      }

      schedules = dbSchedules.map((s) => ({
        dayOfWeek: s.dayOfWeek,
        slots: s.slots as TimeSlotOutput[],
        productionSummary: s.productionSummary as ProviderProductionSummary[],
      }));
    }

    // Validate office has required data
    if (!office.providers || !office.blockTypes) {
      throw new ApiError(400, 'Office missing required data (providers or blockTypes)');
    }
    if (office.providers.length === 0) {
      throw new ApiError(400, 'Office must have at least one provider to export schedules');
    }
    if (office.blockTypes.length === 0) {
      throw new ApiError(400, 'Office must have at least one block type to export schedules');
    }

    // Transform data for Excel export
    const exportInput: ExportInput = {
      officeName: office.name,
      providers: office.providers.map(p => ({
        id: p.id,
        name: p.name,
        role: p.role,
        operatories: p.operatories,
        dailyGoal: p.dailyGoal,
        hourlyRate: calculateHourlyRate(p.workingStart, p.workingEnd, p.lunchStart, p.lunchEnd, p.dailyGoal),
        color: p.color,
        goal75: p.dailyGoal * 0.75,
      })),
      blockTypes: office.blockTypes.map(b => ({
        label: b.label,
        description: b.description,
        minimumAmount: b.minimumAmount,
        color: undefined,
      })),
      daySchedules: schedules.map((schedule) => {
        const daySchedule: ExportDaySchedule = {
          dayOfWeek: schedule.dayOfWeek,
          variant: schedule.variant,
          slots: schedule.slots.map((slot) => ({
            time: slot.time,
            providerId: slot.providerId,
            staffingCode: slot.staffingCode,
            blockLabel: slot.blockLabel
              ? formatBlockLabel(slot.blockLabel, office!.blockTypes!, slot.blockTypeId)
              : null,
            isBreak: slot.isBreak,
          })),
          productionSummary: schedule.productionSummary.map((summary) => ({
            providerId: summary.providerId,
            actualScheduled: summary.actualScheduled,
            status: summary.status,
          })),
        };
        return daySchedule;
      }),
    };

    // Generate Excel buffer
    const buffer = await generateExcel(exportInput);

    // Return as downloadable file
    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="Customized Schedule Template - ${office.name}.xlsx"`,
        'Content-Length': buffer.length.toString(),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Calculate hourly rate from working hours and daily goal
 */
function calculateHourlyRate(
  workingStart: string,
  workingEnd: string,
  lunchStart?: string,
  lunchEnd?: string,
  dailyGoal?: number
): number {
  if (!dailyGoal) return 0;

  // Parse times
  const [startHour, startMin] = workingStart.split(':').map(Number);
  const [endHour, endMin] = workingEnd.split(':').map(Number);
  
  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;
  
  let totalMinutes = endMinutes - startMinutes;
  
  // Subtract lunch break
  if (lunchStart && lunchEnd) {
    const [lunchStartHour, lunchStartMin] = lunchStart.split(':').map(Number);
    const [lunchEndHour, lunchEndMin] = lunchEnd.split(':').map(Number);
    const lunchMinutes = (lunchEndHour * 60 + lunchEndMin) - (lunchStartHour * 60 + lunchStartMin);
    totalMinutes -= lunchMinutes;
  }
  
  const hours = totalMinutes / 60;
  return Math.round(dailyGoal / hours);
}

/**
 * Format block label with minimum amount
 */
function formatBlockLabel(
  label: string,
  blockTypes: BlockTypeInput[],
  blockTypeId: string | null
): string {
  if (label === 'LUNCH') return 'LUNCH';
  
  // If label already has ">$" in it, return as is
  if (label.includes('>$')) return label;
  
  // Try to find the block type to get minimum amount
  if (blockTypeId) {
    const blockType = blockTypes.find(bt => bt.id === blockTypeId);
    if (blockType && blockType.minimumAmount && blockType.minimumAmount > 0) {
      return `${label}>$${blockType.minimumAmount}`;
    }
  }
  
  return label;
}

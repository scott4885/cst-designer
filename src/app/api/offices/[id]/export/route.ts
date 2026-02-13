import { NextResponse } from 'next/server';
import { generateExcel, ExportInput, ExportDaySchedule } from '@/lib/export/excel';
import { mockOffices, smileCascadeOffice } from '@/lib/mock-data';
import { getOfficeById } from '@/lib/office-data-store';

/**
 * POST /api/offices/:id/export
 * Generate and download Excel file for an office schedule
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Find the office - check created offices first
    let office = getOfficeById(id);
    
    // Fall back to mock offices
    if (!office) {
      office = mockOffices.find(o => o.id === id);
    }
    
    // For Smile Cascade, use full data
    if (id === '1') {
      office = smileCascadeOffice;
    }
    
    if (!office) {
      return NextResponse.json(
        { error: 'Office not found' },
        { status: 404 }
      );
    }

    // Get schedule data from request body
    const { schedules } = body;
    
    if (!schedules || !Array.isArray(schedules)) {
      return NextResponse.json(
        { error: 'Missing schedules data in request body' },
        { status: 400 }
      );
    }

    // Validate office has required data
    if (!office.providers || !office.blockTypes) {
      return NextResponse.json(
        { error: 'Office missing required data (providers or blockTypes)' },
        { status: 400 }
      );
    }

    // Validate arrays are not empty
    if (office.providers.length === 0) {
      return NextResponse.json(
        { error: 'Office must have at least one provider to export schedules' },
        { status: 400 }
      );
    }

    if (office.blockTypes.length === 0) {
      return NextResponse.json(
        { error: 'Office must have at least one block type to export schedules' },
        { status: 400 }
      );
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
      daySchedules: schedules.map((schedule: any) => {
        const daySchedule: ExportDaySchedule = {
          dayOfWeek: schedule.dayOfWeek,
          variant: schedule.variant,
          slots: schedule.slots.map((slot: any) => ({
            time: slot.time,
            providerId: slot.providerId,
            staffingCode: slot.staffingCode,
            blockLabel: slot.blockLabel 
              ? formatBlockLabel(slot.blockLabel, office!.blockTypes!, slot.blockTypeId)
              : null,
            isBreak: slot.isBreak,
          })),
          productionSummary: schedule.productionSummary.map((summary: any) => ({
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
    console.error('Error exporting schedule:', error);
    return NextResponse.json(
      { error: 'Failed to export schedule', details: String(error) },
      { status: 500 }
    );
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
  blockTypes: any[],
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

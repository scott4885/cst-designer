import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getOffices, createOffice } from '@/lib/data-access';
import { ApiError, handleApiError } from '@/lib/api-error';
import { CreateOfficeInputSchema } from '@/lib/contracts/api-schemas';

/**
 * GET /api/offices
 * Returns list of all offices from database
 */
export async function GET() {
  try {
    const offices = await getOffices();
    return NextResponse.json(offices);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/offices
 * Create a new office in database
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();

    const parsed = CreateOfficeInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, 'Invalid request', parsed.error.flatten());
    }
    const data = parsed.data;

    // Map providers to include IDs (role/days already validated + normalized by Zod)
    const providers = (data.providers || []).map((p) => ({
      id: p.id || randomUUID(),
      name: p.name,
      role: p.role,
      operatories: p.operatories && p.operatories.length > 0 ? p.operatories : ['OP1'],
      workingStart: p.workingHours?.start || '07:00',
      workingEnd: p.workingHours?.end || '18:00',
      lunchStart: p.lunchBreak?.start || '13:00',
      lunchEnd: p.lunchBreak?.end || '14:00',
      dailyGoal: p.dailyGoal ?? 0,
      color: p.color || '#666',
    }));

    // Map block types (role already normalized via Zod enum)
    const blockTypes = (data.blockTypes || []).map((b) => ({
      id: b.id || randomUUID(),
      label: b.label,
      description: b.description || '',
      minimumAmount: b.minimumAmount || 0,
      appliesToRole: b.appliesToRole || b.role || 'BOTH',
      durationMin: b.duration || 30,
      durationMax: b.durationMax || b.duration || 30,
    }));

    // Normalize rules — Zod already validated enum values
    const rules = {
      npModel: data.rules?.npModel || 'DOCTOR_ONLY',
      npBlocksPerDay: data.rules?.npBlocksPerDay ?? 2,
      srpBlocksPerDay: data.rules?.srpBlocksPerDay ?? 2,
      hpPlacement: data.rules?.hpPlacement || 'MORNING',
      doubleBooking: data.rules?.doubleBooking ?? true,
      matrixing: data.rules?.matrixing !== false,
      emergencyHandling: 'ACCESS_BLOCKS' as const,
    };

    // workingDays already normalized to uppercase full-name via Zod
    const workingDays = data.workingDays;

    // Create office in database
    const newOffice = await createOffice({
      name: data.name,
      dpmsSystem: data.dpmsSystem.toUpperCase().replace(' ', '_'),
      workingDays,
      timeIncrement: data.timeIncrement || 10,
      feeModel: data.feeModel || 'UCR',
      providers,
      blockTypes,
      rules,
      schedulingRules: data.schedulingRules || '',
    });

    return NextResponse.json(newOffice, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

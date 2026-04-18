/**
 * Loop 8 — Provider management operations.
 *
 * Pure helpers used by the inline provider drawer, clone action, and
 * bulk-edit-goals modal. Keeping these out of the component makes them
 * independently testable (and component-test-free).
 */
import { z } from 'zod';
import type { ProviderSchedule, ProcedureMix } from '@/lib/engine/types';

/** Shape of one provider row in the edit form's field array. */
export interface ProviderFormEntry {
  id?: string;
  name: string;
  providerId?: string;
  role: 'DOCTOR' | 'HYGIENIST' | 'OTHER';
  operatories: string[];
  columns?: number;
  workingStart: string;
  workingEnd: string;
  lunchEnabled: boolean;
  lunchStart?: string;
  lunchEnd?: string;
  dailyGoal: number;
  color: string;
  seesNewPatients?: boolean;
  enabledBlockTypeIds?: string[];
  assistedHygiene?: boolean;
  providerSchedule?: ProviderSchedule | Record<string, unknown>;
  staggerOffsetMin?: number;
}

/**
 * Build a clone of a provider, ready to drop into the field array (or prefill
 * the drawer). Follows Loop 8 brief:
 *
 * - New UUID (form `id` is left undefined — backend assigns one on save; the
 *   form itself stamps a fresh UUID when it hits onSubmit).
 * - Name gets "(Copy)" suffix (one only — idempotent if the source already
 *   has "(Copy)").
 * - Operatories reset to a single new op the caller chooses (default `OP1`)
 *   to avoid colliding with the source provider's chair time.
 * - All other provider properties preserved: role, working hours, daily
 *   goal, lunch, color, per-day schedule, mixes, columns, stagger, etc.
 */
export function cloneProvider(
  source: ProviderFormEntry,
  options: {
    targetOperatory?: string;
    /** Optional overrides to apply on top of the clone (e.g. mixes). */
    extras?: {
      currentProcedureMix?: ProcedureMix;
      futureProcedureMix?: ProcedureMix;
    };
  } = {}
): ProviderFormEntry & {
  currentProcedureMix?: ProcedureMix;
  futureProcedureMix?: ProcedureMix;
} {
  const { targetOperatory = 'OP1', extras = {} } = options;

  // Name suffix — idempotent. If it already ends with "(Copy)" or "(Copy N)",
  // increment the counter instead of stacking suffixes.
  const copyMatch = source.name.match(/^(.*?)\s*\(Copy(?:\s+(\d+))?\)\s*$/);
  let newName: string;
  if (copyMatch) {
    const base = copyMatch[1];
    const n = copyMatch[2] ? parseInt(copyMatch[2], 10) + 1 : 2;
    newName = `${base} (Copy ${n})`;
  } else {
    newName = `${source.name} (Copy)`;
  }

  return {
    ...source,
    // Drop the database id — the clone is a brand-new provider.
    id: undefined,
    name: newName,
    // Clear providerId (DPMS export id) — the user must assign a new one.
    providerId: '',
    // Preserve role, hours, goal, lunch, color, etc. (spread above).
    operatories: [targetOperatory],
    // Preserve per-day schedule by deep-copying the JSON-ish shape.
    providerSchedule: source.providerSchedule
      ? JSON.parse(JSON.stringify(source.providerSchedule))
      : {},
    ...extras,
  };
}

// ---------------------------------------------------------------------------
// Bulk edit goals — validation
// ---------------------------------------------------------------------------

/**
 * Per-provider daily goal change payload (what the bulk-edit modal emits).
 * The cap of $10,000/day matches the brief; the API-level cap in
 * api-schemas.ts is looser ($100,000) so our modal is the stricter gate.
 */
export const BulkGoalEntrySchema = z.object({
  index: z.number().int().min(0),
  providerId: z.string().optional(),
  dailyGoal: z
    .number({ message: 'Enter a dollar amount' })
    .positive('Goal must be greater than 0')
    .max(10_000, 'Goal cannot exceed $10,000/day'),
});

export const BulkGoalPayloadSchema = z.object({
  entries: z.array(BulkGoalEntrySchema).min(1, 'Update at least one provider'),
});

export type BulkGoalEntry = z.infer<typeof BulkGoalEntrySchema>;
export type BulkGoalPayload = z.infer<typeof BulkGoalPayloadSchema>;

/**
 * Validate a bulk-edit payload and return either the parsed entries or a
 * map of errors keyed by provider index. Shape chosen to fit directly into
 * a form-field error surface.
 */
export function validateBulkGoals(
  raw: unknown
):
  | { ok: true; data: BulkGoalPayload }
  | { ok: false; errors: Record<number, string>; formError?: string } {
  const parsed = BulkGoalPayloadSchema.safeParse(raw);
  if (parsed.success) return { ok: true, data: parsed.data };

  const errors: Record<number, string> = {};
  let formError: string | undefined;
  for (const issue of parsed.error.issues) {
    const [first, secondRaw] = issue.path;
    if (first === 'entries' && typeof secondRaw === 'number') {
      errors[secondRaw] = issue.message;
    } else {
      formError = issue.message;
    }
  }
  return { ok: false, errors, formError };
}

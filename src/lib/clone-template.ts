/**
 * Clone Template Logic — Sprint 12
 *
 * Copies schedule slots from a source office to one or more target offices.
 * Provider matching is done by role + index:
 *   - DOCTOR slot → first available DOCTOR in target by index
 *   - HYGIENIST slot → first available HYGIENIST in target by index
 * Mismatches (e.g. source has 2 doctors, target has 1) are recorded as warnings.
 */
import type { GenerationResult, ProviderInput, TimeSlotOutput } from './engine/types';

export interface CloneOptions {
  /** Days to clone (e.g. ['MONDAY', 'TUESDAY']) */
  days: string[];
  /** Rotation weeks to clone (e.g. ['A', 'B']). Only relevant when rotation is enabled. */
  weeks: string[];
  /** Whether to clone the appointment library (blockTypes). */
  cloneLibrary: boolean;
}

export interface CloneMismatch {
  officeId: string;
  officeName: string;
  message: string;
}

export interface CloneResult {
  officeId: string;
  schedules: Record<string, GenerationResult>; // keyed by dayOfWeek
  mismatches: CloneMismatch[];
  success: boolean;
}

/**
 * Build a provider ID mapping from source → target by role+index.
 * Returns a map of sourceProviderId → targetProviderId (or null if no match).
 */
export function buildProviderMapping(
  sourceProviders: ProviderInput[],
  targetProviders: ProviderInput[]
): Map<string, string | null> {
  const mapping = new Map<string, string | null>();

  // Group providers by role
  const sourceByRole: Record<string, ProviderInput[]> = {};
  const targetByRole: Record<string, ProviderInput[]> = {};

  for (const p of sourceProviders) {
    if (!sourceByRole[p.role]) sourceByRole[p.role] = [];
    sourceByRole[p.role].push(p);
  }
  for (const p of targetProviders) {
    if (!targetByRole[p.role]) targetByRole[p.role] = [];
    targetByRole[p.role].push(p);
  }

  // Map by role + index
  for (const role of Object.keys(sourceByRole)) {
    const srcGroup = sourceByRole[role];
    const tgtGroup = targetByRole[role] ?? [];

    for (let i = 0; i < srcGroup.length; i++) {
      const srcProvider = srcGroup[i];
      const tgtProvider = tgtGroup[i] ?? null;
      mapping.set(srcProvider.id, tgtProvider ? tgtProvider.id : null);
    }
  }

  return mapping;
}

/**
 * Map a single source operatory to the target provider's first operatory.
 */
function mapOperatory(
  sourceOperatory: string,
  sourceProvider: ProviderInput | undefined,
  targetProvider: ProviderInput | undefined
): string {
  if (!targetProvider || !sourceProvider) return sourceOperatory;

  const srcOps = sourceProvider.operatories ?? [];
  const tgtOps = targetProvider.operatories ?? [];

  const srcIdx = srcOps.indexOf(sourceOperatory);
  if (srcIdx === -1) return tgtOps[0] ?? sourceOperatory;

  return tgtOps[srcIdx] ?? tgtOps[0] ?? sourceOperatory;
}

/**
 * Clone a single day's schedule from source providers → target providers.
 * Returns the remapped schedule and a list of unmatched source providers.
 */
export function cloneDaySchedule(
  sourceSchedule: GenerationResult,
  sourceProviders: ProviderInput[],
  targetProviders: ProviderInput[]
): { schedule: GenerationResult; unmatchedSourceIds: string[] } {
  const providerMapping = buildProviderMapping(sourceProviders, targetProviders);
  const unmatchedSourceIds: string[] = [];

  // Find unmatched
  for (const [srcId, tgtId] of providerMapping) {
    if (tgtId === null) unmatchedSourceIds.push(srcId);
  }

  // Build set of target provider IDs for easy lookup
  const targetProviderIds = new Set(targetProviders.map(p => p.id));

  // Remap slots
  const remappedSlots: TimeSlotOutput[] = [];

  for (const slot of sourceSchedule.slots) {
    // Strip virtual "::OP" suffix from slot providerId
    const realSrcId = slot.providerId.includes('::')
      ? slot.providerId.slice(0, slot.providerId.lastIndexOf('::'))
      : slot.providerId;

    const tgtProviderId = providerMapping.get(realSrcId);

    // Skip slots for unmatched providers
    if (tgtProviderId === undefined || tgtProviderId === null) continue;

    // Map operatory
    const srcProvider = sourceProviders.find(p => p.id === realSrcId);
    const tgtProvider = targetProviders.find(p => p.id === tgtProviderId);
    const newOperatory = mapOperatory(slot.operatory, srcProvider, tgtProvider);

    // Skip slots for providers that aren't in target (shouldn't happen but guard)
    if (!targetProviderIds.has(tgtProviderId)) continue;

    remappedSlots.push({
      ...slot,
      providerId: tgtProviderId,
      operatory: newOperatory,
    });
  }

  // Build minimal productionSummary for target providers
  // (will be fully recalculated when the office page loads)
  const productionSummary = targetProviders.map(p => {
    // Find matching source provider to carry over goal
    const srcIdx = Array.from(providerMapping.entries()).find(([, v]) => v === p.id)?.[0];
    const _srcProvider = srcIdx ? sourceProviders.find(sp => sp.id === srcIdx) : undefined;
    void _srcProvider;
    return {
      providerId: p.id,
      providerName: p.name,
      dailyGoal: p.dailyGoal,
      target75: p.dailyGoal * 0.75,
      actualScheduled: 0, // will recalculate on load
      highProductionScheduled: 0,
      status: 'UNDER' as const,
      blocks: [],
    };
  });

  return {
    schedule: {
      dayOfWeek: sourceSchedule.dayOfWeek,
      slots: remappedSlots,
      productionSummary,
      warnings: [...sourceSchedule.warnings],
    },
    unmatchedSourceIds,
  };
}

/**
 * Load schedules for an office from localStorage.
 * Returns a map of dayOfWeek → GenerationResult.
 */
export function loadSchedulesFromStorage(
  officeId: string,
  week: string = 'A'
): Record<string, GenerationResult> {
  if (typeof window === 'undefined') return {};
  try {
    const key = week === 'A'
      ? `schedule-designer:schedule-state:${officeId}`
      : `schedule-designer:schedule-state:${officeId}:week${week}`;
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    // The stored format is Record<string, GenerationResult>
    return parsed as Record<string, GenerationResult>;
  } catch {
    return {};
  }
}

/**
 * Save schedules for an office to localStorage.
 */
export function saveSchedulesToStorage(
  officeId: string,
  schedules: Record<string, GenerationResult>,
  week: string = 'A'
): void {
  if (typeof window === 'undefined') return;
  try {
    const key = week === 'A'
      ? `schedule-designer:schedule-state:${officeId}`
      : `schedule-designer:schedule-state:${officeId}:week${week}`;
    localStorage.setItem(key, JSON.stringify(schedules));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Deep-clone a schedules map so target offices never share references with
 * source offices or localStorage. Uses structuredClone when available and
 * falls back to JSON clone for older runtimes. (Iter 12a fix.)
 */
function deepCloneSchedules(
  schedules: Record<string, GenerationResult>
): Record<string, GenerationResult> {
  if (typeof structuredClone === 'function') {
    return structuredClone(schedules);
  }
  return JSON.parse(JSON.stringify(schedules)) as Record<string, GenerationResult>;
}

/**
 * Perform a full clone operation from source to multiple target offices.
 *
 * @param sourceOfficeId - ID of the source office
 * @param sourceProviders - Providers from the source office
 * @param targetOffices - Array of target offices (each with id, name, providers)
 * @param options - Clone options (days, weeks, cloneLibrary)
 * @returns Array of CloneResult (one per target office)
 */
export function cloneTemplateToOffices(
  sourceOfficeId: string,
  sourceProviders: ProviderInput[],
  targetOffices: Array<{
    id: string;
    name: string;
    providers: ProviderInput[];
  }>,
  options: CloneOptions
): { results: CloneResult[]; totalMismatches: number } {
  const results: CloneResult[] = [];
  let totalMismatches = 0;

  const weeksToProcess = options.weeks.length > 0 ? options.weeks : ['A'];

  for (const targetOffice of targetOffices) {
    const cloneResult: CloneResult = {
      officeId: targetOffice.id,
      schedules: {},
      mismatches: [],
      success: true,
    };

    for (const week of weeksToProcess) {
      // Load source schedules for this week
      const sourceSchedules = loadSchedulesFromStorage(sourceOfficeId, week);

      // Load existing target schedules so we can merge (only overwrite selected days)
      const existingTargetSchedules = loadSchedulesFromStorage(targetOffice.id, week);
      const mergedSchedules = { ...existingTargetSchedules };

      for (const day of options.days) {
        const sourceSchedule = sourceSchedules[day];
        if (!sourceSchedule) continue;

        const { schedule: cloned, unmatchedSourceIds } = cloneDaySchedule(
          sourceSchedule,
          sourceProviders,
          targetOffice.providers
        );

        mergedSchedules[day] = cloned;

        // Record mismatches
        for (const srcId of unmatchedSourceIds) {
          const srcProvider = sourceProviders.find(p => p.id === srcId);
          if (srcProvider) {
            const msg = `Provider "${srcProvider.name}" (${srcProvider.role}) has no matching provider in target office`;
            cloneResult.mismatches.push({
              officeId: targetOffice.id,
              officeName: targetOffice.name,
              message: msg,
            });
            totalMismatches++;
          }
        }
      }

      // Iter 12a fix: Deep-clone the merged schedules before saving and before
      // pushing to cloneResult. Previously, days NOT in options.days were
      // pulled from `existingTargetSchedules` (loaded from localStorage) and
      // carried by reference into every target office's result — mutation of
      // one office's slot later could bleed into another office's state.
      const deepCloned = deepCloneSchedules(mergedSchedules);

      // Also save to localStorage for target office
      saveSchedulesToStorage(targetOffice.id, deepCloned, week);
      // Merge into result (week-agnostic for now). Use another deep clone so
      // cloneResult does NOT share references with what we just persisted,
      // which would let a mutation on the caller side leak into localStorage.
      Object.assign(cloneResult.schedules, deepCloneSchedules(deepCloned));
    }

    results.push(cloneResult);
  }

  return { results, totalMismatches };
}

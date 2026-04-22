/**
 * Block Type Audit Engine — Sprint 16
 *
 * Analyzes which block types are used vs. unused across all saved schedules.
 * Identifies dead config and optimization opportunities.
 *
 * Pure computation — no React/browser dependencies.
 */

import type { BlockTypeInput, ProviderInput } from './engine/types';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface BlockTypeUsage {
  blockTypeId: string;
  name: string;
  useCount: number;
  totalMinutes: number;
  totalProduction: number;
  officeCount: number;
}

export interface OfficeAudit {
  officeId: string;
  officeName: string;
  topBlocks: BlockTypeUsage[];
  totalProduction: number;
  totalMinutes: number;
  blockTypeCount: number;
}

export interface AuditResult {
  totalBlockTypes: number;
  usedBlockTypes: BlockTypeUsage[];
  unusedBlockTypes: BlockTypeInput[];
  overusedCategories: string[];
  underusedCategories: string[];
  topBlocksByProduction: BlockTypeUsage[];
  topBlocksByFrequency: BlockTypeUsage[];
  offices: OfficeAudit[];
}

// ─── Schedule slot type (minimal shape needed for audit) ────────────────────────

export interface AuditSlot {
  blockTypeId: string | null;
  isBreak: boolean;
  providerId?: string;
  blockInstanceId?: string | null;
  customProductionAmount?: number | null;
}

export interface OfficeWithSchedules {
  id: string;
  name: string;
  blockTypes: BlockTypeInput[];
  providers?: ProviderInput[];
  /** Slots keyed by day e.g. { MONDAY: slot[] } */
  schedules: Record<string, AuditSlot[]>;
}

// ─── Category time benchmarks ────────────────────────────────────────────────────

/** Roles to category rough benchmarks — reserved for future audit checks. */
const _CATEGORY_BENCHMARKS_PCT: Record<string, { min: number; max: number }> = {
  DOCTOR: { min: 5, max: 40 },
  HYGIENIST: { min: 5, max: 40 },
};
void _CATEGORY_BENCHMARKS_PCT;

function getBlockTypeCategory(bt: BlockTypeInput): string {
  return bt.appliesToRole;
}

// ─── Main audit function ─────────────────────────────────────────────────────────

export function auditBlockTypes(
  offices: OfficeWithSchedules[],
  globalBlockTypes: BlockTypeInput[]
): AuditResult {
  // All unique block types (from library + all offices)
  const allBlockTypeMap = new Map<string, BlockTypeInput>();
  for (const bt of globalBlockTypes) allBlockTypeMap.set(bt.id, bt);
  for (const office of offices) {
    for (const bt of (office.blockTypes ?? [])) {
      allBlockTypeMap.set(bt.id, bt);
    }
  }

  // Track usage per block type
  const usageMap = new Map<string, {
    name: string;
    useCount: number;
    totalMinutes: number;
    totalProduction: number;
    officeIds: Set<string>;
  }>();

  const officeAudits: OfficeAudit[] = [];

  for (const office of offices) {
    const btMap = new Map<string, BlockTypeInput>();
    for (const bt of (office.blockTypes ?? [])) btMap.set(bt.id, bt);
    // Fall back to global
    for (const [id, bt] of allBlockTypeMap) {
      if (!btMap.has(id)) btMap.set(id, bt);
    }

    const officeUsage = new Map<string, {
      name: string;
      useCount: number;
      totalMinutes: number;
      totalProduction: number;
    }>();

    let officeTotalMinutes = 0;
    let officeTotalProduction = 0;

    // Count instances using blockInstanceId to avoid double-counting
    const seenInstances = new Set<string>();

    for (const [, slots] of Object.entries(office.schedules)) {
      for (const slot of slots) {
        if (!slot.blockTypeId || slot.isBreak) continue;
        const bt = btMap.get(slot.blockTypeId);
        if (!bt) continue;

        // Use blockInstanceId to count each block once
        const instanceKey = slot.blockInstanceId
          ? `${office.id}-${slot.blockInstanceId}`
          : null;

        if (instanceKey) {
          if (seenInstances.has(instanceKey)) continue;
          seenInstances.add(instanceKey);
        }

        const production = slot.customProductionAmount ?? bt.minimumAmount ?? 0;
        const minutes = bt.durationMin;

        // Global tracking
        const existing = usageMap.get(slot.blockTypeId) ?? {
          name: bt.label,
          useCount: 0,
          totalMinutes: 0,
          totalProduction: 0,
          officeIds: new Set<string>(),
        };
        existing.useCount++;
        existing.totalMinutes += minutes;
        existing.totalProduction += production;
        existing.officeIds.add(office.id);
        usageMap.set(slot.blockTypeId, existing);

        // Office-level tracking
        const offExisting = officeUsage.get(slot.blockTypeId) ?? {
          name: bt.label,
          useCount: 0,
          totalMinutes: 0,
          totalProduction: 0,
        };
        offExisting.useCount++;
        offExisting.totalMinutes += minutes;
        offExisting.totalProduction += production;
        officeUsage.set(slot.blockTypeId, offExisting);

        officeTotalMinutes += minutes;
        officeTotalProduction += production;
      }
    }

    // Build office top blocks
    const topBlocks: BlockTypeUsage[] = Array.from(officeUsage.entries())
      .map(([id, u]) => ({
        blockTypeId: id,
        name: u.name,
        useCount: u.useCount,
        totalMinutes: u.totalMinutes,
        totalProduction: u.totalProduction,
        officeCount: 1,
      }))
      .sort((a, b) => b.totalProduction - a.totalProduction)
      .slice(0, 5);

    officeAudits.push({
      officeId: office.id,
      officeName: office.name,
      topBlocks,
      totalProduction: officeTotalProduction,
      totalMinutes: officeTotalMinutes,
      blockTypeCount: officeUsage.size,
    });
  }

  // Build used block types list
  const usedBlockTypes: BlockTypeUsage[] = Array.from(usageMap.entries()).map(
    ([id, u]) => ({
      blockTypeId: id,
      name: u.name,
      useCount: u.useCount,
      totalMinutes: u.totalMinutes,
      totalProduction: u.totalProduction,
      officeCount: u.officeIds.size,
    })
  );

  const usedIds = new Set(usedBlockTypes.map(u => u.blockTypeId));
  const unusedBlockTypes = Array.from(allBlockTypeMap.values()).filter(
    bt => !usedIds.has(bt.id)
  );

  // Category analysis
  const categoryTimeMap = new Map<string, number>();
  let totalScheduledMinutes = 0;

  for (const usage of usedBlockTypes) {
    const bt = allBlockTypeMap.get(usage.blockTypeId);
    if (!bt) continue;
    const cat = getBlockTypeCategory(bt);
    categoryTimeMap.set(cat, (categoryTimeMap.get(cat) ?? 0) + usage.totalMinutes);
    totalScheduledMinutes += usage.totalMinutes;
  }

  const overusedCategories: string[] = [];
  const underusedCategories: string[] = [];

  for (const [cat, minutes] of categoryTimeMap) {
    const pct = totalScheduledMinutes > 0 ? (minutes / totalScheduledMinutes) * 100 : 0;
    if (pct > 40) overusedCategories.push(cat);
    if (pct < 5) underusedCategories.push(cat);
  }

  const topBlocksByProduction = [...usedBlockTypes]
    .sort((a, b) => b.totalProduction - a.totalProduction)
    .slice(0, 5);

  const topBlocksByFrequency = [...usedBlockTypes]
    .sort((a, b) => b.useCount - a.useCount)
    .slice(0, 5);

  return {
    totalBlockTypes: allBlockTypeMap.size,
    usedBlockTypes,
    unusedBlockTypes,
    overusedCategories,
    underusedCategories,
    topBlocksByProduction,
    topBlocksByFrequency,
    offices: officeAudits,
  };
}

// ─── CSV export ───────────────────────────────────────────────────────────────────

export function exportAuditToCSV(result: AuditResult): string {
  const lines: string[] = ['Block Type,Use Count,Total Minutes,Total Production ($),Offices Using,Status'];

  for (const u of result.usedBlockTypes) {
    lines.push([
      `"${u.name}"`,
      u.useCount,
      u.totalMinutes,
      u.totalProduction.toLocaleString(),
      u.officeCount,
      'Used',
    ].join(','));
  }

  for (const bt of result.unusedBlockTypes) {
    lines.push([
      `"${bt.label}"`,
      0,
      0,
      0,
      0,
      'Unused',
    ].join(','));
  }

  return lines.join('\n');
}

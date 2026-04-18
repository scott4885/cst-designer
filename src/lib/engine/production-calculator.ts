/**
 * Production Calculator
 *
 * Handles production target calculation, the 75% rule, per-operatory targets,
 * and production summary generation for the schedule engine.
 *
 * @module production-calculator
 */

import type {
  TimeSlotOutput,
  ProviderInput,
  BlockTypeInput,
  ProviderProductionSummary,
} from './types';
import { calculateTarget75, calculateProductionSummary } from './calculator';
import { parseAmountFromLabel } from './slot-helpers';

// ---------------------------------------------------------------------------
// Production target breakdown
// ---------------------------------------------------------------------------

/** Per-category production targets derived from the 75% daily goal */
export interface ProductionTargets {
  target75: number;
  hpTarget: number;   // 55-70% of target75 (ROCKS)
  npTarget: number;   // 5-10% of target75
  mpTarget: number;   // 15-25% of target75 (SAND)
  erTarget: number;   // 5-10% of target75
}

/**
 * Calculate per-category production targets from a provider's daily goal.
 * Uses the 75% rule: schedule to 75% of daily goal to leave room for emergencies.
 *
 * Default allocation (Rock-Sand-Water):
 *   - HP (Rocks): 60% of 75% target
 *   - MP (Sand): 20%
 *   - NP: 8%
 *   - ER: 5%
 *   - Remaining 7% absorbed by non-prod / rounding
 *
 * @param provider - The provider to calculate targets for
 * @returns Broken-down production targets
 */
export function calculateProductionTargets(provider: ProviderInput): ProductionTargets {
  const target75 = calculateTarget75(provider.dailyGoal);
  return {
    target75,
    hpTarget: target75 * 0.60,
    npTarget: target75 * 0.08,
    mpTarget: target75 * 0.20,
    erTarget: target75 * 0.05,
  };
}

// ---------------------------------------------------------------------------
// Shared production context (multi-operatory doctors)
// ---------------------------------------------------------------------------

/**
 * Recompute a doctor's shared production context from actual placed slots.
 *
 * Uses consecutive-group merge logic (same blockTypeId+operatory = one block)
 * matching the production summary calculation. This corrects over-counting
 * where recordProd() counts each placement individually while the summary
 * merges consecutive same-type blocks.
 *
 * Call AFTER each operatory's block placement so the next op starts with
 * an accurate context.
 *
 * @param slots - The master slots array
 * @param providerId - The doctor's provider ID
 * @param blockTypes - All block type definitions
 * @param ctx - The shared production context to update (mutated in place)
 */
export function recomputeSharedCtxFromSlots(
  slots: TimeSlotOutput[],
  providerId: string,
  blockTypes: BlockTypeInput[],
  ctx: { target: number; produced: number }
): void {
  const btAmountMap = new Map<string, number>(
    blockTypes.map(bt => [bt.id, bt.minimumAmount ?? 0])
  );
  const providerSlots = slots.filter(
    s => s.providerId === providerId && s.blockTypeId !== null && !s.isBreak
  );
  let production = 0;
  let prevKey: string | null = null;
  for (const slot of providerSlots) {
    const key = `${slot.blockTypeId}::${slot.operatory}`;
    if (key !== prevKey) {
      production += btAmountMap.get(slot.blockTypeId!) ?? parseAmountFromLabel(slot.blockLabel ?? '');
      prevKey = key;
    }
  }
  ctx.produced = production;
}

// ---------------------------------------------------------------------------
// Production summary generation
// ---------------------------------------------------------------------------

/**
 * Calculate production summaries for all providers in the schedule.
 * Groups consecutive same-type slots into distinct blocks and sums their production.
 *
 * @param slots - All time slots in the schedule
 * @param providers - All active providers
 * @param blockTypes - All block type definitions
 * @returns Array of ProviderProductionSummary, one per provider
 */
export function calculateAllProductionSummaries(
  slots: TimeSlotOutput[],
  providers: ProviderInput[],
  blockTypes: BlockTypeInput[]
): ProviderProductionSummary[] {
  return providers.map(provider => {
    const providerSlots = slots.filter(s => s.providerId === provider.id && s.blockTypeId !== null && !s.isBreak);

    // Group consecutive slots by (blockTypeId, operatory) to identify distinct blocks
    const blocks: { blockTypeId: string; blockLabel: string; slotCount: number; operatory: string }[] = [];
    let currentKey: string | null = null;

    for (const slot of providerSlots) {
      const key = `${slot.blockTypeId}::${slot.operatory}`;
      if (key !== currentKey) {
        blocks.push({
          blockTypeId: slot.blockTypeId!,
          blockLabel: slot.blockLabel || '',
          slotCount: 1,
          operatory: slot.operatory,
        });
        currentKey = key;
      } else {
        blocks[blocks.length - 1].slotCount++;
      }
    }

    const scheduledBlocks = blocks.map(block => {
      const blockType = blockTypes.find(bt => bt.id === block.blockTypeId);
      const amount = blockType != null
        ? (blockType.minimumAmount ?? 0)
        : parseAmountFromLabel(block.blockLabel);
      return {
        blockTypeId: block.blockTypeId,
        blockLabel: block.blockLabel,
        amount,
        minimumAmount: blockType?.minimumAmount ?? 0,
        operatory: block.operatory,
      };
    });

    const summary = calculateProductionSummary(provider, scheduledBlocks);

    // Per-op production breakdown for multi-op providers
    const opAmounts = new Map<string, number>();
    for (const sb of scheduledBlocks) {
      opAmounts.set(sb.operatory, (opAmounts.get(sb.operatory) ?? 0) + sb.amount);
    }
    const opBreakdown: { operatory: string; amount: number }[] | undefined =
      opAmounts.size > 1
        ? [...opAmounts.entries()].map(([operatory, amount]) => ({ operatory, amount }))
        : undefined;

    return opBreakdown ? { ...summary, opBreakdown } : summary;
  });
}

/**
 * Compute the production already scheduled for a provider in a specific operatory.
 * Walks consecutive same-blockTypeId runs and sums their minimumAmount values.
 *
 * @param slots - The master slots array
 * @param ps - Provider+operatory slot group
 * @param blocksByCategory - Map of category to block types (for amount lookup)
 * @returns Total production scheduled in dollars
 */
export function computeCurrentOpProduction(
  slots: TimeSlotOutput[],
  ps: { provider: ProviderInput; operatory: string },
  blocksByCategory: Map<string, BlockTypeInput[]>
): number {
  const btAmountMap = new Map<string, number>();
  for (const bts of blocksByCategory.values()) {
    for (const bt of bts) {
      btAmountMap.set(bt.id, bt.minimumAmount ?? 0);
    }
  }
  const opSlots = slots.filter(
    s => s.providerId === ps.provider.id && s.operatory === ps.operatory && s.blockTypeId && !s.isBreak
  );
  let total = 0;
  let currentBlockId: string | null = null;
  for (const slot of opSlots) {
    if (slot.blockTypeId !== currentBlockId) {
      total += btAmountMap.get(slot.blockTypeId!) ?? 0;
      currentBlockId = slot.blockTypeId;
    }
  }
  return total;
}

import type { TimeSlotOutput, GenerationResult, ScheduleRules, ProviderProductionSummary } from './types';

/**
 * Validate that there are no overlapping blocks
 */
export function validateNoOverlaps(slots: TimeSlotOutput[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Group slots by provider and time
  const providerTimeMap = new Map<string, Map<string, TimeSlotOutput>>();
  
  for (const slot of slots) {
    if (!providerTimeMap.has(slot.providerId)) {
      providerTimeMap.set(slot.providerId, new Map());
    }
    
    const timeMap = providerTimeMap.get(slot.providerId)!;
    
    if (timeMap.has(slot.time)) {
      const existing = timeMap.get(slot.time)!;
      if (existing.blockTypeId !== null && slot.blockTypeId !== null) {
        errors.push(
          `Overlap detected for provider ${slot.providerId} at ${slot.time}: ` +
          `${existing.blockLabel} and ${slot.blockLabel}`
        );
      }
    }
    
    timeMap.set(slot.time, slot);
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate production minimums are met
 */
export function validateProductionMinimums(
  summary: ProviderProductionSummary[]
): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];
  
  for (const provider of summary) {
    if (provider.status === 'UNDER') {
      warnings.push(
        `${provider.providerName}: Production under target ` +
        `(scheduled: $${provider.actualScheduled.toFixed(2)}, ` +
        `target: $${provider.target75.toFixed(2)})`
      );
    } else if (provider.status === 'OVER') {
      warnings.push(
        `${provider.providerName}: Production over target ` +
        `(scheduled: $${provider.actualScheduled.toFixed(2)}, ` +
        `target: $${provider.target75.toFixed(2)})`
      );
    }
  }
  
  return {
    valid: warnings.length === 0,
    warnings
  };
}

/**
 * Validate block placement follows rules
 */
export function validateBlockPlacement(
  slots: TimeSlotOutput[],
  rules: ScheduleRules
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Count NP blocks
  const npSlots = slots.filter(s => 
    s.blockLabel && s.blockLabel.toUpperCase().includes('NP')
  );
  
  // Only count unique NP blocks (consecutive slots with same blockTypeId count as one)
  const uniqueNpBlocks = new Set<string>();
  for (let i = 0; i < npSlots.length; i++) {
    const slot = npSlots[i];
    const key = `${slot.providerId}-${slot.blockTypeId}-${slot.time}`;
    
    // Check if this is the start of a new block
    if (i === 0 || npSlots[i - 1].providerId !== slot.providerId || 
        npSlots[i - 1].blockTypeId !== slot.blockTypeId) {
      uniqueNpBlocks.add(key);
    }
  }
  
  if (uniqueNpBlocks.size === 0 && rules.npBlocksPerDay > 0) {
    errors.push('No NP blocks found (rule requires at least one)');
  }
  
  // Count SRP blocks
  const srpSlots = slots.filter(s => 
    s.blockLabel && s.blockLabel.toUpperCase().includes('SRP')
  );
  
  const uniqueSrpBlocks = new Set<string>();
  for (let i = 0; i < srpSlots.length; i++) {
    const slot = srpSlots[i];
    const key = `${slot.providerId}-${slot.blockTypeId}-${slot.time}`;
    
    if (i === 0 || srpSlots[i - 1].providerId !== slot.providerId || 
        srpSlots[i - 1].blockTypeId !== slot.blockTypeId) {
      uniqueSrpBlocks.add(key);
    }
  }
  
  // Check if lunch breaks are properly marked
  const lunchSlots = slots.filter(s => s.isBreak && s.blockLabel === 'LUNCH');
  if (lunchSlots.length === 0) {
    // This might be okay if provider doesn't have lunch configured
  }
  
  // Validate no blocks during lunch
  const blocksAtLunch = slots.filter(s => 
    s.isBreak && s.blockTypeId !== null && s.blockLabel !== 'LUNCH'
  );
  
  if (blocksAtLunch.length > 0) {
    errors.push('Blocks found during lunch break');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate entire schedule
 */
export function validateSchedule(
  result: GenerationResult,
  rules: ScheduleRules
): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [...result.warnings];
  
  // Check for overlaps
  const overlapValidation = validateNoOverlaps(result.slots);
  if (!overlapValidation.valid) {
    errors.push(...overlapValidation.errors);
  }
  
  // Check production minimums
  const productionValidation = validateProductionMinimums(result.productionSummary);
  if (!productionValidation.valid) {
    warnings.push(...productionValidation.warnings);
  }
  
  // Check block placement
  const placementValidation = validateBlockPlacement(result.slots, rules);
  if (!placementValidation.valid) {
    errors.push(...placementValidation.errors);
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

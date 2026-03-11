import type { BlockTypeInput, ProviderInput, ProviderProductionSummary } from './types';

/**
 * Calculate 75% of daily goal (production target)
 */
export function calculateTarget75(dailyGoal: number): number {
  return dailyGoal * 0.75;
}

/**
 * Calculate hourly production rate
 */
export function calculateHourlyRate(dailyGoal: number, hoursWorked: number): number {
  if (hoursWorked <= 0) return 0;
  return dailyGoal / hoursWorked;
}

/**
 * Distribute block minimums across block types based on 75% rule
 * - HP blocks get 60-70% of target
 * - NP blocks get 15-20%
 * - SRP blocks get 15-20%
 */
export function distributeBlockMinimums(
  target75: number,
  blockTypes: BlockTypeInput[],
  role: 'DOCTOR' | 'HYGIENIST'
): { blockTypeId: string; minimumAmount: number; count: number }[] {
  const distribution: { blockTypeId: string; minimumAmount: number; count: number }[] = [];

  // Filter block types applicable to this role
  const applicableBlocks = blockTypes.filter(
    bt => bt.appliesToRole === role || bt.appliesToRole === 'BOTH'
  );

  if (applicableBlocks.length === 0) {
    return [];
  }

  // Find HP, NP, SRP blocks
  const hpBlocks = applicableBlocks.filter(bt => bt.label.toUpperCase().includes('HP'));
  const npBlocks = applicableBlocks.filter(bt => bt.label.toUpperCase().includes('NP'));
  const srpBlocks = applicableBlocks.filter(bt => bt.label.toUpperCase().includes('SRP'));

  // Distribution percentages per TASK.md Rock-Sand-Water framework:
  // Doctor: HP 55-70%, NP 15-20%, MP 10-15%, ER 5-10%, NON-PROD 0-5%
  // Hygienist: HP 60-70%, NP 15-20%, SRP 15-20%
  const hpPercent = 0.65; // 65% for HP (ROCKS)
  const npPercent = 0.18; // 18% for NP
  const srpPercent = 0.17; // 17% for SRP (hygienist rocks)

  // HP blocks (65% of target)
  if (hpBlocks.length > 0) {
    const hpTotal = target75 * hpPercent;
    const hpBlock = hpBlocks[0];
    const hpCount = role === 'DOCTOR' ? 3 : 4; // Doctors: 3 HP blocks, Hygienists: 4 HP blocks
    const hpMinimum = Math.round(hpTotal / hpCount);

    distribution.push({
      blockTypeId: hpBlock.id,
      minimumAmount: hpMinimum,
      count: hpCount
    });
  }

  // NP blocks (18% of target)
  if (npBlocks.length > 0) {
    const npTotal = target75 * npPercent;
    const npBlock = npBlocks[0];
    const npCount = 1;
    const npMinimum = Math.round(npTotal / npCount);

    distribution.push({
      blockTypeId: npBlock.id,
      minimumAmount: npMinimum,
      count: npCount
    });
  }

  // SRP blocks (hygienist rocks — morning)
  if (role === 'HYGIENIST' && srpBlocks.length > 0) {
    const srpTotal = target75 * srpPercent;
    const srpBlock = srpBlocks[0];
    const srpCount = 1;
    const srpMinimum = Math.round(srpTotal / srpCount);

    distribution.push({
      blockTypeId: srpBlock.id,
      minimumAmount: srpMinimum,
      count: srpCount
    });
  }

  return distribution;
}

/**
 * Calculate production summary for a provider
 */
export function calculateProductionSummary(
  provider: ProviderInput,
  scheduledBlocks: { blockTypeId: string; blockLabel: string; amount: number; minimumAmount?: number }[]
): ProviderProductionSummary {
  const target75 = calculateTarget75(provider.dailyGoal);

  // Group blocks by label and sum amounts
  const blockMap = new Map<string, { amount: number; count: number }>();
  
  for (const block of scheduledBlocks) {
    const existing = blockMap.get(block.blockLabel) || { amount: 0, count: 0 };
    blockMap.set(block.blockLabel, {
      amount: existing.amount + block.amount,
      count: existing.count + 1
    });
  }

  const blocks = Array.from(blockMap.entries()).map(([label, data]) => ({
    label,
    amount: data.amount,
    count: data.count
  }));

  // Calculate total scheduled production
  const actualScheduled = blocks.reduce((sum, b) => sum + b.amount, 0);

  // Calculate high production scheduled — role-based thresholds (§6.2):
  // Doctor: minimumAmount >= $1,000 | Hygienist: minimumAmount >= $300
  const hpThreshold = provider.role === 'HYGIENIST' ? 300 : 1000;
  const highProductionScheduled = scheduledBlocks
    .filter(b => (b.minimumAmount ?? 0) >= hpThreshold)
    .reduce((sum, b) => sum + b.amount, 0);

  // Determine status
  let status: 'MET' | 'UNDER' | 'OVER' = 'MET';
  if (actualScheduled < target75 * 0.95) {
    status = 'UNDER'; // Under if less than 95% of target
  } else if (actualScheduled > target75 * 1.1) {
    status = 'OVER'; // Over if more than 110% of target
  }

  return {
    providerId: provider.id,
    providerName: provider.name,
    dailyGoal: provider.dailyGoal,
    target75,
    actualScheduled,
    highProductionScheduled,
    status,
    blocks
  };
}

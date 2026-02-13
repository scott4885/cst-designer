import type {
  GenerationInput,
  GenerationResult,
  TimeSlotOutput,
  ProviderInput,
  BlockTypeInput,
  StaffingCode
} from './types';
import { calculateTarget75, distributeBlockMinimums, calculateProductionSummary } from './calculator';

/**
 * Generate time slots from start to end in specified increments
 */
export function generateTimeSlots(start: string, end: string, increment: number): string[] {
  const slots: string[] = [];
  
  // Parse start and end times
  const [startHour, startMin] = start.split(':').map(Number);
  const [endHour, endMin] = end.split(':').map(Number);
  
  let currentMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;
  
  while (currentMinutes < endMinutes) {
    const hours = Math.floor(currentMinutes / 60);
    const minutes = currentMinutes % 60;
    slots.push(`${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`);
    currentMinutes += increment;
  }
  
  return slots;
}

/**
 * Check if a time falls within lunch break
 */
export function isLunchTime(time: string, lunchStart?: string, lunchEnd?: string): boolean {
  if (!lunchStart || !lunchEnd) return false;
  
  const [timeHour, timeMin] = time.split(':').map(Number);
  const [lunchStartHour, lunchStartMin] = lunchStart.split(':').map(Number);
  const [lunchEndHour, lunchEndMin] = lunchEnd.split(':').map(Number);
  
  const timeMinutes = timeHour * 60 + timeMin;
  const lunchStartMinutes = lunchStartHour * 60 + lunchStartMin;
  const lunchEndMinutes = lunchEndHour * 60 + lunchEndMin;
  
  return timeMinutes >= lunchStartMinutes && timeMinutes < lunchEndMinutes;
}

/**
 * Find available slots for a provider to place a block
 */
export function findAvailableSlots(
  slots: TimeSlotOutput[],
  provider: ProviderInput,
  duration: number,
  timeIncrement: number
): number[] {
  const availableIndices: number[] = [];
  const slotsNeeded = Math.ceil(duration / timeIncrement);
  
  // Filter to provider's slots only
  const providerSlots = slots.filter(s => s.providerId === provider.id);
  
  for (let i = 0; i <= providerSlots.length - slotsNeeded; i++) {
    let allAvailable = true;
    
    // Check if consecutive slots are available
    for (let j = 0; j < slotsNeeded; j++) {
      const slot = providerSlots[i + j];
      if (slot.blockTypeId !== null || slot.isBreak) {
        allAvailable = false;
        break;
      }
    }
    
    if (allAvailable) {
      // Find the actual index in the full slots array
      const actualIndex = slots.indexOf(providerSlots[i]);
      availableIndices.push(actualIndex);
    }
  }
  
  return availableIndices;
}

/**
 * Place a block in the schedule
 */
export function placeBlock(
  slots: TimeSlotOutput[],
  startIndex: number,
  duration: number,
  provider: ProviderInput,
  blockType: BlockTypeInput,
  timeIncrement: number
): void {
  const slotsNeeded = Math.ceil(duration / timeIncrement);
  
  for (let i = 0; i < slotsNeeded; i++) {
    const slotIndex = startIndex + i;
    if (slotIndex < slots.length && slots[slotIndex].providerId === provider.id) {
      slots[slotIndex].blockTypeId = blockType.id;
      slots[slotIndex].blockLabel = blockType.label;
      slots[slotIndex].staffingCode = getStaffingCode(provider.role);
    }
  }
}

/**
 * Get staffing code based on provider role
 */
export function getStaffingCode(role: 'DOCTOR' | 'HYGIENIST'): StaffingCode {
  return role === 'DOCTOR' ? 'D' : 'H';
}

/**
 * Main schedule generation function
 */
export function generateSchedule(input: GenerationInput): GenerationResult {
  const { providers, blockTypes, rules, timeIncrement, dayOfWeek } = input;
  const warnings: string[] = [];
  const slots: TimeSlotOutput[] = [];
  
  // Step 1: Generate time slots for each provider
  for (const provider of providers) {
    const timeSlots = generateTimeSlots(provider.workingStart, provider.workingEnd, timeIncrement);
    
    for (const time of timeSlots) {
      // Use first operatory for now (can enhance for multi-operatory)
      const operatory = provider.operatories[0] || 'OP1';
      
      // Check if lunch time
      const isLunch = isLunchTime(time, provider.lunchStart, provider.lunchEnd);
      
      slots.push({
        time,
        providerId: provider.id,
        operatory,
        staffingCode: isLunch ? null : getStaffingCode(provider.role),
        blockTypeId: null,
        blockLabel: isLunch ? 'LUNCH' : null,
        isBreak: isLunch
      });
    }
  }
  
  // Step 2: Calculate production targets and block distributions
  const providerDistributions = new Map<string, ReturnType<typeof distributeBlockMinimums>>();
  
  for (const provider of providers) {
    const target75 = calculateTarget75(provider.dailyGoal);
    const distribution = distributeBlockMinimums(target75, blockTypes, provider.role);
    providerDistributions.set(provider.id, distribution);
  }
  
  // Step 3: Place NP blocks per NP model rule
  const npBlocks = blockTypes.filter(bt => bt.label.toUpperCase().includes('NP'));
  
  if (npBlocks.length > 0) {
    const npBlock = npBlocks[0];
    let npCount = 0;
    
    for (const provider of providers) {
      // Check if NP blocks should be placed for this provider
      const shouldPlaceNP = 
        (rules.npModel === 'DOCTOR_ONLY' && provider.role === 'DOCTOR') ||
        (rules.npModel === 'HYGIENIST_ONLY' && provider.role === 'HYGIENIST') ||
        (rules.npModel === 'EITHER');
      
      if (shouldPlaceNP && npCount < rules.npBlocksPerDay) {
        const availableSlots = findAvailableSlots(slots, provider, npBlock.durationMin, timeIncrement);
        
        // Prefer morning slots (before 11:00 AM)
        const morningSlots = availableSlots.filter(idx => {
          const time = slots[idx].time;
          const [hour] = time.split(':').map(Number);
          return hour < 11;
        });
        
        const targetSlots = morningSlots.length > 0 ? morningSlots : availableSlots;
        
        if (targetSlots.length > 0) {
          placeBlock(slots, targetSlots[0], npBlock.durationMin, provider, npBlock, timeIncrement);
          npCount++;
        }
      }
    }
    
    if (npCount === 0) {
      warnings.push('No NP blocks could be placed');
    }
  }
  
  // Step 4: Place SRP blocks in hygienist columns
  const srpBlocks = blockTypes.filter(bt => bt.label.toUpperCase().includes('SRP'));
  const hygienists = providers.filter(p => p.role === 'HYGIENIST');
  
  if (srpBlocks.length > 0 && hygienists.length > 0) {
    const srpBlock = srpBlocks[0];
    let srpCount = 0;
    
    for (const hygienist of hygienists) {
      if (srpCount < rules.srpBlocksPerDay) {
        const availableSlots = findAvailableSlots(slots, hygienist, srpBlock.durationMin, timeIncrement);
        
        if (availableSlots.length > 0) {
          // Place in mid-morning or early afternoon
          const preferredSlots = availableSlots.filter(idx => {
            const time = slots[idx].time;
            const [hour] = time.split(':').map(Number);
            return hour >= 9 && hour <= 14;
          });
          
          const targetSlots = preferredSlots.length > 0 ? preferredSlots : availableSlots;
          
          if (targetSlots.length > 0) {
            placeBlock(slots, targetSlots[0], srpBlock.durationMin, hygienist, srpBlock, timeIncrement);
            srpCount++;
          }
        }
      }
    }
  }
  
  // Step 5: Place HP blocks per placement preference
  const hpBlocks = blockTypes.filter(bt => bt.label.toUpperCase().includes('HP'));
  
  if (hpBlocks.length > 0) {
    const hpBlock = hpBlocks[0];
    
    for (const provider of providers) {
      const distribution = providerDistributions.get(provider.id) || [];
      const hpDistribution = distribution.find(d => d.blockTypeId === hpBlock.id);
      
      if (hpDistribution) {
        let placed = 0;
        
        while (placed < hpDistribution.count) {
          const availableSlots = findAvailableSlots(slots, provider, hpBlock.durationMin, timeIncrement);
          
          if (availableSlots.length === 0) break;
          
          // Apply placement preference
          let targetSlots = availableSlots;
          
          if (rules.hpPlacement === 'MORNING') {
            const morningSlots = availableSlots.filter(idx => {
              const time = slots[idx].time;
              const [hour] = time.split(':').map(Number);
              return hour < 12;
            });
            targetSlots = morningSlots.length > 0 ? morningSlots : availableSlots;
          } else if (rules.hpPlacement === 'AFTERNOON') {
            const afternoonSlots = availableSlots.filter(idx => {
              const time = slots[idx].time;
              const [hour] = time.split(':').map(Number);
              return hour >= 14;
            });
            targetSlots = afternoonSlots.length > 0 ? afternoonSlots : availableSlots;
          }
          
          if (targetSlots.length > 0) {
            placeBlock(slots, targetSlots[0], hpBlock.durationMin, provider, hpBlock, timeIncrement);
            placed++;
          } else {
            break;
          }
        }
        
        if (placed < hpDistribution.count) {
          warnings.push(`Could only place ${placed}/${hpDistribution.count} HP blocks for ${provider.name}`);
        }
      }
    }
  }
  
  // Step 6: Calculate production summary
  const productionSummary = providers.map(provider => {
    const providerSlots = slots.filter(s => s.providerId === provider.id && s.blockTypeId !== null);
    
    const scheduledBlocks = providerSlots
      .filter((slot, idx, arr) => {
        // Only count the first slot of each block to avoid duplicates
        return idx === 0 || slot.blockTypeId !== arr[idx - 1].blockTypeId;
      })
      .map(slot => {
        const blockType = blockTypes.find(bt => bt.id === slot.blockTypeId);
        const distribution = providerDistributions.get(provider.id) || [];
        const blockDist = distribution.find(d => d.blockTypeId === slot.blockTypeId);
        
        return {
          blockTypeId: slot.blockTypeId!,
          blockLabel: slot.blockLabel!,
          amount: blockDist?.minimumAmount || blockType?.minimumAmount || 0
        };
      });
    
    return calculateProductionSummary(provider, scheduledBlocks);
  });
  
  return {
    dayOfWeek,
    slots,
    productionSummary,
    warnings
  };
}

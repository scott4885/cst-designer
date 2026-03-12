/**
 * Appointment Recall Optimizer — Sprint 17, Task 1
 *
 * Calculates hygiene recall capacity for a practice and compares it to
 * the practice's recall needs based on active patient count and recall interval.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RecallInput {
  /** Number of hygienists working recall appointments */
  hygienistCount: number;
  /** Average working days per week (typically 4 or 5) */
  daysPerWeek: number;
  /** Number of hygiene recall blocks per day per hygienist */
  hygieneBlocksPerDay: number;
  /** Average hygiene appointment duration in minutes (default 60) */
  avgBlockDurationMin: number;
  /** Total active patients in the practice */
  activePatientCount: number;
  /** Recall interval in months (default 6) */
  recallIntervalMonths: number;
}

export interface OfficeRecallSnapshot {
  officeId: string;
  officeName: string;
  hygienistCount: number;
  monthlySlotsAvailable: number;
  monthlyRecallNeed: number;
  surplusOrDeficit: number;
  npGrowthCapacity: number;
  utilizationPct: number; // recallNeed / slotsAvailable * 100
}

export interface RecallCapacityResult {
  monthlySlotsAvailable: number;
  monthlyRecallNeed: number;
  surplusOrDeficit: number;
  npGrowthCapacity: number;
  /** Recall slots used / available as a percentage */
  utilizationPct: number;
  recommendations: string[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const WEEKS_PER_MONTH = 52 / 12; // ≈ 4.333

/** Benchmark: a healthy GP practice fills 30–40% of active patients/month for recall */
export const RECALL_BENCHMARK_LOW_PCT = 30;
export const RECALL_BENCHMARK_HIGH_PCT = 40;

// ─── Core Calculator ──────────────────────────────────────────────────────────

/**
 * Calculate recall capacity from hygiene parameters and compare to patient need.
 */
export function calculateRecallCapacity(input: RecallInput): RecallCapacityResult {
  const {
    hygienistCount,
    daysPerWeek,
    hygieneBlocksPerDay,
    activePatientCount,
    recallIntervalMonths,
  } = input;

  // Monthly slots available = hygienists × days/week × weeks/month × blocks/day
  const monthlySlotsAvailable = Math.round(
    hygienistCount * daysPerWeek * WEEKS_PER_MONTH * hygieneBlocksPerDay
  );

  // Monthly recall need = active patients ÷ recall interval
  const monthlyRecallNeed = recallIntervalMonths > 0
    ? Math.round(activePatientCount / recallIntervalMonths)
    : activePatientCount;

  const surplusOrDeficit = monthlySlotsAvailable - monthlyRecallNeed;
  const npGrowthCapacity = Math.max(0, surplusOrDeficit);

  const utilizationPct = monthlySlotsAvailable > 0
    ? Math.round((monthlyRecallNeed / monthlySlotsAvailable) * 100)
    : 0;

  const recommendations = buildRecommendations(
    monthlySlotsAvailable,
    monthlyRecallNeed,
    surplusOrDeficit,
    npGrowthCapacity,
    hygienistCount,
    daysPerWeek,
    hygieneBlocksPerDay,
    activePatientCount
  );

  return {
    monthlySlotsAvailable,
    monthlyRecallNeed,
    surplusOrDeficit,
    npGrowthCapacity,
    utilizationPct,
    recommendations,
  };
}

/**
 * Build recommendation strings based on recall metrics.
 */
function buildRecommendations(
  monthlySlotsAvailable: number,
  monthlyRecallNeed: number,
  surplusOrDeficit: number,
  npGrowthCapacity: number,
  hygienistCount: number,
  daysPerWeek: number,
  hygieneBlocksPerDay: number,
  activePatientCount: number
): string[] {
  const recs: string[] = [];

  // Capacity summary
  recs.push(
    `Your hygiene capacity supports ~${monthlySlotsAvailable.toLocaleString()} recall patients/month.`
  );

  // Patient need summary
  recs.push(
    `For ${activePatientCount.toLocaleString()} active patients on 6-month recall, you need ${monthlyRecallNeed.toLocaleString()} recall slots/month — you have ${monthlySlotsAvailable.toLocaleString()}, leaving ${npGrowthCapacity.toLocaleString()} for NP growth.`
  );

  if (surplusOrDeficit < 0) {
    // Deficit: need more capacity
    const deficit = Math.abs(surplusOrDeficit);
    // How many extra blocks per day to close the gap?
    const extraBlocksNeeded = Math.ceil(deficit / (hygienistCount * daysPerWeek * WEEKS_PER_MONTH));
    recs.push(
      `⚠️ You are short ${deficit.toLocaleString()} recall slots/month. Consider adding ${extraBlocksNeeded} hygiene block(s) per day to close the gap.`
    );
    // Suggest adding a hygiene block on the slowest day
    recs.push(
      `Consider adding 1 hygiene block per day on a lighter day to increase capacity by ~${Math.round(daysPerWeek * WEEKS_PER_MONTH)} slots/month.`
    );
  } else if (surplusOrDeficit < 30) {
    recs.push(
      `✓ Recall capacity is tight — only ${surplusOrDeficit.toLocaleString()} surplus slots. Monitor hygiene utilization weekly.`
    );
  } else {
    const addingOneBlockGain = Math.round(hygienistCount * daysPerWeek * WEEKS_PER_MONTH);
    recs.push(
      `✓ Recall compliance is healthy. ${npGrowthCapacity.toLocaleString()} surplus slots can support new patient growth.`
    );
    if (surplusOrDeficit > addingOneBlockGain * 2) {
      recs.push(
        `You have significant excess capacity — consider whether reducing hygiene blocks or adding a hygienist for NP-focused appointments makes sense.`
      );
    }
  }

  return recs;
}

/**
 * Build recall snapshots for multiple offices given their hygiene provider data.
 */
export interface OfficeHygieneData {
  officeId: string;
  officeName: string;
  hygienistCount: number;
  workingDays: string[]; // e.g. ["MONDAY","TUESDAY","WEDNESDAY","THURSDAY","FRIDAY"]
  hygieneBlocksPerDay: number;
  avgBlockDurationMin: number;
  activePatientCount: number;
  recallIntervalMonths: number;
}

export function buildOrgRecallSnapshot(offices: OfficeHygieneData[]): OfficeRecallSnapshot[] {
  return offices.map((o) => {
    const result = calculateRecallCapacity({
      hygienistCount: o.hygienistCount,
      daysPerWeek: o.workingDays.length,
      hygieneBlocksPerDay: o.hygieneBlocksPerDay,
      avgBlockDurationMin: o.avgBlockDurationMin,
      activePatientCount: o.activePatientCount,
      recallIntervalMonths: o.recallIntervalMonths,
    });
    return {
      officeId: o.officeId,
      officeName: o.officeName,
      hygienistCount: o.hygienistCount,
      monthlySlotsAvailable: result.monthlySlotsAvailable,
      monthlyRecallNeed: result.monthlyRecallNeed,
      surplusOrDeficit: result.surplusOrDeficit,
      npGrowthCapacity: result.npGrowthCapacity,
      utilizationPct: result.utilizationPct,
    };
  });
}

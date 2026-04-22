import { describe, it, expect } from 'vitest';
import { POLICIES, getPolicy, pickBlockMixForGoal, isMorningMinute, NOON_MIN } from '../production-policy';

describe('production-policy — POLICIES registry', () => {
  it('exposes all four canonical policies with label + targetPrimaryPct', () => {
    expect(POLICIES.JAMESON_50.targetPrimaryPct).toBe(0.5);
    expect(POLICIES.LEVIN_60.targetPrimaryPct).toBe(0.6);
    expect(POLICIES.FARRAN_75_BY_NOON.targetPrimaryPct).toBe(0.75);
    expect(POLICIES.CUSTOM).toBeDefined();
  });

  it('uses noon as the default morning cutoff', () => {
    for (const key of Object.keys(POLICIES) as Array<keyof typeof POLICIES>) {
      expect(POLICIES[key].morningCutoffMin).toBe(NOON_MIN);
    }
  });

  it('FARRAN demands more protected AM rocks than JAMESON', () => {
    const farran = getPolicy('FARRAN_75_BY_NOON').protectedRockBlocks!.am;
    const jameson = getPolicy('JAMESON_50').protectedRockBlocks!.am;
    expect(farran).toBeGreaterThanOrEqual(jameson);
  });
});

describe('production-policy — pickBlockMixForGoal', () => {
  it('JAMESON_50 with $5000 goal returns ~50% Rock dollars', () => {
    const mix = pickBlockMixForGoal({
      dailyGoal: 5000,
      rockAvgDollars: 1500,
      sandAvgDollars: 400,
      maxBlocks: 15,
      policy: 'JAMESON_50',
    });
    const rockShare = mix.rockDollars / (mix.rockDollars + mix.sandDollars);
    expect(rockShare).toBeGreaterThan(0.45);
    expect(rockShare).toBeLessThan(0.85); // ceil rounding can bump share
    expect(mix.rockCount).toBe(2); // ceil(2500/1500) = 2
    expect(mix.sandCount).toBe(7); // ceil(2500/400) = 7
  });

  it('FARRAN_75_BY_NOON drives more rock blocks than JAMESON_50 at same goal', () => {
    const jameson = pickBlockMixForGoal({
      dailyGoal: 6000,
      rockAvgDollars: 1500,
      sandAvgDollars: 400,
      maxBlocks: 20,
      policy: 'JAMESON_50',
    });
    const farran = pickBlockMixForGoal({
      dailyGoal: 6000,
      rockAvgDollars: 1500,
      sandAvgDollars: 400,
      maxBlocks: 20,
      policy: 'FARRAN_75_BY_NOON',
    });
    expect(farran.rockCount).toBeGreaterThanOrEqual(jameson.rockCount);
  });

  it('warns when blocks needed exceed maxBlocks', () => {
    const mix = pickBlockMixForGoal({
      dailyGoal: 10000,
      rockAvgDollars: 1500,
      sandAvgDollars: 400,
      maxBlocks: 3, // deliberately too small
      policy: 'FARRAN_75_BY_NOON',
    });
    expect(mix.warnings.length).toBeGreaterThan(0);
  });
});

describe('production-policy — isMorningMinute', () => {
  it('11:59am is morning, 12:00pm is afternoon', () => {
    expect(isMorningMinute(11 * 60 + 59, 'JAMESON_50')).toBe(true);
    expect(isMorningMinute(12 * 60, 'JAMESON_50')).toBe(false);
  });
});

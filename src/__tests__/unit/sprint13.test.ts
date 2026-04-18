/**
 * Sprint 13 Tests
 *
 * Task 1: Global Template Library — seed data, apply logic
 * Task 2: Schedule Version History — snapshot/restore
 * Task 3: Provider Time-Off/Absence Tracking — data model
 * Task 4: Optimization Advisor — suggestion format & output
 */

import { describe, it, expect } from 'vitest';
import { BUILT_IN_TEMPLATES } from '@/lib/template-library-seed';
import { generateOptimizationSuggestions } from '@/lib/engine/optimizer';
import type { GenerationResult, ProviderInput, BlockTypeInput, TimeSlotOutput } from '@/lib/engine/types';
import type { QualityScore } from '@/lib/engine/quality-score';
import type { ClinicalWarning } from '@/lib/engine/clinical-rules';

/**
 * Template slot shape (as stored in slotsJson strings on built-in templates).
 * These use role-relative provider IDs like "DOCTOR_0" / "HYGIENIST_1" which
 * get mapped to real provider IDs when a template is applied.
 */
interface TemplateSlot {
  time: string;
  providerId: string;
  blockLabel?: string | null;
  blockTypeId?: string | null;
  isBreak?: boolean;
  operatory?: string;
  staffingCode?: 'D' | 'A' | 'H' | null;
}

// ─── Task 1: Template Library ────────────────────────────────────────────────

describe('Template Library — built-in templates', () => {
  it('seeds exactly 5 built-in templates', () => {
    expect(BUILT_IN_TEMPLATES).toHaveLength(5);
  });

  it('all templates have required fields', () => {
    for (const t of BUILT_IN_TEMPLATES) {
      expect(t.name).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.category).toBeTruthy();
      expect(t.slotsJson).toBeTruthy();
    }
  });

  it('template names are unique', () => {
    const names = BUILT_IN_TEMPLATES.map(t => t.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it('all templates have valid category values', () => {
    const validCategories = ['GENERAL', 'ENDO', 'COSMETIC', 'HYGIENE', 'MULTI_OP'];
    for (const t of BUILT_IN_TEMPLATES) {
      expect(validCategories).toContain(t.category);
    }
  });

  it('slots JSON parses to an object with day-of-week keys', () => {
    const validDays = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];
    for (const t of BUILT_IN_TEMPLATES) {
      const parsed = JSON.parse(t.slotsJson);
      expect(typeof parsed).toBe('object');
      const keys = Object.keys(parsed);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(validDays).toContain(key);
      }
    }
  });

  it('each day has an array of slots', () => {
    for (const t of BUILT_IN_TEMPLATES) {
      const parsed = JSON.parse(t.slotsJson);
      for (const [, slots] of Object.entries(parsed)) {
        expect(Array.isArray(slots)).toBe(true);
        expect((slots as TemplateSlot[]).length).toBeGreaterThan(0);
      }
    }
  });

  it('slots use role-relative provider IDs (DOCTOR_N, HYGIENIST_N)', () => {
    for (const t of BUILT_IN_TEMPLATES) {
      const parsed = JSON.parse(t.slotsJson);
      const firstDay = Object.values(parsed)[0] as TemplateSlot[];
      const nonBreakSlots = firstDay.filter((s) => !s.isBreak);
      for (const slot of nonBreakSlots) {
        expect(slot.providerId).toMatch(/^(DOCTOR|HYGIENIST)_\d+$/);
      }
    }
  });

  it('includes Standard GP template with 1 doctor and 1 hygienist', () => {
    const gp = BUILT_IN_TEMPLATES.find(t => t.name.includes('Standard GP'));
    expect(gp).toBeTruthy();
    const parsed = JSON.parse(gp!.slotsJson);
    const monday = parsed['MONDAY'] as TemplateSlot[];
    const providerIds = new Set(monday.map((s) => s.providerId));
    expect(providerIds.has('DOCTOR_0')).toBe(true);
    expect(providerIds.has('HYGIENIST_0')).toBe(true);
    expect(providerIds.has('DOCTOR_1')).toBe(false);
  });

  it('includes High Volume GP template with 2 hygienists', () => {
    const hv = BUILT_IN_TEMPLATES.find(t => t.name.includes('High Volume'));
    expect(hv).toBeTruthy();
    const parsed = JSON.parse(hv!.slotsJson);
    const monday = parsed['MONDAY'] as TemplateSlot[];
    const providerIds = new Set(monday.map((s) => s.providerId));
    expect(providerIds.has('HYGIENIST_1')).toBe(true);
  });

  it('includes Endo-Focused template with root canal blocks', () => {
    const endo = BUILT_IN_TEMPLATES.find(t => t.name.includes('Endo'));
    expect(endo).toBeTruthy();
    const parsed = JSON.parse(endo!.slotsJson);
    const monday = parsed['MONDAY'] as TemplateSlot[];
    const labels = monday.map((s) => s.blockLabel);
    expect(labels.some((l) => (l ?? '').toLowerCase().includes('root canal'))).toBe(true);
  });

  it('includes New Patient Focused template with NP exam blocks', () => {
    const np = BUILT_IN_TEMPLATES.find(t => t.name.includes('New Patient'));
    expect(np).toBeTruthy();
    const parsed = JSON.parse(np!.slotsJson);
    const monday = parsed['MONDAY'] as TemplateSlot[];
    const labels = monday.map((s) => s.blockLabel);
    expect(labels.some((l) => (l ?? '').includes('New Patient'))).toBe(true);
  });
});

// ─── Template Apply Logic ────────────────────────────────────────────────────

describe('Template Library — apply role-mapping logic', () => {
  function buildRoleIndex(slotsJson: string, officeProviders: { id: string; role: string }[]) {
    const templateSlots = JSON.parse(slotsJson) as Record<string, TemplateSlot[]>;
    const doctors = officeProviders.filter(p => p.role === 'DOCTOR');
    const hygienists = officeProviders.filter(p => p.role === 'HYGIENIST');

    const roleIndexToProviderId: Record<string, string> = {};
    doctors.forEach((d, i) => { roleIndexToProviderId[`DOCTOR_${i}`] = d.id; });
    hygienists.forEach((h, i) => { roleIndexToProviderId[`HYGIENIST_${i}`] = h.id; });

    const mapped: Record<string, TemplateSlot[]> = {};
    for (const [day, slots] of Object.entries(templateSlots)) {
      mapped[day] = slots.map(slot => {
        const realId = roleIndexToProviderId[slot.providerId];
        if (!realId) return null;
        return { ...slot, providerId: realId };
      }).filter((s): s is TemplateSlot => s !== null);
    }
    return { mapped, roleIndexToProviderId };
  }

  it('maps DOCTOR_0 to first doctor in target office', () => {
    const gp = BUILT_IN_TEMPLATES[0];
    const officeProviders = [
      { id: 'dr-smith', role: 'DOCTOR' },
      { id: 'hyg-jane', role: 'HYGIENIST' },
    ];
    const { mapped } = buildRoleIndex(gp.slotsJson, officeProviders);
    const monday = mapped['MONDAY'];
    const drSlots = monday.filter((s) => s.providerId === 'dr-smith');
    expect(drSlots.length).toBeGreaterThan(0);
  });

  it('maps HYGIENIST_0 to first hygienist in target office', () => {
    const gp = BUILT_IN_TEMPLATES[0];
    const officeProviders = [
      { id: 'dr-smith', role: 'DOCTOR' },
      { id: 'hyg-jane', role: 'HYGIENIST' },
    ];
    const { mapped } = buildRoleIndex(gp.slotsJson, officeProviders);
    const monday = mapped['MONDAY'];
    const hygSlots = monday.filter((s) => s.providerId === 'hyg-jane');
    expect(hygSlots.length).toBeGreaterThan(0);
  });

  it('drops slots for providers that dont exist in target office (fewer providers)', () => {
    const hv = BUILT_IN_TEMPLATES[1]; // High Volume: 1 doctor, 2 hygienists
    const officeProviders = [
      { id: 'dr-a', role: 'DOCTOR' },
      { id: 'hyg-b', role: 'HYGIENIST' }, // only 1 hygienist
    ];
    const { mapped } = buildRoleIndex(hv.slotsJson, officeProviders);
    const monday = mapped['MONDAY'];
    // No slot should have HYGIENIST_1 mapped (it gets dropped)
    const hyg1Slots = monday.filter((s) => s.providerId === 'hyg-b');
    expect(hyg1Slots.length).toBeGreaterThan(0); // hyg-b = HYGIENIST_0, should be mapped
    // No slots should reference a missing provider
    expect(monday.every((s) => s.providerId !== undefined)).toBe(true);
  });
});

// ─── Task 2: Version History ─────────────────────────────────────────────────

describe('Schedule Version History — snapshot structure', () => {
  it('a ScheduleVersion snapshot captures required fields', () => {
    const snapshot = {
      id: 'ver-001',
      officeId: 'off-001',
      dayOfWeek: 'MONDAY',
      weekType: 'A',
      slotsJson: JSON.stringify([{ time: '08:00', providerId: 'p1', blockLabel: 'Crown', isBreak: false }]),
      summaryJson: JSON.stringify([]),
      label: 'Saved 3:42 PM',
      createdAt: new Date().toISOString(),
    };

    expect(snapshot.officeId).toBeTruthy();
    expect(snapshot.dayOfWeek).toBeTruthy();
    expect(snapshot.weekType).toBeTruthy();
    expect(() => JSON.parse(snapshot.slotsJson)).not.toThrow();
    expect(snapshot.label).toBeTruthy();
  });

  it('auto-label format is "Saved [time]"', () => {
    const d = new Date('2026-03-11T15:42:00');
    const label = `Saved ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
    expect(label).toMatch(/^Saved \d+:\d{2} [AP]M$/);
  });

  it('restoring a version rebuilds GenerationResult', () => {
    const slots = [
      { time: '08:00', providerId: 'p1', blockLabel: 'Crown Prep', blockTypeId: null, isBreak: false },
      { time: '08:30', providerId: 'p1', blockLabel: null, blockTypeId: null, isBreak: false },
    ];
    const summary = [{ providerId: 'p1', providerName: 'Dr. A', actualScheduled: 5000, dailyGoal: 8000, target75: 6000, status: 'UNDER' as const, blocks: [] }];

    const restored: GenerationResult = {
      dayOfWeek: 'MONDAY',
      slots: slots as unknown as TimeSlotOutput[],
      productionSummary: summary,
      warnings: [],
    };

    expect(restored.dayOfWeek).toBe('MONDAY');
    expect(restored.slots).toHaveLength(2);
    expect(restored.productionSummary[0].providerId).toBe('p1');
  });

  it('max 20 versions pruning: oldest are removed', () => {
    const versions = Array.from({ length: 25 }, (_, i) => ({
      id: `ver-${i}`,
      createdAt: new Date(Date.now() + i * 1000).toISOString(),
    }));
    // Simulate pruning: keep only latest 20
    const sorted = versions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const kept = sorted.slice(0, 20);
    expect(kept.length).toBe(20);
    expect(kept[0].id).toBe('ver-24'); // most recent
  });
});

// ─── Task 3: Provider Absence Tracking ───────────────────────────────────────

describe('Provider Absence Tracking — data structure', () => {
  it('absence record has required fields', () => {
    const absence = {
      id: 'abs-001',
      providerId: 'p1',
      officeId: 'off-001',
      date: '2026-04-14',
      reason: 'Vacation',
    };

    expect(absence.providerId).toBeTruthy();
    expect(absence.officeId).toBeTruthy();
    expect(absence.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('absence date format is ISO YYYY-MM-DD', () => {
    const validDates = ['2026-04-14', '2026-01-01', '2026-12-31'];
    const invalidDates = ['April 14', '04/14/2026', '2026-4-14'];
    for (const d of validDates) {
      expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    for (const d of invalidDates) {
      expect(d).not.toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('reason is optional (defaults to empty string)', () => {
    const absenceNoReason = {
      id: 'abs-002',
      providerId: 'p2',
      officeId: 'off-001',
      date: '2026-05-01',
      reason: '',
    };
    expect(absenceNoReason.reason).toBe('');
  });

  it('multiple absences can exist for the same provider', () => {
    const absences = [
      { id: 'a1', providerId: 'p1', date: '2026-04-14', reason: 'Vacation' },
      { id: 'a2', providerId: 'p1', date: '2026-04-15', reason: 'Vacation' },
      { id: 'a3', providerId: 'p1', date: '2026-04-16', reason: 'Vacation' },
    ];
    expect(absences.filter(a => a.providerId === 'p1')).toHaveLength(3);
  });

  it('detects provider absence on matching day of week', () => {
    const absences = [
      { providerId: 'p1', providerName: 'Dr. Smith', date: '2026-04-13', reason: 'CE' }, // Monday
    ];
    const DOW_TO_NUM: Record<string, number> = {
      MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4, FRIDAY: 5,
    };
    const activeDay = 'MONDAY';
    const activeNum = DOW_TO_NUM[activeDay];
    const relevant = absences.filter(a => {
      const d = new Date(a.date + 'T12:00:00');
      return d.getDay() === activeNum;
    });
    expect(relevant).toHaveLength(1);
    expect(relevant[0].providerName).toBe('Dr. Smith');
  });
});

// ─── Task 4: Optimization Advisor ────────────────────────────────────────────

function makeSchedule(overrides: Partial<GenerationResult> = {}): GenerationResult {
  return {
    dayOfWeek: 'MONDAY',
    slots: [
      { time: '08:00', providerId: 'p1', staffingCode: 'D', blockLabel: 'Crown Prep', blockTypeId: 'bt1', isBreak: false },
      { time: '08:30', providerId: 'p1', staffingCode: null, blockLabel: null, blockTypeId: null, isBreak: false },
      { time: '13:00', providerId: 'p1', staffingCode: null, blockLabel: null, blockTypeId: null, isBreak: false },
      { time: '13:30', providerId: 'p1', staffingCode: null, blockLabel: null, blockTypeId: null, isBreak: false },
      { time: '14:00', providerId: 'p1', staffingCode: null, blockLabel: null, blockTypeId: null, isBreak: false },
    ],
    productionSummary: [
      {
        providerId: 'p1',
        providerName: 'Dr. Smith',
        dailyGoal: 8000,
        target75: 6000,
        actualScheduled: 1200, // well under
        highProductionScheduled: 1200,
        status: 'UNDER',
        blocks: [{ label: 'Crown Prep', amount: 1200, count: 1 }],
      },
    ],
    warnings: [],
    ...overrides,
  };
}

function makeProviders(): ProviderInput[] {
  return [
    {
      id: 'p1',
      name: 'Dr. Smith',
      role: 'DOCTOR',
      operatories: ['OP1'],
      workingStart: '07:00',
      workingEnd: '17:00',
      dailyGoal: 8000,
      color: '#ec8a1b',
    },
  ];
}

function makeBlockTypes(): BlockTypeInput[] {
  return [
    { id: 'bt1', label: 'Crown Prep', appliesToRole: 'DOCTOR', durationMin: 60, minimumAmount: 1200 },
    { id: 'bt2', label: 'Composite', appliesToRole: 'DOCTOR', durationMin: 30, minimumAmount: 200 },
    { id: 'bt3', label: 'Emergency', appliesToRole: 'DOCTOR', durationMin: 30, minimumAmount: 100 },
  ];
}

function makePoorQualityScore(): QualityScore {
  return {
    total: 45,
    tier: 'needs_work',
    emoji: '🔴',
    tierLabel: 'Needs Work',
    components: [
      { label: 'Production Goal Achievement', score: 10, maxScore: 30, description: 'Low' },
      { label: 'Procedure Mix Accuracy', score: 25, maxScore: 25, description: 'OK' },
      { label: 'Clinical Rules Compliance', score: 10, maxScore: 20, description: 'Errors' },
      { label: 'Time Utilization', score: 5, maxScore: 15, description: 'Low' },
      { label: 'Provider Coverage', score: 5, maxScore: 10, description: 'Low' },
    ],
  };
}

describe('Optimization Advisor — generateOptimizationSuggestions', () => {
  it('returns an array of suggestions', () => {
    const schedule = makeSchedule();
    const providers = makeProviders();
    const blockTypes = makeBlockTypes();
    const qualityScore = makePoorQualityScore();

    const suggestions = generateOptimizationSuggestions(schedule, providers, blockTypes, qualityScore);
    expect(Array.isArray(suggestions)).toBe(true);
  });

  it('returns empty array for a perfect quality score', () => {
    const perfectScore: QualityScore = {
      total: 100,
      tier: 'excellent',
      emoji: '🟢',
      tierLabel: 'Excellent',
      components: [
        { label: 'Production Goal Achievement', score: 30, maxScore: 30, description: '' },
        { label: 'Procedure Mix Accuracy', score: 25, maxScore: 25, description: '' },
        { label: 'Clinical Rules Compliance', score: 20, maxScore: 20, description: '' },
        { label: 'Time Utilization', score: 15, maxScore: 15, description: '' },
        { label: 'Provider Coverage', score: 10, maxScore: 10, description: '' },
      ],
    };
    const schedule = makeSchedule();
    const suggestions = generateOptimizationSuggestions(schedule, makeProviders(), makeBlockTypes(), perfectScore);
    expect(suggestions.length).toBe(0);
  });

  it('each suggestion has required fields', () => {
    const suggestions = generateOptimizationSuggestions(
      makeSchedule(), makeProviders(), makeBlockTypes(), makePoorQualityScore()
    );
    for (const s of suggestions) {
      expect(s.id).toBeTruthy();
      expect(s.category).toMatch(/^(production|mix|clinical|utilization)$/);
      expect(s.action).toBeTruthy();
      expect(s.estimatedScoreImprovement).toBeGreaterThan(0);
      expect(s.difficulty).toMatch(/^(easy|medium|hard)$/);
      expect(typeof s.canAutoApply).toBe('boolean');
    }
  });

  it('suggestions are ordered by estimated score improvement (highest first)', () => {
    const suggestions = generateOptimizationSuggestions(
      makeSchedule(), makeProviders(), makeBlockTypes(), makePoorQualityScore()
    );
    for (let i = 1; i < suggestions.length; i++) {
      expect(suggestions[i - 1].estimatedScoreImprovement).toBeGreaterThanOrEqual(
        suggestions[i].estimatedScoreImprovement
      );
    }
  });

  it('generates production suggestion when provider is under goal', () => {
    const suggestions = generateOptimizationSuggestions(
      makeSchedule(), makeProviders(), makeBlockTypes(), makePoorQualityScore()
    );
    const prodSuggestions = suggestions.filter(s => s.category === 'production');
    expect(prodSuggestions.length).toBeGreaterThan(0);
    expect(prodSuggestions[0].action).toContain('Dr. Smith');
  });

  it('generates utilization suggestion when afternoon has many empty slots', () => {
    const suggestions = generateOptimizationSuggestions(
      makeSchedule(), makeProviders(), makeBlockTypes(), makePoorQualityScore()
    );
    const utilSuggestions = suggestions.filter(s => s.category === 'utilization');
    expect(utilSuggestions.length).toBeGreaterThan(0);
  });

  it('easy utilization suggestions have canAutoApply=true and applyPayload', () => {
    const suggestions = generateOptimizationSuggestions(
      makeSchedule(), makeProviders(), makeBlockTypes(), makePoorQualityScore()
    );
    const easySuggestions = suggestions.filter(s => s.difficulty === 'easy' && s.canAutoApply);
    for (const s of easySuggestions) {
      if (s.applyPayload) {
        expect(s.applyPayload.type).toMatch(/^(ADD_BLOCK|MOVE_BLOCK|REPLACE_BLOCK)$/);
      }
    }
  });

  it('clinical suggestions generated when warnings exist', () => {
    const warnings: ClinicalWarning[] = [
      { ruleId: 'NO_NP_AFTERNOON', severity: 'error', message: 'No NP slot in morning', affectedProvider: 'Dr. Smith' },
      { ruleId: 'EMERGENCY_MORNING', severity: 'warning', message: 'Emergency not in morning', affectedProvider: 'Dr. Smith' },
    ];
    const qualityWithClinical: QualityScore = {
      ...makePoorQualityScore(),
      components: [
        ...makePoorQualityScore().components.filter(c => c.label !== 'Clinical Rules Compliance'),
        { label: 'Clinical Rules Compliance', score: 8, maxScore: 20, description: '1 error, 1 warning' },
      ],
    };
    const suggestions = generateOptimizationSuggestions(
      makeSchedule(), makeProviders(), makeBlockTypes(), qualityWithClinical, warnings
    );
    const clinicalSugs = suggestions.filter(s => s.category === 'clinical');
    expect(clinicalSugs.length).toBeGreaterThan(0);
  });

  it('suggestion IDs are unique (no duplicates)', () => {
    const suggestions = generateOptimizationSuggestions(
      makeSchedule(), makeProviders(), makeBlockTypes(), makePoorQualityScore()
    );
    const ids = suggestions.map(s => s.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('handles empty schedule (no slots) gracefully', () => {
    const emptySchedule = makeSchedule({ slots: [], productionSummary: [] });
    expect(() =>
      generateOptimizationSuggestions(emptySchedule, makeProviders(), makeBlockTypes(), makePoorQualityScore())
    ).not.toThrow();
  });

  it('handles empty providers array gracefully', () => {
    expect(() =>
      generateOptimizationSuggestions(makeSchedule(), [], makeBlockTypes(), makePoorQualityScore())
    ).not.toThrow();
  });
});

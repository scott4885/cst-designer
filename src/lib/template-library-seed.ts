/**
 * Seed data for 5 built-in global template library items.
 *
 * Slots are stored role-relative (DOCTOR_0, HYGIENIST_0, etc.) and are
 * mapped to real provider IDs when applying to an office.
 *
 * slotsJson is a JSON object keyed by day-of-week.
 * Each value is an array of { time, providerId (role-relative), blockLabel }.
 *
 * These templates represent realistic dental day patterns.
 */
import { prisma } from './db';

type RelativeSlot = {
  time: string;
  providerId: string; // e.g. "DOCTOR_0", "HYGIENIST_0"
  blockLabel: string;
  blockTypeId: null;
  isBreak: boolean;
  staffingCode: 'D' | 'H' | null;
};

type DaySlots = Record<string, RelativeSlot[]>;

function makeSlot(
  time: string,
  providerId: string,
  blockLabel: string,
  staffingCode: 'D' | 'H' | null = 'D',
  isBreak = false
): RelativeSlot {
  return { time, providerId, blockLabel, blockTypeId: null, isBreak, staffingCode };
}

// ─── Template 1: Standard GP (1 Doctor, 1 Hygienist) ─────────────────────────
// Typical bread-and-butter GP day: crown, composites, exams, SRP
const standardGpSlots: DaySlots = {
  MONDAY: [
    makeSlot('07:00', 'DOCTOR_0', 'New Patient Exam'),
    makeSlot('07:30', 'DOCTOR_0', 'Crown Prep'),
    makeSlot('08:30', 'DOCTOR_0', 'Crown Prep'),
    makeSlot('09:30', 'DOCTOR_0', 'Composite'),
    makeSlot('10:00', 'DOCTOR_0', 'Composite'),
    makeSlot('10:30', 'DOCTOR_0', 'Emergency'),
    makeSlot('11:00', 'DOCTOR_0', 'Composite'),
    makeSlot('11:30', 'DOCTOR_0', 'Composite'),
    makeSlot('12:00', 'DOCTOR_0', 'LUNCH', null, true),
    makeSlot('13:00', 'DOCTOR_0', 'New Patient Exam'),
    makeSlot('13:30', 'DOCTOR_0', 'Crown Prep'),
    makeSlot('14:30', 'DOCTOR_0', 'Crown Prep'),
    makeSlot('15:30', 'DOCTOR_0', 'Composite'),

    makeSlot('07:00', 'HYGIENIST_0', 'Prophy', 'H'),
    makeSlot('08:00', 'HYGIENIST_0', 'Prophy', 'H'),
    makeSlot('09:00', 'HYGIENIST_0', 'SRP', 'H'),
    makeSlot('10:00', 'HYGIENIST_0', 'SRP', 'H'),
    makeSlot('11:00', 'HYGIENIST_0', 'Prophy', 'H'),
    makeSlot('12:00', 'HYGIENIST_0', 'LUNCH', null, true),
    makeSlot('13:00', 'HYGIENIST_0', 'Prophy', 'H'),
    makeSlot('14:00', 'HYGIENIST_0', 'Prophy', 'H'),
    makeSlot('15:00', 'HYGIENIST_0', 'SRP', 'H'),
  ],
};
// Copy Monday to Tue–Fri
['TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'].forEach(day => {
  standardGpSlots[day] = standardGpSlots.MONDAY;
});

// ─── Template 2: High Volume GP (1 Doctor, 2 Hygienists) ─────────────────────
const highVolumeSlots: DaySlots = {
  MONDAY: [
    makeSlot('07:00', 'DOCTOR_0', 'New Patient Exam'),
    makeSlot('07:30', 'DOCTOR_0', 'Crown Prep'),
    makeSlot('08:30', 'DOCTOR_0', 'Crown Prep'),
    makeSlot('09:30', 'DOCTOR_0', 'Composite'),
    makeSlot('10:00', 'DOCTOR_0', 'Composite'),
    makeSlot('10:30', 'DOCTOR_0', 'Emergency'),
    makeSlot('11:00', 'DOCTOR_0', 'Crown Prep'),
    makeSlot('12:00', 'DOCTOR_0', 'LUNCH', null, true),
    makeSlot('13:00', 'DOCTOR_0', 'Crown Prep'),
    makeSlot('14:00', 'DOCTOR_0', 'Crown Prep'),
    makeSlot('15:00', 'DOCTOR_0', 'Composite'),
    makeSlot('15:30', 'DOCTOR_0', 'Composite'),

    makeSlot('07:00', 'HYGIENIST_0', 'Prophy', 'H'),
    makeSlot('08:00', 'HYGIENIST_0', 'SRP', 'H'),
    makeSlot('09:00', 'HYGIENIST_0', 'SRP', 'H'),
    makeSlot('10:00', 'HYGIENIST_0', 'Prophy', 'H'),
    makeSlot('11:00', 'HYGIENIST_0', 'Prophy', 'H'),
    makeSlot('12:00', 'HYGIENIST_0', 'LUNCH', null, true),
    makeSlot('13:00', 'HYGIENIST_0', 'Prophy', 'H'),
    makeSlot('14:00', 'HYGIENIST_0', 'Prophy', 'H'),
    makeSlot('15:00', 'HYGIENIST_0', 'SRP', 'H'),

    makeSlot('07:30', 'HYGIENIST_1', 'SRP', 'H'),
    makeSlot('08:30', 'HYGIENIST_1', 'Prophy', 'H'),
    makeSlot('09:30', 'HYGIENIST_1', 'Prophy', 'H'),
    makeSlot('10:30', 'HYGIENIST_1', 'Prophy', 'H'),
    makeSlot('11:30', 'HYGIENIST_1', 'SRP', 'H'),
    makeSlot('12:30', 'HYGIENIST_1', 'LUNCH', null, true),
    makeSlot('13:30', 'HYGIENIST_1', 'Prophy', 'H'),
    makeSlot('14:30', 'HYGIENIST_1', 'Prophy', 'H'),
    makeSlot('15:30', 'HYGIENIST_1', 'SRP', 'H'),
  ],
};
['TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'].forEach(day => {
  highVolumeSlots[day] = highVolumeSlots.MONDAY;
});

// ─── Template 3: 2-Op Doctor (Multi-Op) ──────────────────────────────────────
// Doctor alternates between 2 ops with stagger, 1 hygienist
const twoOpSlots: DaySlots = {
  MONDAY: [
    // Doctor Op 1
    makeSlot('07:00', 'DOCTOR_0', 'Crown Prep'),
    makeSlot('08:00', 'DOCTOR_0', 'Composite'),
    makeSlot('08:30', 'DOCTOR_0', 'Composite'),
    makeSlot('09:00', 'DOCTOR_0', 'Crown Prep'),
    makeSlot('10:00', 'DOCTOR_0', 'New Patient Exam'),
    makeSlot('10:30', 'DOCTOR_0', 'Crown Prep'),
    makeSlot('11:30', 'DOCTOR_0', 'Emergency'),
    makeSlot('12:00', 'DOCTOR_0', 'LUNCH', null, true),
    makeSlot('13:00', 'DOCTOR_0', 'Crown Prep'),
    makeSlot('14:00', 'DOCTOR_0', 'Composite'),
    makeSlot('14:30', 'DOCTOR_0', 'Crown Prep'),
    makeSlot('15:30', 'DOCTOR_0', 'Composite'),

    // Doctor Op 2 (staggered by 20 min via DOCTOR_1 display)
    makeSlot('07:20', 'DOCTOR_1', 'Composite'),
    makeSlot('07:50', 'DOCTOR_1', 'Crown Prep'),
    makeSlot('08:50', 'DOCTOR_1', 'Composite'),
    makeSlot('09:30', 'DOCTOR_1', 'Composite'),
    makeSlot('10:10', 'DOCTOR_1', 'Crown Prep'),
    makeSlot('11:10', 'DOCTOR_1', 'New Patient Exam'),
    makeSlot('11:40', 'DOCTOR_1', 'Composite'),
    makeSlot('12:00', 'DOCTOR_1', 'LUNCH', null, true),
    makeSlot('13:20', 'DOCTOR_1', 'Crown Prep'),
    makeSlot('14:20', 'DOCTOR_1', 'Crown Prep'),
    makeSlot('15:20', 'DOCTOR_1', 'Composite'),

    makeSlot('07:00', 'HYGIENIST_0', 'Prophy', 'H'),
    makeSlot('08:00', 'HYGIENIST_0', 'SRP', 'H'),
    makeSlot('09:00', 'HYGIENIST_0', 'Prophy', 'H'),
    makeSlot('10:00', 'HYGIENIST_0', 'SRP', 'H'),
    makeSlot('11:00', 'HYGIENIST_0', 'Prophy', 'H'),
    makeSlot('12:00', 'HYGIENIST_0', 'LUNCH', null, true),
    makeSlot('13:00', 'HYGIENIST_0', 'Prophy', 'H'),
    makeSlot('14:00', 'HYGIENIST_0', 'Prophy', 'H'),
    makeSlot('15:00', 'HYGIENIST_0', 'SRP', 'H'),
  ],
};
['TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'].forEach(day => {
  twoOpSlots[day] = twoOpSlots.MONDAY;
});

// ─── Template 4: Endo-Focused ─────────────────────────────────────────────────
// Heavy endo blocks, fewer hygiene
const endoSlots: DaySlots = {
  MONDAY: [
    makeSlot('07:00', 'DOCTOR_0', 'Root Canal'),
    makeSlot('08:30', 'DOCTOR_0', 'Root Canal'),
    makeSlot('10:00', 'DOCTOR_0', 'Root Canal Retreatment'),
    makeSlot('11:30', 'DOCTOR_0', 'Emergency'),
    makeSlot('12:00', 'DOCTOR_0', 'LUNCH', null, true),
    makeSlot('13:00', 'DOCTOR_0', 'Root Canal'),
    makeSlot('14:30', 'DOCTOR_0', 'Crown Prep'),
    makeSlot('15:30', 'DOCTOR_0', 'Composite'),

    makeSlot('07:00', 'HYGIENIST_0', 'Prophy', 'H'),
    makeSlot('08:00', 'HYGIENIST_0', 'SRP', 'H'),
    makeSlot('09:00', 'HYGIENIST_0', 'Prophy', 'H'),
    makeSlot('10:00', 'HYGIENIST_0', 'Prophy', 'H'),
    makeSlot('11:00', 'HYGIENIST_0', 'SRP', 'H'),
    makeSlot('12:00', 'HYGIENIST_0', 'LUNCH', null, true),
    makeSlot('13:00', 'HYGIENIST_0', 'Prophy', 'H'),
    makeSlot('14:00', 'HYGIENIST_0', 'Prophy', 'H'),
    makeSlot('15:00', 'HYGIENIST_0', 'SRP', 'H'),
  ],
};
['TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'].forEach(day => {
  endoSlots[day] = endoSlots.MONDAY;
});

// ─── Template 5: New Patient Focused ─────────────────────────────────────────
// Heavy NP exam weighting, consultation slots prominent
const newPatientSlots: DaySlots = {
  MONDAY: [
    makeSlot('07:00', 'DOCTOR_0', 'New Patient Exam'),
    makeSlot('07:30', 'DOCTOR_0', 'New Patient Exam'),
    makeSlot('08:00', 'DOCTOR_0', 'New Patient Consult'),
    makeSlot('08:30', 'DOCTOR_0', 'New Patient Exam'),
    makeSlot('09:00', 'DOCTOR_0', 'Crown Prep'),
    makeSlot('10:00', 'DOCTOR_0', 'New Patient Exam'),
    makeSlot('10:30', 'DOCTOR_0', 'New Patient Consult'),
    makeSlot('11:00', 'DOCTOR_0', 'Composite'),
    makeSlot('11:30', 'DOCTOR_0', 'Emergency'),
    makeSlot('12:00', 'DOCTOR_0', 'LUNCH', null, true),
    makeSlot('13:00', 'DOCTOR_0', 'New Patient Exam'),
    makeSlot('13:30', 'DOCTOR_0', 'New Patient Consult'),
    makeSlot('14:00', 'DOCTOR_0', 'Crown Prep'),
    makeSlot('15:00', 'DOCTOR_0', 'New Patient Exam'),
    makeSlot('15:30', 'DOCTOR_0', 'Composite'),

    makeSlot('07:00', 'HYGIENIST_0', 'Prophy', 'H'),
    makeSlot('08:00', 'HYGIENIST_0', 'New Patient Exam', 'H'),
    makeSlot('09:00', 'HYGIENIST_0', 'SRP', 'H'),
    makeSlot('10:00', 'HYGIENIST_0', 'Prophy', 'H'),
    makeSlot('11:00', 'HYGIENIST_0', 'Prophy', 'H'),
    makeSlot('12:00', 'HYGIENIST_0', 'LUNCH', null, true),
    makeSlot('13:00', 'HYGIENIST_0', 'New Patient Exam', 'H'),
    makeSlot('14:00', 'HYGIENIST_0', 'Prophy', 'H'),
    makeSlot('15:00', 'HYGIENIST_0', 'SRP', 'H'),
  ],
};
['TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'].forEach(day => {
  newPatientSlots[day] = newPatientSlots.MONDAY;
});

// ─── Built-in template definitions ───────────────────────────────────────────

export const BUILT_IN_TEMPLATES = [
  {
    name: 'Standard GP (1 Doctor, 1 Hygienist)',
    description: 'Typical bread-and-butter GP day with crown preps, composites, exams, and SRP hygiene.',
    category: 'GENERAL',
    slotsJson: JSON.stringify(standardGpSlots),
  },
  {
    name: 'High Volume GP (1 Doctor, 2 Hygienists)',
    description: 'Doctor-heavy schedule with two hygiene chairs running simultaneously for maximum volume.',
    category: 'GENERAL',
    slotsJson: JSON.stringify(highVolumeSlots),
  },
  {
    name: '2-Op Doctor (Multi-Op)',
    description: 'Doctor alternates between two operatories with staggered start times, plus hygienist support.',
    category: 'MULTI_OP',
    slotsJson: JSON.stringify(twoOpSlots),
  },
  {
    name: 'Endo-Focused',
    description: 'Heavy endodontic block weighting (root canals, retreatments) with standard hygiene support.',
    category: 'ENDO',
    slotsJson: JSON.stringify(endoSlots),
  },
  {
    name: 'New Patient Focused',
    description: 'Heavily weighted toward new patient exams and consultations — ideal for growing practices.',
    category: 'GENERAL',
    slotsJson: JSON.stringify(newPatientSlots),
  },
];

/**
 * Seed built-in templates into the database.
 * Called once on first GET to the template library endpoint.
 */
export async function seedBuiltInTemplates(): Promise<void> {
  for (const template of BUILT_IN_TEMPLATES) {
    await prisma.templateLibraryItem.upsert({
      where: {
        // Since there's no unique constraint on name, use findFirst + create pattern
        id: `builtin-${template.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}`,
      },
      update: {},
      create: {
        id: `builtin-${template.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}`,
        ...template,
        isBuiltIn: true,
      },
    });
  }
}

import { ProviderInput, BlockTypeInput, ScheduleRules } from './engine/types';

export interface OfficeData {
  id: string;
  name: string;
  dpmsSystem: 'DENTRIX' | 'OPEN_DENTAL' | 'EAGLESOFT' | 'DENTICON';
  workingDays: string[];
  timeIncrement: number;
  feeModel: 'UCR' | 'PPO' | 'MIXED';
  providerCount: number;
  totalDailyGoal: number;
  updatedAt: string;
  /** When true, the Template Builder shows Week A / Week B tabs (legacy — use rotationEnabled) */
  alternateWeekEnabled?: boolean;
  /** When true, multi-week rotation is active. Treated as rotationWeeks=2 when only alternateWeekEnabled was set. */
  rotationEnabled?: boolean;
  /** Number of rotation weeks: 2 (A/B) or 4 (A/B/C/D). Default 2. */
  rotationWeeks?: number;
  /** JSON array of SchedulingWindow objects for smart scheduling windows (Sprint 17) */
  schedulingWindows?: string;
  /** Free-form scheduling rules (notes / policy text) */
  schedulingRules?: string;
  providers?: ProviderInput[];
  blockTypes?: BlockTypeInput[];
  rules?: ScheduleRules;
}

// ============================================================================
// OFFICE 1 - SMILE CASCADE (Dentrix, 4 providers, UCR)
// ============================================================================

export const smileCascadeProviders: ProviderInput[] = [
  {
    id: 'fitz-1',
    name: 'Dr. Kevin Fitzpatrick',
    role: 'DOCTOR',
    operatories: ['OP1', 'OP2'],
    workingStart: '07:00',
    workingEnd: '18:00',
    lunchStart: '13:00',
    lunchEnd: '14:00',
    dailyGoal: 5000,
    color: '#ec8a1b', // orange
  },
  {
    id: 'cheryl-1',
    name: 'Cheryl Dise RDH',
    role: 'HYGIENIST',
    operatories: ['HYG2'],
    workingStart: '07:00',
    workingEnd: '18:00',
    lunchStart: '13:00',
    lunchEnd: '14:00',
    dailyGoal: 2602,
    color: '#87bcf3', // light blue
  },
  {
    id: 'luke-1',
    name: 'Luke Knedler RDH',
    role: 'HYGIENIST',
    operatories: ['HYG4'],
    workingStart: '07:00',
    workingEnd: '18:00',
    lunchStart: '13:00',
    lunchEnd: '14:00',
    dailyGoal: 2254,
    color: '#f4de37', // yellow
  },
  {
    id: 'jamal-1',
    name: 'Jamal Wilson RDH',
    role: 'HYGIENIST',
    operatories: ['HYG3'],
    workingStart: '07:00',
    workingEnd: '18:00',
    lunchStart: '13:00',
    lunchEnd: '14:00',
    dailyGoal: 2129,
    color: '#44f2ce', // teal
  },
];

export const smileCascadeBlockTypes: BlockTypeInput[] = [
  {
    id: 'hp-1',
    label: 'HP',
    description: 'High Production - crowns, implants, greater than $1200',
    minimumAmount: 1200,
    appliesToRole: 'DOCTOR',
    durationMin: 60,
    durationMax: 90,
  },
  {
    id: 'mp-1',
    label: 'MP',
    description: 'Medium Production - fillings, smaller restorative',
    minimumAmount: 300,
    appliesToRole: 'DOCTOR',
    durationMin: 30,
    durationMax: 60,
  },
  {
    id: 'np-cons-1',
    label: 'NP CONS',
    description: 'New Patient Consultation',
    minimumAmount: 150,
    appliesToRole: 'DOCTOR',
    durationMin: 30,
    durationMax: 60,
  },
  {
    id: 'non-prod-1',
    label: 'NON-PROD',
    description: 'Non-productive - crown seats, adjustments',
    minimumAmount: 0,
    appliesToRole: 'DOCTOR',
    durationMin: 20,
    durationMax: 30,
  },
  {
    id: 'er-1',
    label: 'ER',
    description: 'Emergency - limited exam, urgent care',
    minimumAmount: 100,
    appliesToRole: 'DOCTOR',
    durationMin: 20,
    durationMax: 30,
  },
  {
    id: 'recare-1',
    label: 'Recare',
    description: 'Recall/Prophy - routine cleaning, greater than $150',
    minimumAmount: 150,
    appliesToRole: 'HYGIENIST',
    durationMin: 50,
    durationMax: 60,
  },
  {
    id: 'pm-1',
    label: 'PM',
    description: 'Perio Maintenance - greater than $190',
    minimumAmount: 190,
    appliesToRole: 'HYGIENIST',
    durationMin: 60,
  },
  {
    id: 'npe-1',
    label: 'NPE',
    description: 'New Patient Exam - greater than $300',
    minimumAmount: 300,
    appliesToRole: 'HYGIENIST',
    durationMin: 60,
    durationMax: 90,
  },
  {
    id: 'aht-perio-1',
    label: 'AHT/Perio',
    description: 'Adult Hygiene Treatment/Periodontal - greater than $300',
    minimumAmount: 300,
    appliesToRole: 'HYGIENIST',
    durationMin: 60,
    durationMax: 90,
  },
];

export const smileCascadeRules: ScheduleRules = {
  npModel: 'DOCTOR_ONLY',
  npBlocksPerDay: 2,
  srpBlocksPerDay: 2,
  hpPlacement: 'MORNING',
  doubleBooking: true,
  matrixing: true,
  emergencyHandling: 'ACCESS_BLOCKS',
};

export const smileCascadeOffice: OfficeData = {
  id: '1',
  name: 'Smile Cascade',
  dpmsSystem: 'DENTRIX',
  workingDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
  timeIncrement: 10,
  feeModel: 'UCR',
  providerCount: 4,
  totalDailyGoal: 11985,
  updatedAt: new Date().toISOString(),
  providers: smileCascadeProviders,
  blockTypes: smileCascadeBlockTypes,
  rules: smileCascadeRules,
};

// ============================================================================
// OFFICE 2 - CDT COMFORT DENTAL (Open Dental, 7 providers, PPO, large practice)
// ============================================================================

export const cdtComfortProviders: ProviderInput[] = [
  {
    id: 'martinez-2',
    name: 'Dr. Sofia Martinez',
    role: 'DOCTOR',
    operatories: ['OP1', 'OP2'],
    workingStart: '08:00',
    workingEnd: '17:00',
    lunchStart: '12:00',
    lunchEnd: '13:00',
    dailyGoal: 4800,
    color: '#e74c3c', // red
  },
  {
    id: 'chen-2',
    name: 'Dr. David Chen',
    role: 'DOCTOR',
    operatories: ['OP3', 'OP4'],
    workingStart: '07:00',
    workingEnd: '16:00',
    lunchStart: '12:30',
    lunchEnd: '13:30',
    dailyGoal: 4500,
    color: '#9b59b6', // purple
  },
  {
    id: 'patel-2',
    name: 'Dr. Anjali Patel (Perio)',
    role: 'DOCTOR',
    operatories: ['OP5'],
    workingStart: '08:00',
    workingEnd: '17:00',
    lunchStart: '12:00',
    lunchEnd: '13:00',
    dailyGoal: 5200,
    color: '#34495e', // dark gray
  },
  {
    id: 'brown-2',
    name: 'Jessica Brown RDH',
    role: 'HYGIENIST',
    operatories: ['HYG1'],
    workingStart: '07:00',
    workingEnd: '16:00',
    lunchStart: '12:00',
    lunchEnd: '12:30',
    dailyGoal: 2400,
    color: '#3498db', // bright blue
  },
  {
    id: 'garcia-2',
    name: 'Maria Garcia RDH',
    role: 'HYGIENIST',
    operatories: ['HYG2'],
    workingStart: '08:00',
    workingEnd: '17:00',
    lunchStart: '12:30',
    lunchEnd: '13:00',
    dailyGoal: 2200,
    color: '#2ecc71', // green
  },
  {
    id: 'thompson-2',
    name: 'Robert Thompson RDH',
    role: 'HYGIENIST',
    operatories: ['HYG3'],
    workingStart: '09:00',
    workingEnd: '18:00',
    lunchStart: '13:00',
    lunchEnd: '13:30',
    dailyGoal: 2100,
    color: '#f39c12', // gold
  },
  {
    id: 'lee-2',
    name: 'Emily Lee RDH',
    role: 'HYGIENIST',
    operatories: ['HYG4'],
    workingStart: '07:00',
    workingEnd: '15:00',
    lunchStart: '11:30',
    lunchEnd: '12:00',
    dailyGoal: 1900,
    color: '#e67e22', // orange
  },
];

export const cdtComfortBlockTypes: BlockTypeInput[] = [
  {
    id: 'crown-2',
    label: 'CROWN',
    description: 'Crown prep and temporization',
    minimumAmount: 1400,
    appliesToRole: 'DOCTOR',
    durationMin: 75,
    durationMax: 90,
  },
  {
    id: 'implant-2',
    label: 'IMPLANT',
    description: 'Implant placement or restoration',
    minimumAmount: 2000,
    appliesToRole: 'DOCTOR',
    durationMin: 90,
    durationMax: 120,
  },
  {
    id: 'filling-2',
    label: 'FILLING',
    description: 'Composite or amalgam restorations',
    minimumAmount: 250,
    appliesToRole: 'DOCTOR',
    durationMin: 30,
    durationMax: 45,
  },
  {
    id: 'np-exam-2',
    label: 'NP EXAM',
    description: 'New patient comprehensive exam',
    minimumAmount: 180,
    appliesToRole: 'DOCTOR',
    durationMin: 45,
    durationMax: 60,
  },
  {
    id: 'emer-2',
    label: 'EMER',
    description: 'Emergency appointment - pain/swelling',
    minimumAmount: 120,
    appliesToRole: 'DOCTOR',
    durationMin: 30,
  },
  {
    id: 'perio-srp-2',
    label: 'PERIO SRP',
    description: 'Scaling and root planing per quadrant',
    minimumAmount: 350,
    appliesToRole: 'HYGIENIST',
    durationMin: 60,
    durationMax: 90,
  },
  {
    id: 'prophy-2',
    label: 'PROPHY',
    description: 'Adult prophylaxis',
    minimumAmount: 140,
    appliesToRole: 'HYGIENIST',
    durationMin: 45,
    durationMax: 60,
  },
  {
    id: 'perio-maint-2',
    label: 'PERIO MAINT',
    description: 'Periodontal maintenance',
    minimumAmount: 200,
    appliesToRole: 'HYGIENIST',
    durationMin: 60,
  },
  {
    id: 'child-prophy-2',
    label: 'CHILD PROPHY',
    description: 'Child prophylaxis',
    minimumAmount: 100,
    appliesToRole: 'HYGIENIST',
    durationMin: 30,
    durationMax: 45,
  },
  {
    id: 'np-hyg-2',
    label: 'NP HYG',
    description: 'New patient hygiene exam with x-rays',
    minimumAmount: 320,
    appliesToRole: 'HYGIENIST',
    durationMin: 75,
    durationMax: 90,
  },
];

export const cdtComfortRules: ScheduleRules = {
  npModel: 'EITHER',
  npBlocksPerDay: 3,
  srpBlocksPerDay: 2,
  hpPlacement: 'MORNING',
  doubleBooking: true,
  matrixing: false,
  emergencyHandling: 'FLEX',
};

export const cdtComfortOffice: OfficeData = {
  id: '2',
  name: 'CDT Comfort Dental',
  dpmsSystem: 'OPEN_DENTAL',
  workingDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
  timeIncrement: 15,
  feeModel: 'PPO',
  providerCount: 7,
  totalDailyGoal: 23100,
  updatedAt: new Date().toISOString(),
  providers: cdtComfortProviders,
  blockTypes: cdtComfortBlockTypes,
  rules: cdtComfortRules,
};

// ============================================================================
// OFFICE 3 - LOS ALTOS (Eaglesoft, 4 providers, MIXED)
// ============================================================================

export const losAltosProviders: ProviderInput[] = [
  {
    id: 'nguyen-3',
    name: 'Dr. Linda Nguyen',
    role: 'DOCTOR',
    operatories: ['OP1', 'OP2'],
    workingStart: '07:30',
    workingEnd: '17:30',
    lunchStart: '12:00',
    lunchEnd: '13:00',
    dailyGoal: 5500,
    color: '#8e44ad', // purple
  },
  {
    id: 'jackson-3',
    name: 'Dr. Marcus Jackson',
    role: 'DOCTOR',
    operatories: ['OP3'],
    workingStart: '08:00',
    workingEnd: '16:00',
    lunchStart: '13:00',
    lunchEnd: '14:00',
    dailyGoal: 4200,
    color: '#c0392b', // dark red
  },
  {
    id: 'kim-3',
    name: 'Susan Kim RDH',
    role: 'HYGIENIST',
    operatories: ['HYG1'],
    workingStart: '07:30',
    workingEnd: '16:30',
    lunchStart: '12:30',
    lunchEnd: '13:00',
    dailyGoal: 2800,
    color: '#16a085', // teal
  },
  {
    id: 'rodriguez-3',
    name: 'Carlos Rodriguez RDH',
    role: 'HYGIENIST',
    operatories: ['HYG2'],
    workingStart: '08:00',
    workingEnd: '17:00',
    lunchStart: '13:00',
    lunchEnd: '13:30',
    dailyGoal: 2500,
    color: '#d35400', // burnt orange
  },
];

export const losAltosBlockTypes: BlockTypeInput[] = [
  {
    id: 'hp-resto-3',
    label: 'HP RESTO',
    description: 'High production restorative - crowns, bridges, $1500+',
    minimumAmount: 1500,
    appliesToRole: 'DOCTOR',
    durationMin: 80,
    durationMax: 100,
  },
  {
    id: 'mp-resto-3',
    label: 'MP RESTO',
    description: 'Medium production - multi-surface fillings, $400-1500',
    minimumAmount: 400,
    appliesToRole: 'DOCTOR',
    durationMin: 40,
    durationMax: 60,
  },
  {
    id: 'lp-resto-3',
    label: 'LP RESTO',
    description: 'Low production - single surface fillings, $200-400',
    minimumAmount: 200,
    appliesToRole: 'DOCTOR',
    durationMin: 30,
    durationMax: 40,
  },
  {
    id: 'consult-3',
    label: 'CONSULT',
    description: 'New patient or treatment consultation',
    minimumAmount: 200,
    appliesToRole: 'DOCTOR',
    durationMin: 40,
    durationMax: 60,
  },
  {
    id: 'endo-3',
    label: 'ENDO',
    description: 'Endodontic treatment - root canal',
    minimumAmount: 1200,
    appliesToRole: 'DOCTOR',
    durationMin: 90,
    durationMax: 120,
  },
  {
    id: 'seat-3',
    label: 'SEAT',
    description: 'Crown/bridge seat and delivery',
    minimumAmount: 50,
    appliesToRole: 'DOCTOR',
    durationMin: 30,
  },
  {
    id: 'recall-3',
    label: 'RECALL',
    description: 'Recall prophylaxis',
    minimumAmount: 180,
    appliesToRole: 'HYGIENIST',
    durationMin: 60,
  },
  {
    id: 'perio-3',
    label: 'PERIO',
    description: 'Periodontal therapy',
    minimumAmount: 380,
    appliesToRole: 'HYGIENIST',
    durationMin: 80,
    durationMax: 100,
  },
  {
    id: 'np-adult-3',
    label: 'NP ADULT',
    description: 'New patient adult - full exam and prophy',
    minimumAmount: 350,
    appliesToRole: 'HYGIENIST',
    durationMin: 80,
    durationMax: 100,
  },
  {
    id: 'fluor-3',
    label: 'FLUOR',
    description: 'Fluoride treatment add-on',
    minimumAmount: 40,
    appliesToRole: 'HYGIENIST',
    durationMin: 10,
  },
];

export const losAltosRules: ScheduleRules = {
  npModel: 'HYGIENIST_ONLY',
  npBlocksPerDay: 2,
  srpBlocksPerDay: 1,
  hpPlacement: 'MORNING',
  doubleBooking: false,
  matrixing: true,
  emergencyHandling: 'DEDICATED',
};

export const losAltosOffice: OfficeData = {
  id: '3',
  name: 'Los Altos',
  dpmsSystem: 'EAGLESOFT',
  workingDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
  timeIncrement: 20,
  feeModel: 'MIXED',
  providerCount: 4,
  totalDailyGoal: 15000,
  updatedAt: new Date().toISOString(),
  providers: losAltosProviders,
  blockTypes: losAltosBlockTypes,
  rules: losAltosRules,
};

// ============================================================================
// OFFICE 4 - KCC CLAY CENTER (Dentrix, 4 providers, UCR, small town)
// ============================================================================

export const kccClayProviders: ProviderInput[] = [
  {
    id: 'anderson-4',
    name: 'Dr. Tom Anderson',
    role: 'DOCTOR',
    operatories: ['OP1', 'OP2'],
    workingStart: '08:00',
    workingEnd: '17:00',
    lunchStart: '12:00',
    lunchEnd: '13:00',
    dailyGoal: 3800,
    color: '#27ae60', // green
  },
  {
    id: 'miller-4',
    name: 'Dr. Sarah Miller',
    role: 'DOCTOR',
    operatories: ['OP3'],
    workingStart: '08:00',
    workingEnd: '16:00',
    lunchStart: '12:00',
    lunchEnd: '13:00',
    dailyGoal: 3200,
    color: '#2980b9', // blue
  },
  {
    id: 'peters-4',
    name: 'Katie Peters RDH',
    role: 'HYGIENIST',
    operatories: ['HYG1'],
    workingStart: '08:00',
    workingEnd: '17:00',
    lunchStart: '12:00',
    lunchEnd: '13:00',
    dailyGoal: 2000,
    color: '#e74c3c', // coral
  },
  {
    id: 'weber-4',
    name: 'Amy Weber RDH',
    role: 'HYGIENIST',
    operatories: ['HYG2'],
    workingStart: '08:00',
    workingEnd: '16:00',
    lunchStart: '12:00',
    lunchEnd: '13:00',
    dailyGoal: 1800,
    color: '#f1c40f', // yellow
  },
];

export const kccClayBlockTypes: BlockTypeInput[] = [
  {
    id: 'crown-4',
    label: 'CROWN',
    description: 'Crown preparation',
    minimumAmount: 1300,
    appliesToRole: 'DOCTOR',
    durationMin: 60,
    durationMax: 75,
  },
  {
    id: 'bridge-4',
    label: 'BRIDGE',
    description: 'Bridge preparation',
    minimumAmount: 2500,
    appliesToRole: 'DOCTOR',
    durationMin: 90,
    durationMax: 120,
  },
  {
    id: 'fill-4',
    label: 'FILL',
    description: 'Restorative filling',
    minimumAmount: 280,
    appliesToRole: 'DOCTOR',
    durationMin: 30,
    durationMax: 45,
  },
  {
    id: 'exam-4',
    label: 'EXAM',
    description: 'Comprehensive or limited exam',
    minimumAmount: 100,
    appliesToRole: 'DOCTOR',
    durationMin: 30,
    durationMax: 45,
  },
  {
    id: 'ext-4',
    label: 'EXT',
    description: 'Simple extraction',
    minimumAmount: 200,
    appliesToRole: 'DOCTOR',
    durationMin: 30,
    durationMax: 45,
  },
  {
    id: 'np-4',
    label: 'NP',
    description: 'New patient visit',
    minimumAmount: 250,
    appliesToRole: 'DOCTOR',
    durationMin: 45,
    durationMax: 60,
  },
  {
    id: 'emerg-4',
    label: 'EMERG',
    description: 'Emergency same-day',
    minimumAmount: 150,
    appliesToRole: 'DOCTOR',
    durationMin: 30,
  },
  {
    id: 'adult-prophy-4',
    label: 'ADULT PROPHY',
    description: 'Adult cleaning',
    minimumAmount: 160,
    appliesToRole: 'HYGIENIST',
    durationMin: 50,
    durationMax: 60,
  },
  {
    id: 'child-clean-4',
    label: 'CHILD CLEAN',
    description: 'Child prophylaxis',
    minimumAmount: 90,
    appliesToRole: 'HYGIENIST',
    durationMin: 40,
  },
  {
    id: 'pm-4',
    label: 'PM',
    description: 'Periodontal maintenance',
    minimumAmount: 220,
    appliesToRole: 'HYGIENIST',
    durationMin: 60,
  },
  {
    id: 'srp-4',
    label: 'SRP',
    description: 'Scaling and root planing',
    minimumAmount: 320,
    appliesToRole: 'HYGIENIST',
    durationMin: 60,
    durationMax: 90,
  },
];

export const kccClayRules: ScheduleRules = {
  npModel: 'DOCTOR_ONLY',
  npBlocksPerDay: 1,
  srpBlocksPerDay: 1,
  hpPlacement: 'MORNING',
  doubleBooking: false,
  matrixing: false,
  emergencyHandling: 'FLEX',
};

export const kccClayOffice: OfficeData = {
  id: '4',
  name: 'KCC Clay Center',
  dpmsSystem: 'DENTRIX',
  workingDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
  timeIncrement: 15,
  feeModel: 'UCR',
  providerCount: 4,
  totalDailyGoal: 10800,
  updatedAt: new Date().toISOString(),
  providers: kccClayProviders,
  blockTypes: kccClayBlockTypes,
  rules: kccClayRules,
};

// ============================================================================
// OFFICE 5 - NHD RIDGEVIEW (Open Dental, 4 providers, PPO, 4-day week)
// ============================================================================

export const nhdRidgeviewProviders: ProviderInput[] = [
  {
    id: 'walsh-5',
    name: 'Dr. Patrick Walsh',
    role: 'DOCTOR',
    operatories: ['OP1', 'OP2'],
    workingStart: '07:00',
    workingEnd: '18:00',
    lunchStart: '13:00',
    lunchEnd: '14:00',
    dailyGoal: 6000,
    color: '#9b59b6', // purple
  },
  {
    id: 'foster-5',
    name: 'Dr. Rachel Foster',
    role: 'DOCTOR',
    operatories: ['OP3'],
    workingStart: '08:00',
    workingEnd: '17:00',
    lunchStart: '12:00',
    lunchEnd: '13:00',
    dailyGoal: 4800,
    color: '#e91e63', // pink
  },
  {
    id: 'torres-5',
    name: 'Isabella Torres RDH',
    role: 'HYGIENIST',
    operatories: ['HYG1'],
    workingStart: '07:00',
    workingEnd: '17:00',
    lunchStart: '12:00',
    lunchEnd: '12:30',
    dailyGoal: 2600,
    color: '#00bcd4', // cyan
  },
  {
    id: 'brooks-5',
    name: 'Michael Brooks RDH',
    role: 'HYGIENIST',
    operatories: ['HYG2'],
    workingStart: '08:00',
    workingEnd: '18:00',
    lunchStart: '13:00',
    lunchEnd: '13:30',
    dailyGoal: 2400,
    color: '#ff9800', // orange
  },
];

export const nhdRidgeviewBlockTypes: BlockTypeInput[] = [
  {
    id: 'implant-5',
    label: 'IMPLANT',
    description: 'Implant surgery or restoration',
    minimumAmount: 2200,
    appliesToRole: 'DOCTOR',
    durationMin: 90,
    durationMax: 120,
  },
  {
    id: 'crown-5',
    label: 'CROWN',
    description: 'Single crown preparation',
    minimumAmount: 1350,
    appliesToRole: 'DOCTOR',
    durationMin: 60,
    durationMax: 90,
  },
  {
    id: 'veneers-5',
    label: 'VENEERS',
    description: 'Veneer preparation',
    minimumAmount: 1800,
    appliesToRole: 'DOCTOR',
    durationMin: 90,
  },
  {
    id: 'endo-5',
    label: 'ENDO',
    description: 'Root canal therapy',
    minimumAmount: 1100,
    appliesToRole: 'DOCTOR',
    durationMin: 75,
    durationMax: 90,
  },
  {
    id: 'resto-5',
    label: 'RESTO',
    description: 'Composite restorations',
    minimumAmount: 350,
    appliesToRole: 'DOCTOR',
    durationMin: 40,
    durationMax: 60,
  },
  {
    id: 'np-comp-5',
    label: 'NP COMP',
    description: 'New patient comprehensive exam',
    minimumAmount: 220,
    appliesToRole: 'DOCTOR',
    durationMin: 45,
    durationMax: 60,
  },
  {
    id: 'limited-5',
    label: 'LIMITED',
    description: 'Limited exam and treatment',
    minimumAmount: 150,
    appliesToRole: 'DOCTOR',
    durationMin: 30,
  },
  {
    id: 'emergency-5',
    label: 'EMERGENCY',
    description: 'Emergency appointment',
    minimumAmount: 180,
    appliesToRole: 'DOCTOR',
    durationMin: 30,
    durationMax: 45,
  },
  {
    id: 'recall-5',
    label: 'RECALL',
    description: 'Regular recall cleaning',
    minimumAmount: 170,
    appliesToRole: 'HYGIENIST',
    durationMin: 60,
  },
  {
    id: 'perio-maint-5',
    label: 'PERIO MAINT',
    description: 'Periodontal maintenance therapy',
    minimumAmount: 240,
    appliesToRole: 'HYGIENIST',
    durationMin: 60,
    durationMax: 75,
  },
  {
    id: 'debride-5',
    label: 'DEBRIDE',
    description: 'Full mouth debridement',
    minimumAmount: 200,
    appliesToRole: 'HYGIENIST',
    durationMin: 45,
  },
  {
    id: 'np-hyg-5',
    label: 'NP HYG',
    description: 'New patient hygiene appointment',
    minimumAmount: 380,
    appliesToRole: 'HYGIENIST',
    durationMin: 75,
    durationMax: 90,
  },
];

export const nhdRidgeviewRules: ScheduleRules = {
  npModel: 'EITHER',
  npBlocksPerDay: 2,
  srpBlocksPerDay: 2,
  hpPlacement: 'ANY',
  doubleBooking: true,
  matrixing: true,
  emergencyHandling: 'ACCESS_BLOCKS',
};

export const nhdRidgeviewOffice: OfficeData = {
  id: '5',
  name: 'NHD Ridgeview',
  dpmsSystem: 'OPEN_DENTAL',
  workingDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY'],
  timeIncrement: 15,
  feeModel: 'PPO',
  providerCount: 4,
  totalDailyGoal: 15800,
  updatedAt: new Date().toISOString(),
  providers: nhdRidgeviewProviders,
  blockTypes: nhdRidgeviewBlockTypes,
  rules: nhdRidgeviewRules,
};

// ============================================================================
// DEFAULT FALLBACKS (for backwards compatibility)
// ============================================================================

export const defaultBlockTypes: BlockTypeInput[] = [
  {
    id: 'hp-default',
    label: 'HP',
    description: 'High Production - crowns, implants, greater than $1200',
    minimumAmount: 1200,
    appliesToRole: 'DOCTOR',
    durationMin: 60,
    durationMax: 90,
    // D-time: doctor hands-on (prep, injection, buildup). A-time: patient waits (matrix, temporization)
    dTimeMin: 30,
    aTimeMin: 30,
  },
  {
    id: 'crown-prep-default',
    label: 'Crown Prep',
    description: 'Crown preparation and buildup - greater than $1200',
    minimumAmount: 1200,
    appliesToRole: 'DOCTOR',
    durationMin: 60,
    durationMax: 90,
    dTimeMin: 40,
    aTimeMin: 20,
  },
  {
    id: 'mp-default',
    label: 'MP',
    description: 'Medium Production - fillings, smaller restorative',
    minimumAmount: 300,
    appliesToRole: 'DOCTOR',
    durationMin: 30,
    durationMax: 60,
    dTimeMin: 20,
    aTimeMin: 10,
  },
  {
    id: 'np-cons-default',
    label: 'NP CONS',
    description: 'New Patient Consultation',
    minimumAmount: 150,
    appliesToRole: 'DOCTOR',
    durationMin: 30,
    durationMax: 60,
    dTimeMin: 30,
    aTimeMin: 0,
  },
  {
    id: 'non-prod-default',
    label: 'NON-PROD',
    description: 'Non-productive - crown seats, adjustments',
    minimumAmount: 0,
    appliesToRole: 'DOCTOR',
    durationMin: 20,
    durationMax: 30,
    dTimeMin: 20,
    aTimeMin: 0,
  },
  {
    id: 'er-default',
    label: 'ER',
    description: 'Emergency - limited exam, urgent care',
    minimumAmount: 100,
    appliesToRole: 'DOCTOR',
    durationMin: 20,
    durationMax: 30,
    dTimeMin: 20,
    aTimeMin: 0,
  },
  {
    id: 'recare-default',
    label: 'Recare',
    description: 'Recall/Prophy - routine cleaning, greater than $150',
    minimumAmount: 150,
    appliesToRole: 'HYGIENIST',
    durationMin: 50,
    durationMax: 60,
    // For hygienist appts: D-time = doctor's exam check, A-time = hygienist handles the rest
    dTimeMin: 10,
    aTimeMin: 40,
  },
  {
    id: 'pm-default',
    label: 'PM',
    description: 'Perio Maintenance - greater than $190',
    minimumAmount: 190,
    appliesToRole: 'HYGIENIST',
    durationMin: 60,
    dTimeMin: 10,
    aTimeMin: 50,
  },
  {
    id: 'npe-default',
    label: 'NPE',
    description: 'New Patient Exam - greater than $300',
    minimumAmount: 300,
    appliesToRole: 'HYGIENIST',
    durationMin: 60,
    durationMax: 90,
    dTimeMin: 15,
    aTimeMin: 45,
  },
  {
    id: 'aht-perio-default',
    label: 'AHT/Perio',
    description: 'Adult Hygiene Treatment/Periodontal - greater than $300',
    minimumAmount: 300,
    appliesToRole: 'HYGIENIST',
    durationMin: 60,
    durationMax: 90,
    dTimeMin: 10,
    aTimeMin: 50,
  },
  {
    id: 'srp-default',
    label: 'SRP',
    description: 'Scaling & Root Planing - greater than $300',
    minimumAmount: 300,
    appliesToRole: 'HYGIENIST',
    durationMin: 60,
    durationMax: 90,
    dTimeMin: 5,
    aTimeMin: 55,
  },
  {
    id: 'npe-doc-default',
    label: 'NP',
    description: 'New Patient - comprehensive exam and records',
    minimumAmount: 300,
    appliesToRole: 'DOCTOR',
    durationMin: 45,
    durationMax: 60,
    dTimeMin: 40,
    aTimeMin: 5,
  },
  {
    id: 'assisted-hyg-default',
    label: 'Assisted Hyg',
    description: 'Assisted Hygiene - 2-3 chair rotation with assistant support. Hygienist moves between chairs while assistant handles prep/cleanup.',
    minimumAmount: 150,
    appliesToRole: 'HYGIENIST',
    durationMin: 45,
    durationMax: 60,
    dTimeMin: 15,
    aTimeMin: 30,
    color: '#0ea5e9', // sky blue / teal-cyan
  },
];

export const defaultRules: ScheduleRules = {
  npModel: 'DOCTOR_ONLY',
  npBlocksPerDay: 2,
  srpBlocksPerDay: 2,
  hpPlacement: 'MORNING',
  doubleBooking: true,
  matrixing: true,
  emergencyHandling: 'ACCESS_BLOCKS',
};

// ============================================================================
// MOCK OFFICES ARRAY - ALL 5 COMPLETE
// ============================================================================

export const mockOffices: OfficeData[] = [
  smileCascadeOffice,
  cdtComfortOffice,
  losAltosOffice,
  kccClayOffice,
  nhdRidgeviewOffice,
];

// Golden-harness fixture alias — canonical 5 offices used by the regression
// harness (Loop 1) and downstream loop telemetry scripts. Consumers import
// `GOLDEN_OFFICES` specifically to signal "this must match the snapshot set".
export const GOLDEN_OFFICES: OfficeData[] = mockOffices;

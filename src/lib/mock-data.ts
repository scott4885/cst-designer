import { ProviderInput, BlockTypeInput, ScheduleRules, GenerationResult } from './engine/types';

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
  providers?: ProviderInput[];
  blockTypes?: BlockTypeInput[];
  rules?: ScheduleRules;
}

// Smile Cascade - Full detailed data
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

// Mock offices list
export const mockOffices: OfficeData[] = [
  smileCascadeOffice,
  {
    id: '2',
    name: 'CDT Comfort Dental',
    dpmsSystem: 'OPEN_DENTAL',
    workingDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
    timeIncrement: 10,
    feeModel: 'PPO',
    providerCount: 7,
    totalDailyGoal: 18500,
    updatedAt: new Date().toISOString(),
  },
  {
    id: '3',
    name: 'Los Altos',
    dpmsSystem: 'EAGLESOFT',
    workingDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
    timeIncrement: 10,
    feeModel: 'MIXED',
    providerCount: 4,
    totalDailyGoal: 15000,
    updatedAt: new Date().toISOString(),
  },
  {
    id: '4',
    name: 'KCC Clay Center',
    dpmsSystem: 'DENTRIX',
    workingDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
    timeIncrement: 10,
    feeModel: 'UCR',
    providerCount: 4,
    totalDailyGoal: 12000,
    updatedAt: new Date().toISOString(),
  },
  {
    id: '5',
    name: 'NHD Ridgeview',
    dpmsSystem: 'OPEN_DENTAL',
    workingDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY'],
    timeIncrement: 10,
    feeModel: 'PPO',
    providerCount: 4,
    totalDailyGoal: 9800,
    updatedAt: new Date().toISOString(),
  },
];

/**
 * Block Category Classification Helpers
 *
 * Centralizes block type classification logic used across the schedule engine.
 * Maps block types to Rock-Sand-Water tiers and operational categories.
 *
 * @module block-categories
 */

import type { BlockTypeInput, ProviderInput } from './types';

// ---------------------------------------------------------------------------
// Block category UI colors (single source of truth for visual palette)
// ---------------------------------------------------------------------------

/**
 * Visual palette for block categories — shared between the block palette panel,
 * schedule grid, and any component that needs to render a category-colored swatch.
 *
 * Colors: soft pastel bg + saturated accent border + darker text.
 * Conflict (red) and D-time-overlap (orange) share the palette via REGION_COLORS
 * so conflict highlights stay visually consistent with HP/ER categories.
 */
export const BLOCK_CATEGORY_COLORS = {
  HP:       { bg: '#FEF2F2', border: '#EF4444', text: '#991B1B' },
  MP:       { bg: '#FFFBEB', border: '#F59E0B', text: '#92400E' },
  NP:       { bg: '#F5F3FF', border: '#8B5CF6', text: '#5B21B6' },
  ER:       { bg: '#FFF1F2', border: '#FB7185', text: '#9F1239' },
  SRP:      { bg: '#F0FDF4', border: '#22C55E', text: '#166534' },
  RECARE:   { bg: '#ECFDF5', border: '#10B981', text: '#065F46' },
  PM:       { bg: '#F0FDFA', border: '#14B8A6', text: '#115E59' },
  NON_PROD: { bg: '#F0F9FF', border: '#38BDF8', text: '#075985' },
  LUNCH:    { bg: '#F9FAFB', border: '#D1D5DB', text: '#374151' },
  DEFAULT:  { bg: '#F9FAFB', border: '#94A3B8', text: '#334155' },
} as const;

/** Semantic conflict / warning colors used by the grid overlay. */
export const CONFLICT_COLORS = {
  HARD: '#EF4444',         // double-booking
  DTIME_OVERLAP: '#F97316', // D-time overlap (softer orange)
} as const;

/**
 * Convert a 6-digit hex (`#RRGGBB`) to an `rgba(...)` string at the given alpha.
 * Safe replacement for `hexColor + "30"` style concatenation which produces
 * 8-digit hex (valid but inconsistent with sRGB alpha math across older rendering paths).
 */
export function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return hex;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/**
 * Map a case-insensitive label prefix to a palette entry.
 * Returns the DEFAULT swatch when no match is found.
 */
export function getBlockCategoryColors(label: string): typeof BLOCK_CATEGORY_COLORS[keyof typeof BLOCK_CATEGORY_COLORS] {
  const lower = label.toLowerCase().replace(/[^a-z-]/g, '');
  if (lower.startsWith('hp')) return BLOCK_CATEGORY_COLORS.HP;
  if (lower.startsWith('mp')) return BLOCK_CATEGORY_COLORS.MP;
  if (lower.startsWith('np')) return BLOCK_CATEGORY_COLORS.NP;
  if (lower.startsWith('er')) return BLOCK_CATEGORY_COLORS.ER;
  if (lower.startsWith('srp')) return BLOCK_CATEGORY_COLORS.SRP;
  if (lower.startsWith('rec')) return BLOCK_CATEGORY_COLORS.RECARE;
  if (lower.startsWith('pm')) return BLOCK_CATEGORY_COLORS.PM;
  if (lower.startsWith('non-prod') || lower.startsWith('nonprod')) return BLOCK_CATEGORY_COLORS.NON_PROD;
  if (lower.startsWith('lunch')) return BLOCK_CATEGORY_COLORS.LUNCH;
  return BLOCK_CATEGORY_COLORS.DEFAULT;
}

// ---------------------------------------------------------------------------
// Block category type (operational scheduling category)
// ---------------------------------------------------------------------------

export type BlockCategory =
  | 'HP'           // High Production (crown, implant, endo, bridge)
  | 'NP'           // New Patient consult/exam
  | 'SRP'          // Scaling & Root Planing
  | 'ER'           // Emergency / access
  | 'MP'           // Medium Production (fillings, composites)
  | 'RECARE'       // Recall / prophy
  | 'PM'           // Perio Maintenance
  | 'NON_PROD'     // Non-productive (crown seat, adjustment)
  | 'ASSISTED_HYG' // Assisted Hygiene rotation
  | 'OTHER';

// ---------------------------------------------------------------------------
// Rock-Sand-Water tier classification
// ---------------------------------------------------------------------------

/** Rock-Sand-Water production tier */
export type RSWTier = 'ROCK' | 'SAND' | 'WATER';

/**
 * Map a block category to its Rock-Sand-Water tier.
 *
 * - ROCK: HP, SRP — high-value procedures that anchor the day ($1200+)
 * - SAND: MP, NP, ER, PM — mid-value fillers ($800-1200)
 * - WATER: NON_PROD, RECARE, ASSISTED_HYG — low-value / zero-value slots ($0-800)
 */
export function categoryToRSWTier(category: BlockCategory): RSWTier {
  switch (category) {
    case 'HP':
    case 'SRP':
      return 'ROCK';
    case 'MP':
    case 'NP':
    case 'ER':
    case 'PM':
      return 'SAND';
    case 'NON_PROD':
    case 'RECARE':
    case 'ASSISTED_HYG':
    case 'OTHER':
      return 'WATER';
  }
}

// ---------------------------------------------------------------------------
// Label-based category inference
// ---------------------------------------------------------------------------

/**
 * Identify the scheduling category of a block by its label string.
 * Order matters — more specific patterns are matched first.
 *
 * @param label - The block type label to classify
 * @returns The identified BlockCategory
 */
export function categorizeLabel(label: string): BlockCategory {
  const lbl = label.toUpperCase();
  // Order matters — more specific first
  if (lbl.includes('ASSISTED HYG') || lbl.includes('ASSISTED HYGIENE') || lbl === 'AH') return 'ASSISTED_HYG';
  if (lbl.includes('SRP') || lbl.includes('AHT') || lbl.includes('PERIO SRP')) return 'SRP';
  if (lbl.includes('NON-PROD') || lbl === 'SEAT') return 'NON_PROD';
  if (lbl.includes('NP') || lbl.includes('CONSULT') || lbl === 'EXAM') return 'NP';
  if (lbl.includes('ER') || lbl.includes('EMER') || lbl.includes('EMERGENCY') || lbl === 'LIMITED') return 'ER';
  if (lbl.includes('HP') || lbl.includes('CROWN') || lbl.includes('IMPLANT') || lbl.includes('BRIDGE') || lbl.includes('VENEERS') || lbl.includes('ENDO')) return 'HP';
  if (lbl.includes('MP') || lbl.includes('FILL') || lbl.includes('RESTO')) return 'MP';
  if (lbl.includes('RECARE') || lbl.includes('RECALL') || lbl.includes('PROPHY')) return 'RECARE';
  if (lbl.includes('PM') || lbl.includes('PERIO MAINT') || lbl.includes('DEBRIDE')) return 'PM';
  return 'OTHER';
}

/**
 * Categorize a BlockTypeInput by its label.
 *
 * @param bt - The block type to classify
 * @returns The identified BlockCategory
 */
export function categorize(bt: BlockTypeInput): BlockCategory {
  return categorizeLabel(bt.label);
}

/**
 * Check if a block type applies to a given provider based on role matching.
 * Hygiene-typed blocks must never be placed in Doctor columns.
 *
 * @param bt - The block type to check
 * @param provider - The provider to check against
 * @returns true if the block can be placed for this provider
 */
export function blockAppliesToProvider(bt: BlockTypeInput, provider: ProviderInput): boolean {
  if (provider.role === 'DOCTOR' && bt.isHygieneType) return false;
  return bt.appliesToRole === 'BOTH' || bt.appliesToRole === provider.role;
}

// ---------------------------------------------------------------------------
// Default block type factories
// ---------------------------------------------------------------------------

/**
 * Default block definitions — durations and staffing patterns extracted from
 * 6 real practice multi-column templates (see .rebuild-research/extracted-patterns.md).
 * Patterns are 10-min-slot arrays; durations match pattern.length * 10.
 */
export const DEFAULT_BLOCKS: Record<string, Omit<BlockTypeInput, 'id'>> = {
  HP: {
    label: 'HP',
    description: 'High Production (> $1800)',
    minimumAmount: 1800,
    appliesToRole: 'DOCTOR',
    durationMin: 80,
    pattern: ['A', 'A', 'D', 'D', 'D', 'D', 'A', 'A'],
  },
  NP: {
    label: 'NP CONS',
    description: 'New Patient Consult (doctor)',
    minimumAmount: 300,
    appliesToRole: 'DOCTOR',
    durationMin: 40,
    pattern: ['A', 'D', 'D', 'A'],
  },
  NP_HYG: {
    label: 'NP',
    description: 'New Patient (hygiene, with doctor exam)',
    minimumAmount: 300,
    appliesToRole: 'HYGIENIST',
    durationMin: 90,
    pattern: ['H', 'H', 'H', 'H', 'H', 'D', 'D', 'D', 'H'],
    isHygieneType: true,
  },
  MP: {
    label: 'MP',
    description: 'Medium Production',
    minimumAmount: 375,
    appliesToRole: 'DOCTOR',
    durationMin: 40,
    pattern: ['A', 'D', 'D', 'A'],
  },
  ER: {
    label: 'ER',
    description: 'Emergency Access',
    minimumAmount: 187,
    appliesToRole: 'DOCTOR',
    durationMin: 30,
    pattern: ['A', 'D', 'A'],
  },
  NON_PROD: {
    label: 'NON-PROD',
    description: 'Non-Productive',
    minimumAmount: 0,
    appliesToRole: 'DOCTOR',
    durationMin: 30,
    pattern: ['A', 'A', 'A'],
  },
  SRP: {
    label: 'SRP',
    description: 'Scaling & Root Planing',
    minimumAmount: 400,
    appliesToRole: 'HYGIENIST',
    durationMin: 60,
    pattern: ['H', 'H', 'H', 'H', 'H', 'H'],
    isHygieneType: true,
  },
  PM: {
    label: 'PM/GING',
    description: 'Perio Maintenance / Gingivitis',
    minimumAmount: 150,
    appliesToRole: 'HYGIENIST',
    durationMin: 60,
    pattern: ['H', 'H', 'H', 'H', 'H', 'H'],
    isHygieneType: true,
  },
  RECARE: {
    label: 'RC/PM',
    description: 'Recall / Perio Maintenance',
    minimumAmount: 130,
    appliesToRole: 'HYGIENIST',
    durationMin: 60,
    pattern: ['H', 'D', 'H', 'H', 'H', 'H'],
    isHygieneType: true,
  },
  ASSISTED_HYG: {
    label: 'Assisted Hyg',
    description: 'Assisted Hygiene (2-3 chair rotation)',
    minimumAmount: 150,
    appliesToRole: 'HYGIENIST',
    durationMin: 60,
    color: '#8b5cf6',
    isHygieneType: true,
    pattern: ['H', 'H', 'H', 'H', 'H', 'H'],
  },
};

/**
 * Fallback IDs that MATCH the global Appointment Library (defaultBlockTypes in mock-data.ts).
 * Pattern: "{label-slug}-default"
 */
export const FALLBACK_IDS: Record<string, string> = {
  HP:           'hp-default',
  NP:           'np-cons-default',
  NP_HYG:       'np-hyg-default',
  MP:           'mp-default',
  ER:           'er-default',
  NON_PROD:     'non-prod-default',
  SRP:          'srp-default',
  PM:           'pm-default',
  RECARE:       'recare-default',
  ASSISTED_HYG: 'assisted-hyg-default',
};

/**
 * Get the best matching block type for a category from the configured block types.
 * Falls back to a synthetic default if the office hasn't configured that category.
 *
 * @param category - The block category to find
 * @param blocksByCategory - Map of category to available block types
 * @param provider - The provider to filter by role
 * @returns The best block type match, or null if none available
 */
export function getBlockForCategory(
  category: BlockCategory,
  blocksByCategory: Map<string, BlockTypeInput[]>,
  provider: ProviderInput
): BlockTypeInput | null {
  const blocks = blocksByCategory.get(category) || [];
  const applicable = blocks.filter(b => blockAppliesToProvider(b, provider));
  if (applicable.length > 0) return applicable[0];

  // Hygienist + NP → route to NP_HYG (90min H-H-H-H-H-D-D-D-H).
  // Doctor + NP stays on the NP CONS pattern (40min A-D-D-A).
  const defKey: string =
    category === 'NP' && provider.role === 'HYGIENIST' ? 'NP_HYG' : category;
  const def = DEFAULT_BLOCKS[defKey];
  if (def && (def.appliesToRole === 'BOTH' || def.appliesToRole === provider.role)) {
    return { id: FALLBACK_IDS[defKey], ...def };
  }
  return null;
}

/**
 * Get ALL block types for a category (not just the first).
 * Used when multiple variants exist (e.g., CROWN, IMPLANT, ENDO all map to HP).
 *
 * @param category - The block category to find
 * @param blocksByCategory - Map of category to available block types
 * @param provider - The provider to filter by role
 * @returns Array of matching block types
 */
export function getAllBlocksForCategory(
  category: BlockCategory,
  blocksByCategory: Map<string, BlockTypeInput[]>,
  provider: ProviderInput
): BlockTypeInput[] {
  const blocks = blocksByCategory.get(category) || [];
  const applicable = blocks.filter(b => blockAppliesToProvider(b, provider));
  if (applicable.length > 0) return applicable;

  const defKey: string =
    category === 'NP' && provider.role === 'HYGIENIST' ? 'NP_HYG' : category;
  const def = DEFAULT_BLOCKS[defKey];
  if (def && (def.appliesToRole === 'BOTH' || def.appliesToRole === provider.role)) {
    return [{ id: FALLBACK_IDS[defKey], ...def }];
  }
  return [];
}

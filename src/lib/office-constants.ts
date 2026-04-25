/**
 * Single source of truth for the office-intake constants that were
 * previously duplicated in `src/app/offices/new/page.tsx` and
 * `src/app/offices/[id]/edit/page.tsx`. Drift between the two copies
 * is the bug class this dedupes — change a colour or add an operatory
 * here and both surfaces update together.
 */

/** Default operatory codes a new office can pick from. */
export const OPERATORIES = [
  'OP1',
  'OP2',
  'OP3',
  'OP4',
  'OP5',
  'HYG1',
  'HYG2',
  'HYG3',
  'HYG4',
  'Main',
  'Consult Room',
] as const;

/**
 * Provider colour swatch shown in the new/edit forms. Suggested when
 * the user adds a provider; final colour can still be overridden in
 * the picker. Colour-blind-safe ramp tested in scripts/check-contrast.ts.
 */
export const PROVIDER_COLORS = [
  '#ec8a1b', // amber
  '#87bcf3', // sky blue
  '#f4de37', // sunflower
  '#44f2ce', // mint
  '#ff6b9d', // rose
  '#9b59b6', // purple
] as const;

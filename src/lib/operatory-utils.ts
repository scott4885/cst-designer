/**
 * Operatory utility functions
 * Shared logic for operatory limits and validation
 */

export const DOCTOR_MAX_OPERATORIES = 5;
export const HYGIENIST_MAX_OPERATORIES = 2;
export const DEFAULT_OPERATORIES = ['Op 1', 'Op 2', 'Op 3', 'Op 4', 'Op 5'];

export type ProviderRole = 'DOCTOR' | 'HYGIENIST' | 'OTHER';

/**
 * Get the maximum number of operatories allowed for a given role.
 * Doctors: max 5, Hygienists: max 2, Others: same as doctor
 */
export function getOperatoryLimit(role: ProviderRole): number {
  if (role === 'HYGIENIST') return HYGIENIST_MAX_OPERATORIES;
  return DOCTOR_MAX_OPERATORIES; // DOCTOR and OTHER
}

/**
 * Returns true if the provider can still add another operatory.
 */
export function canAddOperatory(
  selected: string[],
  role: ProviderRole
): boolean {
  return selected.length < getOperatoryLimit(role);
}

/**
 * Returns how many more operatories the provider can add.
 */
export function getRemainingOperatories(
  selected: string[],
  role: ProviderRole
): number {
  return Math.max(0, getOperatoryLimit(role) - selected.length);
}

/**
 * Validate a set of selected operatories against the role limit.
 * Returns an error message if the limit is exceeded, or null if valid.
 */
export function validateOperatorySelection(
  selected: string[],
  role: ProviderRole
): string | null {
  const limit = getOperatoryLimit(role);
  if (selected.length > limit) {
    return `${role === 'HYGIENIST' ? 'Hygienist' : 'Doctor'} can have at most ${limit} operator${limit === 1 ? 'y' : 'ies'}`;
  }
  return null;
}

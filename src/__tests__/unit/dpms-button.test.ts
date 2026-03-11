/**
 * Sprint 7 — Task 2: DPMS-Specific Import Button
 * Tests for dpmsNormalized label logic and button visibility.
 */
import { describe, it, expect } from 'vitest';

const DPMS_LABELS: Record<string, string> = {
  OPEN_DENTAL: 'Open Dental',
  DENTRIX: 'Dentrix',
  EAGLESOFT: 'Eaglesoft',
  CURVE_DENTAL: 'Curve',
  CARESTREAM: 'Carestream',
  DSN: 'DSN',
};

function normalizeDpms(raw: string | undefined): string {
  return (raw || '').toUpperCase().replace(/ /g, '_');
}

function getDpmsLabel(raw: string | undefined): string {
  const norm = normalizeDpms(raw);
  return DPMS_LABELS[norm] || 'Open Dental';
}

function shouldShowButton(raw: string | undefined): boolean {
  const norm = normalizeDpms(raw);
  return norm !== 'OTHER';
}

function isOpenDentalBehavior(raw: string | undefined): boolean {
  const norm = normalizeDpms(raw);
  return !norm || norm === 'OPEN_DENTAL';
}

describe('DPMS button label logic', () => {
  it('shows "Open Dental" for OPEN_DENTAL dpmsSystem', () => {
    expect(getDpmsLabel('OPEN_DENTAL')).toBe('Open Dental');
  });

  it('shows "Dentrix" for DENTRIX dpmsSystem', () => {
    expect(getDpmsLabel('DENTRIX')).toBe('Dentrix');
  });

  it('shows "Eaglesoft" for EAGLESOFT dpmsSystem', () => {
    expect(getDpmsLabel('EAGLESOFT')).toBe('Eaglesoft');
  });

  it('defaults to "Open Dental" for empty/unset dpmsSystem', () => {
    expect(getDpmsLabel(undefined)).toBe('Open Dental');
    expect(getDpmsLabel('')).toBe('Open Dental');
  });

  it('defaults to "Open Dental" for unrecognized DPMS', () => {
    expect(getDpmsLabel('SOME_NEW_SYSTEM')).toBe('Open Dental');
  });
});

describe('DPMS button visibility', () => {
  it('hides button for OTHER dpmsSystem', () => {
    expect(shouldShowButton('OTHER')).toBe(false);
  });

  it('shows button for all other DPMS values', () => {
    expect(shouldShowButton('OPEN_DENTAL')).toBe(true);
    expect(shouldShowButton('DENTRIX')).toBe(true);
    expect(shouldShowButton('EAGLESOFT')).toBe(true);
    expect(shouldShowButton(undefined)).toBe(true);
  });
});

describe('DPMS open-dental behavior flag', () => {
  it('treats OPEN_DENTAL as opening the export dialog', () => {
    expect(isOpenDentalBehavior('OPEN_DENTAL')).toBe(true);
  });

  it('treats empty/undefined as Open Dental behavior', () => {
    expect(isOpenDentalBehavior(undefined)).toBe(true);
    expect(isOpenDentalBehavior('')).toBe(true);
  });

  it('treats Dentrix, Eaglesoft etc as "coming soon" behavior', () => {
    expect(isOpenDentalBehavior('DENTRIX')).toBe(false);
    expect(isOpenDentalBehavior('EAGLESOFT')).toBe(false);
    expect(isOpenDentalBehavior('CURVE_DENTAL')).toBe(false);
  });
});

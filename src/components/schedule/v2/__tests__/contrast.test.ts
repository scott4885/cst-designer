/**
 * contrast.test.ts — Sprint 2 Stream C (Polish)
 *
 * Every provider slot, severity colour, and the focus-ring token must meet
 * WCAG 2.2 contrast targets. This test is the regression gate — changing
 * `src/styles/design-tokens.css` without updating here will fail CI.
 */

import { describe, it, expect } from 'vitest';
import {
  verifyProviderContrast,
  verifySeverityContrast,
  verifyFocusRing,
  contrastRatio,
} from '../../../../../scripts/check-contrast';

describe('Design tokens — WCAG contrast', () => {
  it('every provider slot meets text AA (≥ 4.5 : 1) against white', () => {
    const rows = verifyProviderContrast();
    const failures = rows.filter((r) => !r.pass);
    if (failures.length) {
      const msg = failures
        .map((r) => `${r.label}: ${r.ratio.toFixed(2)} < ${r.min}`)
        .join('\n');
      throw new Error(`Provider contrast failures:\n${msg}`);
    }
    expect(rows).toHaveLength(10);
  });

  it('every severity fg meets text AA (≥ 4.5 : 1) and border/surface meets non-text AA (≥ 3 : 1)', () => {
    const rows = verifySeverityContrast();
    const failures = rows.filter((r) => !r.pass);
    if (failures.length) {
      const msg = failures
        .map((r) => `${r.label}: ${r.ratio.toFixed(2)} < ${r.min}`)
        .join('\n');
      throw new Error(`Severity contrast failures:\n${msg}`);
    }
    // 3 severities × (text + non-text) = 6 rows
    expect(rows).toHaveLength(6);
  });

  it('focus ring meets non-text AA (≥ 3 : 1) against white', () => {
    const rows = verifyFocusRing();
    expect(rows[0].pass).toBe(true);
  });

  it('contrastRatio is commutative and clamped', () => {
    // White on white is 1:1; black on white is 21:1.
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 2);
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
    // Order independent
    expect(contrastRatio('#B42318', '#ffffff')).toBeCloseTo(
      contrastRatio('#ffffff', '#B42318'),
      3,
    );
  });
});

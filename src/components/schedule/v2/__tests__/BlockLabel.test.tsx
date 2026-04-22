/**
 * BlockLabel — Sprint 2 Stream B unit tests.
 *
 * Contracts under test:
 *   • deriveShortCode covers Bible §5 canonical labels
 *   • compact mode triggers under COMPACT_THRESHOLD_PX
 *   • full mode wraps the label + shows $production when set
 *   • never emits "…" / truncation markup (UX-L8)
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import BlockLabel, { deriveShortCode } from '../BlockLabel';

describe('deriveShortCode', () => {
  it('returns canonical short codes for Bible §5 labels', () => {
    expect(deriveShortCode('HP — Crown prep')).toBe('HP');
    expect(deriveShortCode('MP composite')).toBe('MP');
    expect(deriveShortCode('ER palliative')).toBe('ER');
    expect(deriveShortCode('NP consult')).toBe('NP');
    expect(deriveShortCode('Recall prophy')).toBe('RC');
    expect(deriveShortCode('SRP UR')).toBe('SRP');
    expect(deriveShortCode('Prophy adult')).toBe('PM');
    expect(deriveShortCode('LUNCH')).toBe('LN');
    expect(deriveShortCode('Non-production')).toBe('NP');
  });

  it('falls back to first 3 chars when no canonical match', () => {
    expect(deriveShortCode('Surgical extraction')).toBe('SUR');
    expect(deriveShortCode('')).toBe('—');
  });
});

describe('BlockLabel rendering', () => {
  it('renders compact form when heightPx < COMPACT_THRESHOLD_PX', () => {
    render(<BlockLabel label="High Production" heightPx={24} />);
    expect(screen.getByTestId('sg-block-label-compact')).toBeDefined();
    expect(screen.queryByTestId('sg-block-label-full')).toBeNull();
    expect(screen.getByText('HP')).toBeDefined();
  });

  it('renders full form when heightPx >= COMPACT_THRESHOLD_PX', () => {
    render(
      <BlockLabel label="High Production" heightPx={64} productionAmount={1400} />,
    );
    expect(screen.getByTestId('sg-block-label-full')).toBeDefined();
    expect(screen.getByText('High Production')).toBeDefined();
    expect(screen.getByText('$1,400')).toBeDefined();
  });

  it('never outputs ellipsis or truncation characters (UX-L8)', () => {
    const longLabel =
      'Ridiculously long block label that should wrap instead of truncate';
    const { container } = render(<BlockLabel label={longLabel} heightPx={72} />);
    expect(container.textContent).not.toContain('…');
    expect(container.textContent).not.toMatch(/\.\.\.$/);
    expect(container.textContent).toContain(longLabel);
  });

  it('renders info glyph in compact mode when showInfoGlyph is true (default)', () => {
    render(<BlockLabel label="HP" heightPx={20} />);
    expect(screen.getByTestId('sg-block-info-glyph')).toBeDefined();
  });

  it('forceCompact=true renders compact even when heightPx would be full', () => {
    render(<BlockLabel label="HP" heightPx={120} forceCompact />);
    expect(screen.getByTestId('sg-block-label-compact')).toBeDefined();
  });
});

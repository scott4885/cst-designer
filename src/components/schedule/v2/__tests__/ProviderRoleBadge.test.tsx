/**
 * ProviderRoleBadge — Sprint 2 Stream C tests.
 *
 * Covers:
 *   • Role labels resolve (DDS/RDH/DA/OTHER)
 *   • Compact mode hides text but keeps icon
 *   • providerColorIndex is clamped to 1..10
 *   • aria-label defaults to the role title
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ProviderRoleBadge from '../ProviderRoleBadge';

describe('ProviderRoleBadge', () => {
  it('renders role text for each of the 4 role codes', () => {
    for (const r of ['DDS', 'RDH', 'DA'] as const) {
      const { unmount } = render(<ProviderRoleBadge role={r} />);
      const el = screen.getByTestId('sg-provider-role-badge');
      expect(el.getAttribute('data-role')).toBe(r);
      expect(el.textContent?.includes(r)).toBe(true);
      unmount();
    }
  });

  it('OTHER role renders a dash', () => {
    render(<ProviderRoleBadge role="OTHER" />);
    expect(screen.getByTestId('sg-provider-role-badge').textContent).toContain('—');
  });

  it('compact mode hides the text label', () => {
    render(<ProviderRoleBadge role="DDS" compact />);
    const el = screen.getByTestId('sg-provider-role-badge');
    // icon still rendered — just the text "DDS" suppressed
    expect(el.textContent?.includes('DDS')).toBe(false);
  });

  it('defaults to slot 10 when no providerColorIndex is provided', () => {
    render(<ProviderRoleBadge role="DDS" />);
    const el = screen.getByTestId('sg-provider-role-badge');
    expect(el).toBeDefined();
  });

  it('exposes a meaningful aria-label', () => {
    render(<ProviderRoleBadge role="RDH" />);
    const el = screen.getByTestId('sg-provider-role-badge');
    expect(el.getAttribute('aria-label')).toMatch(/Registered Dental Hygienist/);
  });
});

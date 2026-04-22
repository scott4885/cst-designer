"use client";

/**
 * ProviderRoleBadge — Sprint 2 Stream C
 * ─────────────────────────────────────
 * Tiny pill next to provider names in the sticky header of the V2 grid
 * that identifies the provider's role at a glance.
 *
 *   DDS  → dentist (doctor)
 *   RDH  → registered dental hygienist
 *   DA   → dental assistant
 *   OTHER→ generic
 *
 * The badge shows:
 *   • a role code (uppercase small-caps)
 *   • a role-appropriate icon (sm variant, 16 px)
 *   • a provider-colour swatch on the left edge
 *
 * Contrast: the pill's text is #111 on a soft provider tint (≥ 14:1),
 * the outer border adds the structural cue.
 *
 * Design-tokens: uses `--sg-provider-{1..10}` and their `-soft` partners.
 */

import { memo } from 'react';
import { IconForProviderRole, type ProviderRoleCode } from './icons';

export interface ProviderRoleBadgeProps {
  role: ProviderRoleCode;
  /** 1..10 colour slot into the design-token palette. */
  providerColorIndex?: number;
  /** When true, render the icon but hide the text code (icon-only mode). */
  compact?: boolean;
  className?: string;
  title?: string;
}

const ROLE_LABELS: Record<ProviderRoleCode, string> = {
  DDS: 'DDS',
  RDH: 'RDH',
  DA: 'DA',
  OTHER: '—',
};

const ROLE_TITLES: Record<ProviderRoleCode, string> = {
  DDS: 'Dentist',
  RDH: 'Registered Dental Hygienist',
  DA: 'Dental Assistant',
  OTHER: 'Other provider',
};

const ProviderRoleBadge = memo(function ProviderRoleBadge({
  role,
  providerColorIndex,
  compact = false,
  className,
  title,
}: ProviderRoleBadgeProps) {
  const slot = providerColorIndex
    ? Math.max(1, Math.min(10, providerColorIndex))
    : 10;
  const swatchVar = `var(--sg-provider-${slot})`;
  const tintVar = `var(--sg-provider-${slot}-soft)`;
  const label = ROLE_LABELS[role];

  return (
    <span
      role="img"
      aria-label={title ?? ROLE_TITLES[role]}
      title={title ?? ROLE_TITLES[role]}
      data-testid="sg-provider-role-badge"
      data-role={role}
      data-micro="true"
      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[var(--font-xs)] font-semibold tabular-nums align-middle ${className ?? ''}`}
      style={{
        background: tintVar,
        borderColor: 'rgba(17,24,39,0.10)',
        color: 'oklch(20% 0.015 255)',
      }}
    >
      <span
        aria-hidden="true"
        className="inline-block rounded-full"
        style={{
          width: 8,
          height: 8,
          background: swatchVar,
          boxShadow: '0 0 0 1px rgba(255,255,255,0.7) inset',
        }}
      />
      <IconForProviderRole role={role} size="sm" className="text-neutral-700 shrink-0" />
      {!compact && <span>{label}</span>}
    </span>
  );
});

export default ProviderRoleBadge;

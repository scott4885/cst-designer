"use client";

/**
 * icons.tsx — Sprint 2 Stream C (Polish)
 * ──────────────────────────────────────
 * Minimal line-icon set for the V2 schedule canvas. Uses lucide-react
 * for the generic icons (information, warning, error, zoom-in, zoom-out,
 * toggle-overlay) plus three bespoke SVGs for dental-specific roles.
 *
 * Every icon supports two sizes via the `size` prop:
 *   • `sm` → 16 px  (inline with --font-sm)
 *   • `md` → 24 px  (toolbar buttons, popover titles)
 *
 * Icons are stroke-based with `currentColor` so they inherit parent text
 * colour. aria-hidden by default; pass `aria-label` for standalone use.
 */

import {
  Info,
  AlertTriangle,
  AlertCircle,
  ZoomIn,
  ZoomOut,
  Layers,
  XCircle,
  ArrowRight,
  type LucideProps,
} from 'lucide-react';
import { type ComponentType, type SVGProps } from 'react';

export type IconSize = 'sm' | 'md';

export const ICON_PX: Record<IconSize, number> = {
  sm: 16,
  md: 24,
};

export interface IconProps {
  size?: IconSize;
  className?: string;
  title?: string;
  'aria-label'?: string;
}

/**
 * Wrap a lucide icon so it exposes the consistent {size, className} API.
 */
function wrapLucide(Component: ComponentType<LucideProps>, testId: string) {
  return function WrappedIcon({ size = 'sm', className, title, ...rest }: IconProps) {
    const px = ICON_PX[size];
    const ariaLabel = rest['aria-label'];
    return (
      <Component
        width={px}
        height={px}
        strokeWidth={1.75}
        className={className}
        data-testid={testId}
        data-icon-size={size}
        aria-hidden={ariaLabel ? undefined : true}
        aria-label={ariaLabel}
        role={ariaLabel ? 'img' : undefined}
      >
        {title ? <title>{title}</title> : null}
      </Component>
    );
  };
}

/* ─── Generic status icons ─────────────────────────────────────── */
export const IconInfo    = wrapLucide(Info,          'sg-icon-info');
export const IconWarning = wrapLucide(AlertTriangle, 'sg-icon-warning');
export const IconError   = wrapLucide(XCircle,       'sg-icon-error');
export const IconSoft    = wrapLucide(AlertCircle,   'sg-icon-soft');

/* ─── Toolbar control icons ────────────────────────────────────── */
export const IconZoomIn        = wrapLucide(ZoomIn,     'sg-icon-zoom-in');
export const IconZoomOut       = wrapLucide(ZoomOut,    'sg-icon-zoom-out');
export const IconToggleOverlay = wrapLucide(Layers,     'sg-icon-toggle-overlay');
export const IconArrowRight    = wrapLucide(ArrowRight, 'sg-icon-arrow-right');

/* ─── Bespoke dental-role icons ─────────────────────────────────
   Embedded inline so the grid stays self-contained and testable
   without an HTTP fetch. Outline-style, stroke-based, 24 / 16 px.
   ────────────────────────────────────────────────────────────── */

interface ExtraSvgProps extends SVGProps<SVGSVGElement> {
  size?: IconSize;
  'aria-label'?: string;
}

function BaseSvg({ size = 'sm', className, children, ...rest }: ExtraSvgProps & { children: React.ReactNode }) {
  const px = ICON_PX[size];
  const ariaLabel = rest['aria-label'];
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      data-icon-size={size}
      aria-hidden={ariaLabel ? undefined : true}
      aria-label={ariaLabel}
      role={ariaLabel ? 'img' : undefined}
    >
      {children}
    </svg>
  );
}

/** Stylised tooth silhouette — doctor / DDS provider role. */
export function IconProviderDentist(props: IconProps) {
  return (
    <BaseSvg {...props} data-testid="sg-icon-provider-dentist">
      <path d="M8 3c-2 0-4 1.5-4 4 0 2 1 3 1 5s-.5 3 0 5 1.5 4 3 4 2-2.5 2-4.5S11 15 12 15s2 1.5 2 3.5S14.5 23 16 23s2.5-2 3-4 0-3 0-5 1-3 1-5c0-2.5-2-4-4-4-1.5 0-2.5 1-4 1s-2.5-1-4-1Z" />
    </BaseSvg>
  );
}

/** Dental mirror — hygienist / RDH provider role. */
export function IconProviderHygienist(props: IconProps) {
  return (
    <BaseSvg {...props} data-testid="sg-icon-provider-hygienist">
      <path d="M6 3v10a6 6 0 0 0 12 0V3" />
      <path d="M9 3h6" />
      <path d="M12 13v8" />
      <path d="M9 21h6" />
    </BaseSvg>
  );
}

/** Hand + circle — dental assistant / DA role. */
export function IconProviderAssistant(props: IconProps) {
  return (
    <BaseSvg {...props} data-testid="sg-icon-provider-assistant">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
    </BaseSvg>
  );
}

/** Dashed cross-op connector — doctor-flow indicator. */
export function IconDoctorFlow(props: IconProps) {
  return (
    <BaseSvg {...props} data-testid="sg-icon-doctor-flow">
      <circle cx="5" cy="6" r="1.5" />
      <circle cx="19" cy="18" r="1.5" />
      <path strokeDasharray="2 2" d="M5 7.5v4c0 2 2 3 4 3h4c2 0 4 1 4 3v1" />
    </BaseSvg>
  );
}

/** Map a ProviderRole string to the correct icon. */
export type ProviderRoleCode = 'DDS' | 'RDH' | 'DA' | 'OTHER';

export function IconForProviderRole({ role, size = 'sm', className }: { role: ProviderRoleCode } & IconProps) {
  if (role === 'DDS') return <IconProviderDentist size={size} className={className} />;
  if (role === 'RDH') return <IconProviderHygienist size={size} className={className} />;
  if (role === 'DA')  return <IconProviderAssistant size={size} className={className} />;
  return <IconInfo size={size} className={className} />;
}

/**
 * check-contrast.ts — Sprint 2 Stream C (Polish)
 * ──────────────────────────────────────────────
 * Programmatic verification that the V2 schedule design-tokens meet WCAG 2.2
 * contrast ratios:
 *   • Body text (font-sm) on white ≥ 4.5 : 1 (AA normal)
 *   • Non-text UI + badge fills vs paired surfaces ≥ 3 : 1 (AA non-text)
 *
 * Colour strategy:
 *   • Hex values are parsed directly via sRGB.
 *   • oklch() strings are converted via a small oklch → sRGB pipeline
 *     (oklch → oklab → linear sRGB → sRGB). Matches the published spec
 *     in CSS Color Module 4 §6.6.
 *
 * This script is side-effect free — `npx tsx scripts/check-contrast.ts`
 * prints a table and exits non-zero if any target is missed.
 * Also re-exported as helpers for the vitest contrast test.
 */

/* ─── Colour maths ───────────────────────────────────────────────── */

type RGB = [number, number, number]; // 0..1 linear or 0..255 sRGB depending on context

function hexToSrgb(hex: string): RGB {
  const v = hex.replace('#', '').trim();
  const full = v.length === 3 ? v.split('').map((c) => c + c).join('') : v;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return [r, g, b];
}

function srgbToLinear(c: number): number {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number): number {
  const x = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(x * 255)));
}

/**
 * oklch() string → sRGB 0..255.
 * Accepts `oklch(55% 0.15 250)` or `oklch(55% 0.15 250 / 0.5)` (alpha dropped
 * for contrast math — we assume opaque over white).
 */
export function oklchToSrgb(input: string): RGB {
  const m = input.match(
    /oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*[\d.]+)?\s*\)/i,
  );
  if (!m) throw new Error(`Not an oklch string: ${input}`);
  const L = parseFloat(m[1]) / 100;
  const C = parseFloat(m[2]);
  const hDeg = parseFloat(m[3]);
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  // oklab → LMS (cubed) → linear sRGB (CSS Color 4 §6.6 matrices).
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ ** 3;
  const mm = m_ ** 3;
  const s = s_ ** 3;

  const lr =  4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s;
  const lg = -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s;
  const lb = -0.0041960863 * l - 0.7034186147 * mm + 1.707614701  * s;

  return [linearToSrgb(lr), linearToSrgb(lg), linearToSrgb(lb)];
}

/** Convert any supported colour string to sRGB 0..255. */
export function toSrgb(s: string): RGB {
  const v = s.trim();
  if (v.startsWith('#')) return hexToSrgb(v);
  if (v.toLowerCase().startsWith('oklch(')) return oklchToSrgb(v);
  // rgb(r g b) or rgb(r,g,b)
  const rgbM = v.match(/rgb\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/i);
  if (rgbM) {
    return [parseInt(rgbM[1], 10), parseInt(rgbM[2], 10), parseInt(rgbM[3], 10)];
  }
  throw new Error(`Unsupported colour: ${s}`);
}

/** WCAG 2.x relative luminance from sRGB 0..255. */
export function luminance([r, g, b]: RGB): number {
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

/** WCAG contrast ratio. */
export function contrastRatio(fg: string, bg: string): number {
  const l1 = luminance(toSrgb(fg));
  const l2 = luminance(toSrgb(bg));
  const [lighter, darker] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (lighter + 0.05) / (darker + 0.05);
}

/* ─── Target token set under verification ───────────────────────── */

// Verbatim from src/styles/design-tokens.css
export const TOKENS = {
  // Provider palette (light theme)
  providers: {
    'sg-provider-1':  'oklch(55% 0.150 250)',
    'sg-provider-2':  'oklch(48% 0.130 160)',
    'sg-provider-3':  'oklch(55% 0.170  55)',
    'sg-provider-4':  'oklch(50% 0.195  25)',
    'sg-provider-5':  'oklch(50% 0.160 295)',
    'sg-provider-6':  'oklch(52% 0.170 345)',
    'sg-provider-7':  'oklch(50% 0.120 200)',
    'sg-provider-8':  'oklch(55% 0.180  45)',
    'sg-provider-9':  'oklch(48% 0.140 275)',
    'sg-provider-10': 'oklch(48% 0.020 255)',
  },
  severity: {
    hard: { fg: '#B42318', surface: '#FEF3F2', border: '#FECDCA' },
    soft: { fg: '#B54708', surface: '#FFFAEB', border: '#FEDF89' },
    info: { fg: '#1849A9', surface: '#EFF4FF', border: '#B2CCFF' },
  },
  focus: { color: 'oklch(52% 0.18 250)' },
} as const;

const WHITE = '#FFFFFF';

/* ─── Assertion helpers (used by vitest + CLI) ──────────────────── */

export interface ContrastRow {
  label: string;
  fg: string;
  bg: string;
  ratio: number;
  min: number;
  pass: boolean;
}

export function verifyProviderContrast(): ContrastRow[] {
  return Object.entries(TOKENS.providers).map(([name, value]) => {
    const ratio = contrastRatio(value, WHITE);
    return {
      label: `${name} vs white (text AA)`,
      fg: value,
      bg: WHITE,
      ratio,
      min: 4.5,
      pass: ratio >= 4.5,
    };
  });
}

export function verifySeverityContrast(): ContrastRow[] {
  const rows: ContrastRow[] = [];
  for (const [name, v] of Object.entries(TOKENS.severity)) {
    const textRatio = contrastRatio(v.fg, WHITE);
    rows.push({
      label: `severity-${name} fg vs white (text AA)`,
      fg: v.fg,
      bg: WHITE,
      ratio: textRatio,
      min: 4.5,
      pass: textRatio >= 4.5,
    });
    // The icon (fg colour) sits inside the paired surface; it's the load-
    // bearing non-text element. Border is a hairline visual-separator only.
    const nonText = contrastRatio(v.fg, v.surface);
    rows.push({
      label: `severity-${name} icon (fg) vs surface (non-text AA)`,
      fg: v.fg,
      bg: v.surface,
      ratio: nonText,
      min: 3,
      pass: nonText >= 3,
    });
  }
  return rows;
}

export function verifyFocusRing(): ContrastRow[] {
  const ratio = contrastRatio(TOKENS.focus.color, WHITE);
  return [
    {
      label: 'focus-ring vs white (non-text AA)',
      fg: TOKENS.focus.color,
      bg: WHITE,
      ratio,
      min: 3,
      pass: ratio >= 3,
    },
  ];
}

export function verifyAll(): ContrastRow[] {
  return [
    ...verifyProviderContrast(),
    ...verifySeverityContrast(),
    ...verifyFocusRing(),
  ];
}

/* ─── CLI entrypoint ────────────────────────────────────────────── */

function runCli() {
  const rows = verifyAll();
  const header = ['Label'.padEnd(52), 'Ratio'.padStart(7), 'Min'.padStart(6), 'Pass'];
  // eslint-disable-next-line no-console
  console.log(header.join('  '));
  // eslint-disable-next-line no-console
  console.log('-'.repeat(80));
  for (const r of rows) {
    const line = [
      r.label.padEnd(52),
      r.ratio.toFixed(2).padStart(7),
      r.min.toFixed(1).padStart(6),
      r.pass ? 'PASS' : 'FAIL',
    ];
    // eslint-disable-next-line no-console
    console.log(line.join('  '));
  }
  const failed = rows.filter((r) => !r.pass);
  if (failed.length > 0) {
    // eslint-disable-next-line no-console
    console.error(`\n${failed.length} contrast check(s) failed.`);
    process.exit(1);
  } else {
    // eslint-disable-next-line no-console
    console.log(`\nAll ${rows.length} contrast checks passed.`);
  }
}

// tsx runs the file; only invoke CLI when executed directly.
// Using import.meta.url guard so imports from tests don't trigger exit.
const isMain =
  typeof process !== 'undefined' &&
  typeof process.argv?.[1] === 'string' &&
  process.argv[1].includes('check-contrast');

if (isMain) runCli();

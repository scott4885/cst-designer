/**
 * Sprint 6 Epic P — Prior-template label synonyms.
 *
 * Maps canonical BlockType codes (HP / MP / NPE / RC / SRP / ER / etc.) to
 * the free-text labels that dental practices actually type into their DPMS
 * (Dentrix / Open Dental / Eaglesoft). Seeded from the six SMILE NM fixture
 * offices plus common industry variants.
 *
 * See SPRINT-6-PLAN §4.3. Match algorithm lives in `prior-template-parser.ts`.
 */

export const BLOCK_SYNONYMS: Record<string, string[]> = {
  // --- High production / rock blocks ---
  HP: [
    'crown',
    'crown prep',
    'cr prep',
    'crn',
    'crn prep',
    'large rest',
    'large restorative',
    'quad dentistry',
    'quad',
    'onlay',
    'inlay',
    'big work',
    'big case',
    'rock',
    'rock block',
    'high production',
    'highprod',
  ],

  // --- Medium production restorative ---
  MP: [
    'filling',
    'fillings',
    'rest',
    'restorative',
    'comp',
    'composite',
    'posterior comp',
    'anterior comp',
    'amalgam',
    'medium production',
    'med prod',
    'med rest',
    'single surface',
    'ss',
    '2 surface',
    'ds',
    'ts',
  ],

  // --- New patient exam ---
  NPE: [
    'new patient',
    'new pt',
    'np exam',
    'np',
    'npe',
    'new patient exam',
    'new patient consult',
    'np consult',
    'new pat',
    'comprehensive exam',
    'comp exam',
    'initial exam',
    'initial visit',
  ],

  // --- Recare / hygiene ---
  RC: [
    'cleaning',
    'clean',
    'prophy',
    'prophylaxis',
    'pro',
    'pph',
    'ph',
    're-care',
    'recare',
    'recare exam',
    'rc',
    'reg cleaning',
    'regular cleaning',
    'hygiene',
    'hyg',
    'routine hygiene',
    'adult prophy',
  ],

  // --- Scaling + root planing (perio) ---
  SRP: [
    'srp',
    'perio',
    'periodontal',
    'scaling',
    'scaling and root planing',
    'root planing',
    'deep clean',
    'deep cleaning',
    'perio maintenance',
    'periodontal maintenance',
    'perio maint',
    'perio recall',
  ],

  // --- Emergency / urgent ---
  ER: [
    'emergency',
    'emerg',
    'er',
    'urgent',
    'limited',
    'limited exam',
    'limited oral eval',
    'toothache',
    'pain visit',
    'walk in',
    'walk-in',
    'same day',
    'sameday',
  ],

  // --- Child / pediatric prophy ---
  CHILD_RC: [
    'child prophy',
    'child cleaning',
    'ped prophy',
    'pediatric cleaning',
    'kids cleaning',
    'child recare',
    'child rc',
    'kid prophy',
  ],

  // --- Huddle / meeting ---
  HUDDLE: ['huddle', 'meeting', 'team mtg', 'team meeting', 'morning huddle', 'pm huddle'],

  // --- Lunch ---
  LUNCH: ['lunch', 'lunch break', 'break'],

  // --- Administrative / non-productive ---
  NONPROD: [
    'nonprod',
    'non-prod',
    'non productive',
    'admin',
    'administrative',
    'paperwork',
    'catchup',
    'catch up',
    'buffer',
    'open',
    'unscheduled',
    'blocked',
  ],

  // --- Exam-only visits (post-op / limited eval) ---
  EXAM: [
    'exam',
    'doctor exam',
    'dr exam',
    'post op',
    'post-op',
    'postop',
    'follow up',
    'follow-up',
    'fu',
    'consult',
    'consultation',
    'tx plan',
    'treatment plan',
  ],

  // --- Endodontic ---
  ENDO: [
    'endo',
    'endodontic',
    'root canal',
    'rct',
    'rc tx',
    'pulp',
    'pulpotomy',
  ],

  // --- Surgical extraction ---
  EXT: [
    'ext',
    'extraction',
    'xr',
    'surg ext',
    'surgical ext',
    'oral surgery',
    'os',
  ],

  // --- Ortho consult ---
  ORTHO: ['ortho', 'orthodontic', 'ortho consult', 'ortho con', 'oc', 'orthodontic consultation'],

  // --- Implant ---
  IMPLANT: [
    'implant',
    'implant consult',
    'implant placement',
    'imp',
    'imp consult',
    'abutment',
  ],
};

/**
 * Production-estimate lookup (industry average) for synthesising a prior
 * template's weekly production. NOT used by the generator — only by the
 * delta engine to produce a rough Current vs Recommended $ comparison.
 *
 * Labeled as "industry estimate" in the UI to avoid confusion with the
 * generator's real productionSummary.
 *
 * See SPRINT-6-PLAN §4.4.
 */
export const BLOCK_PRODUCTION_ESTIMATES: Record<string, number> = {
  HP: 1800,
  MP: 450,
  NPE: 350,
  RC: 180,
  SRP: 420,
  ER: 180,
  CHILD_RC: 120,
  HUDDLE: 0,
  LUNCH: 0,
  NONPROD: 0,
  EXAM: 100,
  ENDO: 1100,
  EXT: 450,
  ORTHO: 250,
  IMPLANT: 1400,
};

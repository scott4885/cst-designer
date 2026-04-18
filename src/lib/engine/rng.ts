/**
 * Deterministic, seedable PRNG for the schedule generator.
 *
 * Uses mulberry32 — tiny, fast, good statistical distribution for our
 * weighted-block-selection use case. NOT cryptographically secure (never use
 * for anything security-sensitive).
 *
 * Design:
 *   - `createSeededRng(seed)` returns a function with the same contract as
 *     `Math.random` (0 ≤ x < 1).
 *   - When the generator receives `seed: undefined`, we fall back to
 *     `Math.random` — preserves legacy behavior for the UI/API path.
 *   - Tests supply a seed per (office, day) pair → reproducible snapshots.
 *
 * @module engine/rng
 */

/**
 * A Math.random-compatible function: returns a float in [0, 1).
 */
export type RngFn = () => number;

/**
 * Create a deterministic PRNG seeded with the given integer.
 *
 * Algorithm: mulberry32 — 32-bit state, outputs a new float on each call.
 * Reference: https://gist.github.com/tommyettinger/46a3c8e0b2a0e7db0a0e
 *
 * @param seed - Any 32-bit integer. Callers typically pass a hashed string.
 * @returns A seeded RNG function.
 */
export function createSeededRng(seed: number): RngFn {
  // Normalize to unsigned 32-bit integer state
  let state = seed >>> 0;
  return function rng() {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Hash an arbitrary string to a 32-bit integer suitable for seeding.
 * FNV-1a variant — deterministic, same input → same output.
 *
 * Used by the golden test harness to derive a stable seed per
 * `(officeId, dayOfWeek)` pair without having to hardcode numbers.
 */
export function hashSeed(input: string): number {
  let h = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0; // FNV prime
  }
  return h >>> 0;
}

/**
 * Default RNG used when the generator is not given a seed.
 * Module-level alias so production code stays in lock-step with Math.random.
 */
export const defaultRng: RngFn = Math.random;

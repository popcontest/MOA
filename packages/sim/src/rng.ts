/**
 * Mulberry32. Chosen because its entire state is one uint32, so the "RNG
 * cursor" the state hash needs is just that number — no extra bookkeeping,
 * no way for a replay to diverge on hidden generator state.
 */

export type Rng = { s: number };

export function makeRng(seed: number): Rng {
  return { s: seed >>> 0 };
}

export function cloneRng(r: Rng): Rng {
  return { s: r.s };
}

export function nextU32(r: Rng): number {
  r.s = (r.s + 0x6d2b79f5) >>> 0;
  let t = r.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}

/** [0, 1). Division by 2^32 is exact, so this is bit-identical everywhere. */
export function nextFloat(r: Rng): number {
  return nextU32(r) / 4294967296;
}

export function nextRange(r: Rng, lo: number, hi: number): number {
  return lo + nextFloat(r) * (hi - lo);
}

/** [0, n). */
export function nextInt(r: Rng, n: number): number {
  return Math.floor(nextFloat(r) * n);
}

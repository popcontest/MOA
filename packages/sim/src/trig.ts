import { SIN_TABLE, TRIG_TABLE_SIZE } from './trig.table';

/**
 * Fixed-resolution trig. Angles are carried as table units ("turns scaled to
 * TRIG_TABLE_SIZE") rather than radians so the hot path never converts.
 *
 * Linear interpolation between 4096 samples has a worst-case error near
 * 2.9e-7, and the interpolation itself is add/sub/mul only, so the result is
 * bit-identical on every engine — which is the whole point.
 */

export const TURN = TRIG_TABLE_SIZE;
const QUARTER = TRIG_TABLE_SIZE / 4;
const UNITS_PER_DEGREE = TRIG_TABLE_SIZE / 360;

function sample(i: number): number {
  const v = SIN_TABLE[i];
  return v === undefined ? 0 : v;
}

/** `units` may be any real; it wraps. */
export function sinUnits(units: number): number {
  let u = units % TURN;
  if (u < 0) u += TURN;
  const i = Math.floor(u);
  const f = u - i;
  const a = sample(i);
  const b = sample(i + 1 === TURN ? 0 : i + 1);
  return a + (b - a) * f;
}

export function cosUnits(units: number): number {
  return sinUnits(units + QUARTER);
}

export function degreesToUnits(deg: number): number {
  return deg * UNITS_PER_DEGREE;
}

export function sinDegrees(deg: number): number {
  return sinUnits(degreesToUnits(deg));
}

export function cosDegrees(deg: number): number {
  return cosUnits(degreesToUnits(deg));
}

/** Rotate (x, y) by `units`. Used for cluster spread; no other rotation exists. */
export function rotate(x: number, y: number, units: number): { x: number; y: number } {
  const c = cosUnits(units);
  const s = sinUnits(units);
  return { x: x * c - y * s, y: x * s + y * c };
}

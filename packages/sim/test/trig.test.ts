import { describe, expect, it } from 'vitest';
import { TURN, cosDegrees, cosUnits, degreesToUnits, rotate, sinDegrees, sinUnits } from '../src/trig';
import { SIN_TABLE, TRIG_TABLE_SIZE } from '../src/trig.table';

describe('trig table', () => {
  it('has the specified resolution', () => {
    expect(TRIG_TABLE_SIZE).toBe(4096);
    expect(SIN_TABLE.length).toBe(4096);
    expect(TURN).toBe(4096);
  });

  it('is a checked-in literal, not something built at load', () => {
    // If this were computed with Math.sin at import time it would be subject to
    // per-engine precision, which is the exact divergence the table exists to
    // prevent. Exact zeros at the quarter points are the cheap tell.
    expect(SIN_TABLE[0]).toBe(0);
    expect(SIN_TABLE[1024]).toBe(1);
    expect(SIN_TABLE[2048]).toBeCloseTo(0, 12);
    expect(SIN_TABLE[3072]).toBe(-1);
  });

  it('tracks Math.sin to better than 1e-6', () => {
    let worst = 0;
    for (let deg = 0; deg < 360; deg += 0.017) {
      const err = Math.abs(sinDegrees(deg) - Math.sin((deg * Math.PI) / 180));
      if (err > worst) worst = err;
    }
    expect(worst).toBeLessThan(1e-6);
  });

  it('tracks Math.cos to better than 1e-6', () => {
    let worst = 0;
    for (let deg = 0; deg < 360; deg += 0.017) {
      const err = Math.abs(cosDegrees(deg) - Math.cos((deg * Math.PI) / 180));
      if (err > worst) worst = err;
    }
    expect(worst).toBeLessThan(1e-6);
  });

  it('wraps in both directions', () => {
    expect(sinUnits(-1024)).toBeCloseTo(sinUnits(3072), 12);
    expect(sinUnits(TURN + 500)).toBeCloseTo(sinUnits(500), 12);
    expect(cosUnits(-1)).toBeCloseTo(cosUnits(TURN - 1), 12);
  });

  it('nearly preserves the identity sin^2 + cos^2 = 1', () => {
    for (let u = 0; u < TURN; u += 7) {
      const s = sinUnits(u);
      const c = cosUnits(u);
      expect(s * s + c * c).toBeCloseTo(1, 6);
    }
  });

  it('converts degrees to table units', () => {
    expect(degreesToUnits(0)).toBe(0);
    expect(degreesToUnits(90)).toBe(1024);
    expect(degreesToUnits(360)).toBe(4096);
  });

  it('rotates a vector by a quarter turn', () => {
    const r = rotate(1, 0, TURN / 4);
    expect(r.x).toBeCloseTo(0, 6);
    expect(r.y).toBeCloseTo(1, 6);
  });

  it('rotation preserves length', () => {
    for (let u = 0; u < TURN; u += 101) {
      const r = rotate(3, -4, u);
      expect(Math.sqrt(r.x * r.x + r.y * r.y)).toBeCloseTo(5, 5);
    }
  });

  it('is exactly repeatable, which is the whole point', () => {
    const a: number[] = [];
    const b: number[] = [];
    for (let u = 0; u < 1000; u++) a.push(sinUnits(u * 3.7));
    for (let u = 0; u < 1000; u++) b.push(sinUnits(u * 3.7));
    expect(a).toEqual(b);
  });
});

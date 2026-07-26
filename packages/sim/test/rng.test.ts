import { describe, expect, it } from 'vitest';
import { cloneRng, makeRng, nextFloat, nextInt, nextRange, nextU32 } from '../src/rng';

describe('mulberry32', () => {
  it('produces the same stream for the same seed', () => {
    const a = makeRng(12345);
    const b = makeRng(12345);
    for (let i = 0; i < 1000; i++) expect(nextU32(a)).toBe(nextU32(b));
  });

  it('diverges across seeds', () => {
    const a = makeRng(1);
    const b = makeRng(2);
    let same = 0;
    for (let i = 0; i < 100; i++) if (nextU32(a) === nextU32(b)) same++;
    expect(same).toBe(0);
  });

  it('exposes its whole state as one number, so the cursor is hashable', () => {
    const a = makeRng(99);
    for (let i = 0; i < 50; i++) nextU32(a);
    const resumed = { s: a.s };
    const expected = [nextU32(a), nextU32(a), nextU32(a)];
    expect([nextU32(resumed), nextU32(resumed), nextU32(resumed)]).toEqual(expected);
  });

  it('clones without sharing state', () => {
    const a = makeRng(5);
    const b = cloneRng(a);
    nextU32(a);
    expect(b.s).not.toBe(a.s);
  });

  it('keeps nextFloat in [0, 1)', () => {
    const r = makeRng(777);
    for (let i = 0; i < 20000; i++) {
      const v = nextFloat(r);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('keeps nextInt in range and covers it', () => {
    const r = makeRng(3);
    const seen = new Set<number>();
    for (let i = 0; i < 5000; i++) {
      const v = nextInt(r, 6);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(6);
      seen.add(v);
    }
    expect(seen.size).toBe(6);
  });

  it('keeps nextRange within bounds', () => {
    const r = makeRng(11);
    for (let i = 0; i < 5000; i++) {
      const v = nextRange(r, -40, 40);
      expect(v).toBeGreaterThanOrEqual(-40);
      expect(v).toBeLessThan(40);
    }
  });
});

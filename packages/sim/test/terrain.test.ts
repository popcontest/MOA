import { describe, expect, it } from 'vitest';
import { carve, fill, generateTerrain, raycast, settle, solidAt, topAt } from '../src/terrain';
import { makeRng } from '../src/rng';
import type { ArenaParams, Terrain } from '../src/types';

const ARENA: ArenaParams = {
  width: 64,
  height: 48,
  roughness: 0.5,
  minGround: 20,
  maxGround: 36,
};

function flatTerrain(width: number, height: number, groundTop: number): Terrain {
  const t: Terrain = {
    width,
    height,
    mask: new Uint8Array(width * height),
    columnTop: new Int32Array(width),
    volumeAdded: 0,
    volumeRemoved: 0,
  };
  for (let x = 0; x < width; x++) {
    t.mask.fill(1, x * height + groundTop, x * height + height);
    t.columnTop[x] = groundTop;
  }
  return t;
}

function columnSolidCount(t: Terrain, x: number): number {
  let n = 0;
  for (let y = 0; y < t.height; y++) if (solidAt(t, x, y)) n++;
  return n;
}

describe('generateTerrain', () => {
  it('is a pure function of the seed', () => {
    const a = generateTerrain(makeRng(42), ARENA);
    const b = generateTerrain(makeRng(42), ARENA);
    expect(Array.from(a.mask)).toEqual(Array.from(b.mask));
  });

  it('differs across seeds', () => {
    const a = generateTerrain(makeRng(42), ARENA);
    const b = generateTerrain(makeRng(43), ARENA);
    expect(Array.from(a.mask)).not.toEqual(Array.from(b.mask));
  });

  it('leaves every column solid from its surface to the floor', () => {
    const t = generateTerrain(makeRng(7), ARENA);
    for (let x = 0; x < t.width; x++) {
      const top = topAt(t, x);
      expect(solidAt(t, x, top)).toBe(true);
      expect(solidAt(t, x, top - 1)).toBe(false);
      expect(columnSolidCount(t, x)).toBe(t.height - top);
    }
  });
});

describe('carve', () => {
  it('clears a filled circle and counts what it removed', () => {
    const t = flatTerrain(64, 48, 20);
    const before = t.volumeRemoved;
    carve(t, 32, 30, 6);
    expect(solidAt(t, 32, 30)).toBe(false);
    expect(solidAt(t, 32, 24)).toBe(false);
    // Just outside the radius on the vertical axis.
    expect(solidAt(t, 32, 37)).toBe(true);
    expect(t.volumeRemoved - before).toBeGreaterThan(80);
  });

  it('reports the touched column range', () => {
    const t = flatTerrain(64, 48, 20);
    const r = carve(t, 32, 30, 6);
    expect(r.minX).toBe(26);
    expect(r.maxX).toBe(38);
  });

  it('clips at the arena edges', () => {
    const t = flatTerrain(64, 48, 20);
    const r = carve(t, 1, 30, 6);
    expect(r.minX).toBe(0);
    expect(() => carve(t, 63, 30, 6)).not.toThrow();
  });
});

describe('fill', () => {
  it('adds material and counts it', () => {
    const t = flatTerrain(64, 48, 20);
    fill(t, 32, 10, 5);
    expect(solidAt(t, 32, 10)).toBe(true);
    expect(t.volumeAdded).toBeGreaterThan(50);
  });

  it('is a peer of carve: fill then carve restores the original mask', () => {
    const t = flatTerrain(64, 48, 20);
    const original = Array.from(t.mask);
    fill(t, 32, 10, 5);
    carve(t, 32, 10, 5);
    expect(Array.from(t.mask)).toEqual(original);
  });
});

describe('settle', () => {
  it('drops material left unsupported by a carve', () => {
    const t = flatTerrain(64, 48, 20);
    const countBefore = columnSolidCount(t, 32);
    carve(t, 32, 40, 4);
    const removed = countBefore - columnSolidCount(t, 32);
    expect(removed).toBeGreaterThan(0);

    const r = settle(t, 20, 44);
    expect(r.columns).toContain(32);
    // Compaction conserves material; only its resting place changes.
    expect(columnSolidCount(t, 32)).toBe(countBefore - removed);
    expect(topAt(t, 32)).toBe(t.height - (countBefore - removed));
  });

  it('lands material dropped in from above', () => {
    const t = flatTerrain(64, 48, 20);
    const before = columnSolidCount(t, 32);
    fill(t, 32, 5, 3);
    const added = columnSolidCount(t, 32) - before;
    expect(added).toBeGreaterThan(0);

    settle(t, 28, 36);
    expect(topAt(t, 32)).toBe(20 - added);
    // No gap is left behind between the pile and the old surface.
    for (let y = topAt(t, 32); y < t.height; y++) expect(solidAt(t, 32, y)).toBe(true);
  });

  it('returns changed columns ascending with their drop distances', () => {
    const t = flatTerrain(64, 48, 20);
    carve(t, 32, 40, 5);
    const r = settle(t);
    expect(r.columns.length).toBe(r.drops.length);
    for (let i = 1; i < r.columns.length; i++) {
      const prev = r.columns[i - 1];
      const cur = r.columns[i];
      expect(prev !== undefined && cur !== undefined && cur > prev).toBe(true);
    }
    for (const d of r.drops) expect(d).toBeGreaterThan(0);
  });

  it('is idempotent', () => {
    const t = flatTerrain(64, 48, 20);
    carve(t, 32, 38, 6);
    settle(t);
    const after = Array.from(t.mask);
    const second = settle(t);
    expect(second.columns).toEqual([]);
    expect(Array.from(t.mask)).toEqual(after);
  });

  it('ranged settle matches a full-grid settle over the same damage', () => {
    const a = flatTerrain(64, 48, 20);
    const b = flatTerrain(64, 48, 20);
    carve(a, 32, 40, 5);
    carve(b, 32, 40, 5);
    settle(a);
    settle(b, 26, 38);
    expect(Array.from(a.mask)).toEqual(Array.from(b.mask));
  });
});

describe('raycast', () => {
  it('finds the surface of a flat field', () => {
    const t = flatTerrain(64, 48, 20);
    const hit = raycast(t, 32, 0, 32, 47);
    expect(hit).not.toBeNull();
    expect(hit?.y).toBe(20);
    expect(hit?.x).toBe(32);
  });

  it('returns null when the segment stays in open air', () => {
    const t = flatTerrain(64, 48, 20);
    expect(raycast(t, 0, 5, 63, 5)).toBeNull();
  });

  it('does not tunnel through a one-cell wall at speed', () => {
    // A single solid column in an otherwise empty arena, crossed in one step.
    const t: Terrain = {
      width: 64,
      height: 48,
      mask: new Uint8Array(64 * 48),
      columnTop: new Int32Array(64).fill(48),
      volumeAdded: 0,
      volumeRemoved: 0,
    };
    t.mask[32 * 48 + 24] = 1;
    t.columnTop[32] = 24;

    const hit = raycast(t, 0, 24.5, 63, 24.5);
    expect(hit).not.toBeNull();
    expect(hit?.x).toBe(32);
    expect(hit?.y).toBe(24);
  });

  it('reports a segment starting inside solid material at t = 0', () => {
    const t = flatTerrain(64, 48, 20);
    const hit = raycast(t, 32, 30, 40, 30);
    expect(hit?.t).toBe(0);
  });

  it('handles a zero-length segment', () => {
    const t = flatTerrain(64, 48, 20);
    expect(raycast(t, 10, 5, 10, 5)).toBeNull();
  });
});

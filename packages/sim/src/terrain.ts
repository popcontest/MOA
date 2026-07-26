import type { ArenaParams, SettleResult, Terrain } from './types';
import type { Rng } from './rng';
import { nextFloat } from './rng';

export function solidAt(t: Terrain, x: number, y: number): boolean {
  if (x < 0 || x >= t.width || y < 0 || y >= t.height) return false;
  return t.mask[x * t.height + y] === 1;
}

export function topAt(t: Terrain, x: number): number {
  if (x < 0 || x >= t.width) return t.height;
  const v = t.columnTop[x];
  return v === undefined ? t.height : v;
}

function recomputeTop(t: Terrain, x: number): number {
  const base = x * t.height;
  for (let y = 0; y < t.height; y++) {
    if (t.mask[base + y] === 1) return y;
  }
  return t.height;
}

/**
 * Midpoint displacement over a power-of-two grid, sampled down to arena width.
 * Displacement halves per level, scaled by `roughness`, so one number controls
 * how jagged the arena is.
 */
function heightmap(rng: Rng, arena: ArenaParams): Float64Array {
  let n = 1;
  while (n < arena.width - 1) n *= 2;

  const h = new Float64Array(n + 1);
  const span = arena.maxGround - arena.minGround;
  h[0] = arena.minGround + nextFloat(rng) * span;
  h[n] = arena.minGround + nextFloat(rng) * span;

  let scale = span * arena.roughness;
  for (let step = n; step > 1; step >>= 1) {
    const half = step >> 1;
    for (let i = 0; i + step <= n; i += step) {
      const a = h[i];
      const b = h[i + step];
      const left = a === undefined ? 0 : a;
      const right = b === undefined ? 0 : b;
      h[i + half] = (left + right) / 2 + (nextFloat(rng) - 0.5) * scale;
    }
    scale /= 2;
  }
  return h;
}

export function generateTerrain(rng: Rng, arena: ArenaParams): Terrain {
  const { width, height } = arena;
  const t: Terrain = {
    width,
    height,
    mask: new Uint8Array(width * height),
    columnTop: new Int32Array(width),
    volumeAdded: 0,
    volumeRemoved: 0,
  };

  const h = heightmap(rng, arena);
  const lo = 2;
  const hi = height - 2;

  for (let x = 0; x < width; x++) {
    const raw = h[x];
    let top = Math.round(raw === undefined ? arena.minGround : raw);
    if (top < lo) top = lo;
    if (top > hi) top = hi;
    // Column-major: the whole solid run is one contiguous fill.
    t.mask.fill(1, x * height + top, x * height + height);
    t.columnTop[x] = top;
  }
  return t;
}

/** Half-height of the filled circle at horizontal offset dx. */
function circleHalfSpan(r: number, dx: number): number {
  const rr = r * r - dx * dx;
  return rr <= 0 ? 0 : Math.floor(Math.sqrt(rr));
}

export type DirtyRange = { minX: number; maxX: number };

const EMPTY_RANGE: DirtyRange = { minX: 0, maxX: -1 };

export function carve(t: Terrain, cx: number, cy: number, radius: number): DirtyRange {
  if (radius <= 0) return EMPTY_RANGE;
  const r = Math.floor(radius);
  const x0 = Math.max(0, cx - r);
  const x1 = Math.min(t.width - 1, cx + r);
  if (x1 < x0) return EMPTY_RANGE;

  let removed = 0;
  for (let x = x0; x <= x1; x++) {
    const span = circleHalfSpan(radius, x - cx);
    const y0 = Math.max(0, cy - span);
    const y1 = Math.min(t.height - 1, cy + span);
    const base = x * t.height;
    for (let y = y0; y <= y1; y++) {
      if (t.mask[base + y] === 1) {
        t.mask[base + y] = 0;
        removed++;
      }
    }
    t.columnTop[x] = recomputeTop(t, x);
  }
  t.volumeRemoved += removed;
  return { minX: x0, maxX: x1 };
}

export function fill(t: Terrain, cx: number, cy: number, radius: number): DirtyRange {
  if (radius <= 0) return EMPTY_RANGE;
  const r = Math.floor(radius);
  const x0 = Math.max(0, cx - r);
  const x1 = Math.min(t.width - 1, cx + r);
  if (x1 < x0) return EMPTY_RANGE;

  let added = 0;
  for (let x = x0; x <= x1; x++) {
    const span = circleHalfSpan(radius, x - cx);
    const y0 = Math.max(0, cy - span);
    const y1 = Math.min(t.height - 1, cy + span);
    const base = x * t.height;
    for (let y = y0; y <= y1; y++) {
      if (t.mask[base + y] === 0) {
        t.mask[base + y] = 1;
        added++;
      }
    }
    t.columnTop[x] = recomputeTop(t, x);
  }
  t.volumeAdded += added;
  return { minX: x0, maxX: x1 };
}

/**
 * Per-column downward compaction: count the solid cells in a column and
 * restack them against the floor.
 *
 * Columns are independent, so there is no iteration-order hazard and no
 * lateral flow. The single rule covers both directions of Appendix A: material
 * left unsupported by `carve` falls, and material dropped in by `fill` lands on
 * whatever is beneath it. Caves do not survive a settle, which is the 1991
 * behaviour and the reason a digger is worth a turn.
 *
 * The range exists because a full-grid settle every turn is the difference
 * between the balance runner finishing in seconds and finishing in minutes.
 */
export function settle(t: Terrain, minX = 0, maxX = t.width - 1): SettleResult {
  const columns: number[] = [];
  const drops: number[] = [];
  const x0 = Math.max(0, minX);
  const x1 = Math.min(t.width - 1, maxX);

  for (let x = x0; x <= x1; x++) {
    const base = x * t.height;
    let count = 0;
    for (let y = 0; y < t.height; y++) {
      if (t.mask[base + y] === 1) count++;
    }
    const newTop = t.height - count;
    const oldTop = topAt(t, x);
    if (newTop === oldTop) continue;

    t.mask.fill(0, base, base + newTop);
    t.mask.fill(1, base + newTop, base + t.height);
    t.columnTop[x] = newTop;
    columns.push(x);
    drops.push(newTop - oldTop);
  }
  return { columns, drops };
}

export type RaycastHit = {
  /** Cell coordinates of the first solid cell along the segment. */
  x: number;
  y: number;
  /** Parameter along the segment in [0, 1] at which the cell was entered. */
  t: number;
};

/**
 * Amanatides & Woo grid traversal. Projectile collision hands the swept segment
 * straight to this, so there is no sampling density that a fast shot can
 * outrun — tunnelling is impossible by construction rather than by tuning.
 */
export function raycast(
  terrain: Terrain,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): RaycastHit | null {
  const dx = x1 - x0;
  const dy = y1 - y0;

  let cx = Math.floor(x0);
  let cy = Math.floor(y0);
  const endX = Math.floor(x1);
  const endY = Math.floor(y1);

  if (solidAt(terrain, cx, cy)) return { x: cx, y: cy, t: 0 };

  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;

  const tDeltaX = stepX === 0 ? Infinity : Math.abs(1 / dx);
  const tDeltaY = stepY === 0 ? Infinity : Math.abs(1 / dy);

  let tMaxX =
    stepX === 0 ? Infinity : stepX > 0 ? (cx + 1 - x0) / dx : (cx - x0) / dx;
  let tMaxY =
    stepY === 0 ? Infinity : stepY > 0 ? (cy + 1 - y0) / dy : (cy - y0) / dy;

  // Bounded by the Manhattan cell span plus slack; a segment cannot cross more.
  const limit = Math.abs(endX - cx) + Math.abs(endY - cy) + 2;
  for (let i = 0; i < limit; i++) {
    let t: number;
    if (tMaxX < tMaxY) {
      cx += stepX;
      t = tMaxX;
      tMaxX += tDeltaX;
    } else {
      cy += stepY;
      t = tMaxY;
      tMaxY += tDeltaY;
    }
    if (t > 1) return null;
    if (solidAt(terrain, cx, cy)) return { x: cx, y: cy, t };
  }
  return null;
}

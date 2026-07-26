import {
  MODE_BURROWING,
  MODE_FLYING,
  MODE_ROLLING,
  STEP_SECONDS,
  TRIGGER_INDEX,
  type MatchState,
  type Projectile,
} from './types';
import { carve, raycast, topAt } from './terrain';
import { applyEffects, fireTrigger } from './effects';
import { weaponAt } from './weapons';

const H = STEP_SECONDS;

export function makeProjectile(): Projectile {
  return {
    active: false,
    weapon: 0,
    owner: 0,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    mode: MODE_FLYING,
    age: 0,
    budget: -1,
    fuse: -1,
    generation: 0,
    rolled: 0,
    prevVy: 0,
    hasSplit: false,
    modeEffect: -1,
  };
}

export function spawnProjectile(
  s: MatchState,
  weaponIndex: number,
  owner: number,
  x: number,
  y: number,
  vx: number,
  vy: number,
  generation: number,
): Projectile | null {
  for (const p of s.projectiles) {
    if (p.active) continue;
    const w = weaponAt(s.config.registry, weaponIndex);
    p.active = true;
    p.weapon = weaponIndex;
    p.owner = owner;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.mode = MODE_FLYING;
    p.age = 0;
    p.budget = -1;
    p.fuse = w.fuse;
    p.generation = generation;
    p.rolled = 0;
    p.prevVy = vy;
    p.hasSplit = false;
    p.modeEffect = -1;
    return p;
  }
  // Pool exhausted. Dropping the spawn keeps the sim bounded and is
  // deterministic; the pool is sized so content has to be absurd to hit it.
  return null;
}

/** Entry parameter of a segment into a player's AABB, or -1. */
function sweepPlayer(
  s: MatchState,
  playerIndex: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number {
  const p = s.players[playerIndex];
  if (p === undefined || !p.alive) return -1;
  const { playerRadius, playerHeight } = s.config.rules;

  const minX = p.x - playerRadius;
  const maxX = p.x + playerRadius;
  const minY = p.y - playerHeight;
  const maxY = p.y;

  const dx = x1 - x0;
  const dy = y1 - y0;

  let tEnter = 0;
  let tExit = 1;

  // Slab test, one axis at a time.
  if (dx === 0) {
    if (x0 < minX || x0 > maxX) return -1;
  } else {
    let t0 = (minX - x0) / dx;
    let t1 = (maxX - x0) / dx;
    if (t0 > t1) [t0, t1] = [t1, t0];
    if (t0 > tEnter) tEnter = t0;
    if (t1 < tExit) tExit = t1;
    if (tEnter > tExit) return -1;
  }

  if (dy === 0) {
    if (y0 < minY || y0 > maxY) return -1;
  } else {
    let t0 = (minY - y0) / dy;
    let t1 = (maxY - y0) / dy;
    if (t0 > t1) [t0, t1] = [t1, t0];
    if (t0 > tEnter) tEnter = t0;
    if (t1 < tExit) tExit = t1;
    if (tEnter > tExit) return -1;
  }

  return tEnter;
}

function nearestPlayerHit(
  s: MatchState,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): { index: number; t: number } | null {
  let best = -1;
  let bestT = 0;
  for (let i = 0; i < s.players.length; i++) {
    const t = sweepPlayer(s, i, x0, y0, x1, y1);
    if (t < 0) continue;
    if (best < 0 || t < bestT) {
      best = i;
      bestT = t;
    }
  }
  return best < 0 ? null : { index: best, t: bestT };
}

function outOfArena(s: MatchState, x: number, y: number): boolean {
  // y < 0 is legal: shots arc above the arena and come back down.
  return x < 0 || x >= s.terrain.width || y >= s.terrain.height;
}

function stepFlying(s: MatchState, p: Projectile): void {
  const w = weaponAt(s.config.registry, p.weapon);
  const { gravity } = s.config.rules;

  p.prevVy = p.vy;
  p.vx += s.wind * w.windScale * H;
  p.vy += gravity * w.gravityScale * H;

  const x0 = p.x;
  const y0 = p.y;
  const x1 = x0 + p.vx * H;
  const y1 = y0 + p.vy * H;

  const terrainHit = raycast(s.terrain, x0, y0, x1, y1);
  const playerHit = nearestPlayerHit(s, x0, y0, x1, y1);

  // Nearest along the swept segment wins; a tie goes to the player, because a
  // shell that reaches a target and the ground on the same step hit the target.
  const useTerrain =
    terrainHit !== null && (playerHit === null || terrainHit.t < playerHit.t);
  const usePlayer = playerHit !== null && !useTerrain;

  if (useTerrain && terrainHit !== null) {
    p.x = x0 + (x1 - x0) * terrainHit.t;
    p.y = y0 + (y1 - y0) * terrainHit.t;
  } else if (usePlayer && playerHit !== null) {
    p.x = x0 + (x1 - x0) * playerHit.t;
    p.y = y0 + (y1 - y0) * playerHit.t;
  } else {
    p.x = x1;
    p.y = y1;
  }

  if (usePlayer) {
    if (!fireTrigger(s, p, TRIGGER_INDEX.impactPlayer)) p.active = false;
    return;
  }
  if (useTerrain) {
    if (!fireTrigger(s, p, TRIGGER_INDEX.impactTerrain)) p.active = false;
    return;
  }

  if (outOfArena(s, p.x, p.y)) {
    if (!fireTrigger(s, p, TRIGGER_INDEX.leaveArena)) p.active = false;
    return;
  }
  if (p.fuse >= 0 && p.age >= p.fuse) {
    if (!fireTrigger(s, p, TRIGGER_INDEX.fuse)) p.active = false;
    return;
  }
  // Apex is a vy sign change, so it fires exactly once per flight.
  if (!p.hasSplit && p.prevVy < 0 && p.vy >= 0) {
    fireTrigger(s, p, TRIGGER_INDEX.apex);
  }
}

function modeEffectOf(s: MatchState, p: Projectile) {
  const w = weaponAt(s.config.registry, p.weapon);
  const e = w.effects[p.modeEffect];
  return e !== undefined && e.kind === 'mode' ? { weapon: w, effect: e } : null;
}

function stepBurrowing(s: MatchState, p: Projectile): void {
  const m = modeEffectOf(s, p);
  if (m === null) {
    p.active = false;
    return;
  }

  p.x += p.vx * H;
  p.y += p.vy * H;

  if (m.effect.carveRadius > 0) {
    const r = carve(s.terrain, Math.round(p.x), Math.round(p.y), m.effect.carveRadius);
    if (r.maxX >= r.minX) {
      if (r.minX < s.turn.dirtyMinX) s.turn.dirtyMinX = r.minX;
      if (r.maxX > s.turn.dirtyMaxX) s.turn.dirtyMaxX = r.maxX;
    }
  }

  const hit = nearestPlayerHit(s, p.x, p.y, p.x, p.y);
  if (hit !== null) {
    applyEffects(s, p, m.weapon, m.effect.onImpactPlayer);
    if (p.active && !fireTrigger(s, p, TRIGGER_INDEX.impactPlayer)) p.active = false;
    return;
  }

  if (outOfArena(s, p.x, p.y)) {
    if (!fireTrigger(s, p, TRIGGER_INDEX.leaveArena)) p.active = false;
    return;
  }

  if (p.budget > 0) p.budget--;
  if (p.budget === 0) {
    applyEffects(s, p, m.weapon, m.effect.onEnd);
    if (p.active && !fireTrigger(s, p, TRIGGER_INDEX.budgetEnd)) p.active = false;
  }
}

/**
 * Gradient descent over columnTop. Larger columnTop means a lower surface,
 * because y grows downward.
 *
 * Momentum is modelled as a preference for the current heading rather than as
 * a velocity: the roller keeps going while the ground ahead falls away, stays
 * flat, or rises by no more than `rollMaxClimb`. It only turns round when the
 * way ahead is a wall and the way back is downhill, and it stops when neither
 * direction is open.
 *
 * Crossing small bumps is the point. A roller that halted at every one-cell
 * rise could not reach anyone dug in, which is the exact strategy Appendix A
 * says rollers exist to punish.
 */
function rollDirection(s: MatchState, cx: number, heading: number): number {
  const maxClimb = s.config.rules.rollMaxClimb;
  const here = topAt(s.terrain, cx);
  const left = cx - 1 < 0 ? -1 : topAt(s.terrain, cx - 1);
  const right = cx + 1 >= s.terrain.width ? -1 : topAt(s.terrain, cx + 1);

  const ahead = heading < 0 ? left : right;
  const behind = heading < 0 ? right : left;

  // -1 marks the arena edge, which is a wall in both branches below.
  if (ahead >= 0 && (ahead > here || here - ahead <= maxClimb)) return heading;
  if (behind >= 0 && behind > here) return -heading;
  return 0;
}

function stepRolling(s: MatchState, p: Projectile): void {
  const m = modeEffectOf(s, p);
  if (m === null) {
    p.active = false;
    return;
  }

  const cx = Math.floor(p.x);
  const heading = p.vx < 0 ? -1 : 1;
  const dir = rollDirection(s, cx, heading);

  if (dir === 0) {
    applyEffects(s, p, m.weapon, m.effect.onRest);
    if (p.active && !fireTrigger(s, p, TRIGGER_INDEX.rest)) p.active = false;
    return;
  }

  const distance = m.effect.speed * H;
  p.vx = dir * m.effect.speed;
  p.x += dir * distance;
  p.rolled += distance;

  if (p.x < 0 || p.x >= s.terrain.width) {
    if (!fireTrigger(s, p, TRIGGER_INDEX.leaveArena)) p.active = false;
    return;
  }

  p.y = topAt(s.terrain, Math.floor(p.x));

  const hit = nearestPlayerHit(s, p.x, p.y, p.x, p.y);
  if (hit !== null) {
    applyEffects(s, p, m.weapon, m.effect.onImpactPlayer);
    if (p.active && !fireTrigger(s, p, TRIGGER_INDEX.impactPlayer)) p.active = false;
    return;
  }

  if (p.budget > 0) p.budget--;
  if (p.budget === 0) {
    applyEffects(s, p, m.weapon, m.effect.onEnd);
    if (p.active && !fireTrigger(s, p, TRIGGER_INDEX.budgetEnd)) p.active = false;
  }
}

export function stepProjectile(s: MatchState, p: Projectile): void {
  p.age++;
  switch (p.mode) {
    case MODE_FLYING:
      stepFlying(s, p);
      return;
    case MODE_ROLLING:
      stepRolling(s, p);
      return;
    case MODE_BURROWING:
      stepBurrowing(s, p);
      return;
  }
}

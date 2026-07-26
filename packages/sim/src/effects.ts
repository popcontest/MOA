import {
  MODE_ROLLING,
  type Effect,
  type MatchState,
  type Projectile,
  type Weapon,
} from './types';
import { carve, fill } from './terrain';
import { applyDamage, blastFalloff, distanceToPlayer } from './damage';
import { rotate } from './trig';
import { weaponAt } from './weapons';
import { spawnProjectile } from './projectile';

/**
 * The dispatcher switches on effect kind and nothing else. There is no weapon
 * id, family or name anywhere below this line — that is the whole contract
 * behind "adding weapon #30 is a JSON edit".
 */

function markDirty(s: MatchState, minX: number, maxX: number): void {
  if (maxX < minX) return;
  if (minX < s.turn.dirtyMinX) s.turn.dirtyMinX = minX;
  if (maxX > s.turn.dirtyMaxX) s.turn.dirtyMaxX = maxX;
}

function recordImpactDistance(s: MatchState, cx: number, cy: number): void {
  const { playerHeight } = s.config.rules;
  let best = -1;
  for (const p of s.players) {
    if (!p.alive || p.id === s.turn.shooter) continue;
    const d = distanceToPlayer(p, cx, cy, playerHeight);
    if (best < 0 || d < best) best = d;
  }
  // First detonation of the turn is the one the round summary asks about.
  if (s.turn.impactDistance < 0) s.turn.impactDistance = best;
}

function applyBlast(s: MatchState, p: Projectile, e: Extract<Effect, { kind: 'blast' }>): void {
  const cx = Math.round(p.x);
  const cy = Math.round(p.y);
  const rolled = p.mode === MODE_ROLLING ? p.rolled : 0;
  const cause = p.mode === MODE_ROLLING ? 'roll' : 'blast';

  recordImpactDistance(s, cx, cy);

  if (e.maxDamage > 0 && e.blastRadius > 0) {
    for (const victim of s.players) {
      if (!victim.alive) continue;
      const d = distanceToPlayer(victim, cx, cy, s.config.rules.playerHeight);
      const dmg = blastFalloff(d, e.maxDamage, e.blastRadius);
      applyDamage(s, victim, dmg, cause, p.owner, rolled);
    }
  }

  if (e.carveRadius > 0) {
    const r = carve(s.terrain, cx, cy, e.carveRadius);
    markDirty(s, r.minX, r.maxX);
  }
  if (e.fillRadius > 0) {
    const before = s.terrain.volumeAdded;
    const r = fill(s.terrain, cx, cy, e.fillRadius);
    s.turn.fillVolumeThisTurn += s.terrain.volumeAdded - before;
    markDirty(s, r.minX, r.maxX);
  }

  p.active = false;
}

function applySpawn(s: MatchState, p: Projectile, e: Extract<Effect, { kind: 'spawn' }>): void {
  if (p.generation + 1 < s.config.rules.maxGeneration) {
    const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    // A fan centred on the parent's heading; index 0 is always the leftmost
    // offset, so child order is fixed regardless of which way the parent flew.
    const step = e.count > 1 ? e.spreadUnits / (e.count - 1) : 0;
    const start = -e.spreadUnits / 2;

    for (let i = 0; i < e.count; i++) {
      const offset = start + step * i;
      let vx: number;
      let vy: number;
      if (e.inheritVelocity) {
        const r = rotate(p.vx, p.vy, offset);
        vx = r.x * e.speedScale;
        vy = r.y * e.speedScale;
      } else {
        const r = rotate(0, -speed, offset);
        vx = r.x * e.speedScale;
        vy = r.y * e.speedScale;
      }
      spawnProjectile(s, e.childIndex, p.owner, p.x, p.y, vx, vy, p.generation + 1);
    }
  }
  p.hasSplit = true;
  if (e.consumeParent) p.active = false;
}

function applyMode(p: Projectile, e: Extract<Effect, { kind: 'mode' }>, effectIndex: number): void {
  p.mode = e.mode;
  p.budget = e.budgetSteps;
  p.modeEffect = effectIndex;
  p.rolled = 0;

  const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
  if (speed > 0) {
    p.vx = (p.vx / speed) * e.speed;
    p.vy = (p.vy / speed) * e.speed;
  } else {
    p.vx = 0;
    p.vy = e.speed;
  }
}

export function applyEffect(
  s: MatchState,
  p: Projectile,
  weapon: Weapon,
  effectIndex: number,
): void {
  const e = weapon.effects[effectIndex];
  if (e === undefined) return;
  switch (e.kind) {
    case 'blast':
      applyBlast(s, p, e);
      return;
    case 'spawn':
      applySpawn(s, p, e);
      return;
    case 'mode':
      applyMode(p, e, effectIndex);
      return;
    case 'expire':
      p.active = false;
      return;
  }
}

export function applyEffects(
  s: MatchState,
  p: Projectile,
  weapon: Weapon,
  indices: readonly number[],
): void {
  for (const i of indices) {
    if (!p.active) return;
    applyEffect(s, p, weapon, i);
  }
}

/** Runs one trigger slot. Returns true if anything was configured for it. */
export function fireTrigger(s: MatchState, p: Projectile, triggerIndex: number): boolean {
  const weapon = weaponAt(s.config.registry, p.weapon);
  const indices = weapon.triggers[triggerIndex];
  if (indices === undefined || indices.length === 0) return false;
  applyEffects(s, p, weapon, indices);
  return true;
}

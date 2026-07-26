import type { MatchState, TurnRecord } from './types';
import {
  digest,
  makeHasher,
  pushBool,
  pushBytes,
  pushByte,
  pushF64,
  pushI32,
  pushString,
  pushU32,
  type Hasher,
} from './hash';

/**
 * Canonical order, fixed once and never reordered — changing it invalidates
 * every replay fixture in the project.
 *
 * `columnTop` and the turn accumulator are excluded because they are derived
 * or per-turn scratch. Everything a replay could diverge on is included,
 * including the match log, so round summaries are covered by the replay tests
 * for free.
 *
 * This walks the whole terrain mask, so it is a match-end or on-demand call,
 * never per tick.
 */

const DEATH_CAUSES = ['blast', 'fall', 'crush', 'roll', 'self', 'drown'] as const;

function pushTurn(h: Hasher, t: TurnRecord): void {
  pushI32(h, t.turnIndex);
  pushI32(h, t.shooter);
  pushI32(h, t.weapon);
  pushF64(h, t.angleDeg);
  pushF64(h, t.power);
  pushF64(h, t.windAtFire);
  pushF64(h, t.impactDistance);
  pushU32(h, t.damageDealt.length);
  for (const d of t.damageDealt) pushF64(h, d);
  for (const v of t.healthBefore) pushF64(h, v);
  for (const v of t.healthAfter) pushF64(h, v);
  pushU32(h, t.deaths.length);
  for (const d of t.deaths) {
    pushI32(h, d.player);
    pushByte(h, DEATH_CAUSES.indexOf(d.cause));
    pushI32(h, d.killer);
    pushBool(h, d.buried);
    pushF64(h, d.rollDistance);
  }
  pushF64(h, t.volumeAdded);
  pushF64(h, t.volumeRemoved);
}

export function hashState(s: MatchState): string {
  const h = makeHasher();

  pushU32(h, s.seed);
  pushU32(h, s.tick);
  pushI32(h, s.turnIndex);
  pushI32(h, s.activePlayer);
  pushByte(h, s.phase);
  pushF64(h, s.wind);

  pushU32(h, s.terrain.width);
  pushU32(h, s.terrain.height);
  pushBytes(h, s.terrain.mask);
  pushF64(h, s.terrain.volumeAdded);
  pushF64(h, s.terrain.volumeRemoved);

  pushU32(h, s.players.length);
  for (const p of s.players) {
    pushI32(h, p.id);
    pushBool(h, p.alive);
    pushF64(h, p.x);
    pushF64(h, p.y);
    pushF64(h, p.health);
    pushF64(h, p.lastAngleDeg);
    pushF64(h, p.lastPower);
    pushI32(h, p.lastWeapon);
    pushI32(h, p.buriedTurn);
  }

  // Pool slot is part of the state: two runs that put the same projectile in
  // different slots have diverged even if the projectiles look identical.
  for (let i = 0; i < s.projectiles.length; i++) {
    const p = s.projectiles[i];
    if (p === undefined || !p.active) continue;
    pushU32(h, i);
    pushI32(h, p.weapon);
    pushI32(h, p.owner);
    pushF64(h, p.x);
    pushF64(h, p.y);
    pushF64(h, p.vx);
    pushF64(h, p.vy);
    pushByte(h, p.mode);
    pushI32(h, p.age);
    pushI32(h, p.budget);
    pushI32(h, p.fuse);
    pushI32(h, p.generation);
    pushF64(h, p.rolled);
    pushBool(h, p.hasSplit);
    pushI32(h, p.modeEffect);
  }
  pushU32(h, 0xffffffff);

  pushU32(h, s.rng.s);

  pushU32(h, s.log.length);
  for (const t of s.log) pushTurn(h, t);

  if (s.outcome === null) {
    pushByte(h, 0);
  } else {
    pushByte(h, 1);
    pushI32(h, s.outcome.winner);
    pushString(h, s.outcome.reason);
  }

  return digest(h);
}

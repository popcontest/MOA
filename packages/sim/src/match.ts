import {
  PHASE_AWAITING_INPUT,
  PHASE_RESOLVING,
  PHASE_ROUND_OVER,
  type MatchConfig,
  type MatchState,
  type Player,
  type TurnAccumulator,
  type TurnInput,
  type TurnRecord,
} from './types';
import { makeRng, nextFloat, nextRange } from './rng';
import { generateTerrain, settle, topAt } from './terrain';
import { markDirty } from './effects';
import { makeProjectile, spawnProjectile, stepProjectile } from './projectile';
import { applyDamage } from './damage';
import { cosDegrees, sinDegrees } from './trig';
import { weaponAt } from './weapons';

function makeAccumulator(playerCount: number): TurnAccumulator {
  return {
    shooter: -1,
    weapon: -1,
    angleDeg: 0,
    power: 0,
    windAtFire: 0,
    healthBefore: new Array<number>(playerCount).fill(0),
    damageDealt: new Array<number>(playerCount).fill(0),
    deaths: [],
    impactDistance: -1,
    fillVolumeThisTurn: 0,
    dirtyMinX: 0,
    dirtyMaxX: -1,
  };
}

export function createMatch(seed: number, config: MatchConfig): MatchState {
  const rng = makeRng(seed);
  const terrain = generateTerrain(rng, config.arena);
  const { rules } = config;

  const players: Player[] = [];
  const n = config.playerCount;
  const lane = terrain.width / (n + 1);
  for (let i = 0; i < n; i++) {
    // Jitter within the lane so a seed does not always produce the same
    // opening geometry, but never close enough to overlap a neighbour.
    const jitter = (nextFloat(rng) - 0.5) * lane * 0.4;
    const x = Math.round(lane * (i + 1) + jitter);
    players.push({
      id: i,
      alive: true,
      x,
      y: topAt(terrain, x),
      health: rules.maxHealth,
      lastAngleDeg: i < n / 2 ? 45 : 135,
      lastPower: 500,
      lastWeapon: 0,
      buriedTurn: -1,
    });
  }

  const projectiles = [];
  for (let i = 0; i < rules.maxProjectiles; i++) projectiles.push(makeProjectile());

  return {
    seed,
    config,
    tick: 0,
    turnIndex: 0,
    activePlayer: 0,
    phase: PHASE_AWAITING_INPUT,
    wind: nextRange(rng, -rules.windMax, rules.windMax),
    terrain,
    players,
    projectiles,
    rng,
    log: [],
    outcome: null,
    turn: makeAccumulator(n),
    stepOrder: new Int32Array(rules.maxProjectiles),
    tickDirtyMinX: terrain.width,
    tickDirtyMaxX: -1,
  };
}

export function isAwaitingInput(s: MatchState): boolean {
  return s.phase === PHASE_AWAITING_INPUT;
}

export function isOver(s: MatchState): boolean {
  return s.phase === PHASE_ROUND_OVER;
}

export function activePlayerOf(s: MatchState): Player {
  const p = s.players[s.activePlayer];
  if (p === undefined) throw new Error(`no player at index ${s.activePlayer}`);
  return p;
}

export function submitInput(s: MatchState, input: TurnInput): void {
  if (s.phase !== PHASE_AWAITING_INPUT) {
    throw new Error('submitInput called outside AwaitingInput');
  }
  const shooter = activePlayerOf(s);
  const { rules } = s.config;
  const weapon = weaponAt(s.config.registry, input.weapon);

  const acc = s.turn;
  acc.shooter = shooter.id;
  acc.weapon = input.weapon;
  acc.angleDeg = input.angleDeg;
  acc.power = input.power;
  acc.windAtFire = s.wind;
  acc.deaths = [];
  acc.impactDistance = -1;
  acc.fillVolumeThisTurn = 0;
  acc.dirtyMinX = s.terrain.width;
  acc.dirtyMaxX = -1;
  for (let i = 0; i < s.players.length; i++) {
    const p = s.players[i];
    acc.healthBefore[i] = p === undefined ? 0 : p.health;
    acc.damageDealt[i] = 0;
  }

  shooter.lastAngleDeg = input.angleDeg;
  shooter.lastPower = input.power;
  shooter.lastWeapon = input.weapon;

  const dirX = cosDegrees(input.angleDeg);
  const dirY = -sinDegrees(input.angleDeg);
  const speed = input.power * rules.powerScale * weapon.speedScale;
  const headY = shooter.y - rules.playerHeight;

  spawnProjectile(
    s,
    input.weapon,
    shooter.id,
    shooter.x + dirX * rules.muzzleOffset,
    headY + dirY * rules.muzzleOffset,
    dirX * speed,
    dirY * speed,
    0,
  );

  s.phase = PHASE_RESOLVING;
}

function nextAlivePlayer(s: MatchState, from: number): number {
  const n = s.players.length;
  for (let i = 1; i <= n; i++) {
    const idx = (from + i) % n;
    const p = s.players[idx];
    if (p !== undefined && p.alive) return idx;
  }
  return from;
}

function aliveCount(s: MatchState): number {
  let c = 0;
  for (const p of s.players) if (p.alive) c++;
  return c;
}

/**
 * Settle, then reconcile every player with the surface that came out of it.
 *
 * A player is buried when the column above their feet is solid all the way
 * past their head. Otherwise they ride the new surface, which covers both
 * falling into a crater and being nudged up by a small pile.
 */
function resolveTerrain(s: MatchState): void {
  const acc = s.turn;
  if (acc.dirtyMaxX >= acc.dirtyMinX) {
    // Widen by one column: a carve at the edge of the range can leave the
    // neighbouring column's support looking intact when it is not.
    const lo = acc.dirtyMinX - 1;
    const hi = acc.dirtyMaxX + 1;
    settle(s.terrain, lo, hi);
    markDirty(s, Math.max(0, lo), Math.min(s.terrain.width - 1, hi));
  }

  // Player reconciliation runs every turn even when no terrain moved, because
  // a player already under a pile keeps taking crush damage on turns when
  // nobody happened to shoot near them.
  const { rules } = s.config;
  for (const p of s.players) {
    if (!p.alive) continue;
    const top = topAt(s.terrain, p.x);

    if (top <= p.y - rules.playerHeight) {
      p.buriedTurn = s.turnIndex;
      continue;
    }
    p.buriedTurn = -1;

    if (top === p.y) continue;
    const drop = top - p.y;
    p.y = top;
    if (drop > rules.fallDamageThreshold) {
      applyDamage(
        s,
        p,
        (drop - rules.fallDamageThreshold) * rules.fallDamagePerCell,
        'fall',
        acc.shooter,
        0,
      );
    }
  }

  for (const p of s.players) {
    if (!p.alive || p.buriedTurn < 0) continue;
    applyDamage(s, p, rules.crushDamagePerTurn, 'crush', acc.shooter, 0);
  }
}

function finalizeTurn(s: MatchState): void {
  const acc = s.turn;
  const healthAfter: number[] = [];
  for (const p of s.players) healthAfter.push(p.health);

  const record: TurnRecord = {
    turnIndex: s.turnIndex,
    shooter: acc.shooter,
    weapon: acc.weapon,
    angleDeg: acc.angleDeg,
    power: acc.power,
    windAtFire: acc.windAtFire,
    impactDistance: acc.impactDistance,
    damageDealt: acc.damageDealt.slice(),
    healthBefore: acc.healthBefore.slice(),
    healthAfter,
    deaths: acc.deaths.slice(),
    volumeAdded: s.terrain.volumeAdded,
    volumeRemoved: s.terrain.volumeRemoved,
  };
  s.log.push(record);
}

function concludeOrAdvance(s: MatchState): void {
  const { rules } = s.config;
  s.turnIndex++;

  const alive = aliveCount(s);
  if (alive === 0) {
    s.outcome = { winner: -1, reason: 'allDead' };
    s.phase = PHASE_ROUND_OVER;
    return;
  }
  if (alive === 1) {
    let winner = -1;
    for (const p of s.players) if (p.alive) winner = p.id;
    s.outcome = { winner, reason: 'lastStanding' };
    s.phase = PHASE_ROUND_OVER;
    return;
  }
  if (s.turnIndex >= rules.turnLimit) {
    let best = -1;
    let bestHealth = -1;
    let tied = false;
    for (const p of s.players) {
      if (!p.alive) continue;
      if (p.health > bestHealth) {
        bestHealth = p.health;
        best = p.id;
        tied = false;
      } else if (p.health === bestHealth) {
        tied = true;
      }
    }
    s.outcome = { winner: tied ? -1 : best, reason: 'turnLimit' };
    s.phase = PHASE_ROUND_OVER;
    return;
  }

  s.activePlayer = nextAlivePlayer(s, s.activePlayer);
  s.wind = nextRange(s.rng, -rules.windMax, rules.windMax);
  s.phase = PHASE_AWAITING_INPUT;
}

/** Advances exactly one 1/120s step. No variable dt crosses this boundary. */
export function step(s: MatchState): void {
  if (s.phase !== PHASE_RESOLVING) return;
  s.tick++;
  s.tickDirtyMinX = s.terrain.width;
  s.tickDirtyMaxX = -1;

  let count = 0;
  for (let i = 0; i < s.projectiles.length; i++) {
    const p = s.projectiles[i];
    if (p !== undefined && p.active) {
      s.stepOrder[count] = i;
      count++;
    }
  }
  for (let k = 0; k < count; k++) {
    const idx = s.stepOrder[k];
    if (idx === undefined) continue;
    const p = s.projectiles[idx];
    if (p !== undefined && p.active) stepProjectile(s, p);
  }

  for (const p of s.projectiles) {
    if (p.active) return;
  }

  resolveTerrain(s);
  finalizeTurn(s);
  concludeOrAdvance(s);
}

/** Runs the current turn to completion. The usual driver for tools and tests. */
export function resolveTurn(s: MatchState, maxSteps = 4096): number {
  let n = 0;
  while (s.phase === PHASE_RESOLVING && n < maxSteps) {
    step(s);
    n++;
  }
  if (s.phase === PHASE_RESOLVING) {
    // A projectile that outlives its budget is a content bug, not a stall the
    // sim should paper over. Retiring it keeps the match deterministic.
    for (const p of s.projectiles) p.active = false;
    step(s);
  }
  return n;
}

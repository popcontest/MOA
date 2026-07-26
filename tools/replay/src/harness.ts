import {
  MODE_BURROWING,
  MODE_ROLLING,
  PHASE_RESOLVING,
  classify,
  createMatch,
  fireableWeapons,
  hashState,
  isAwaitingInput,
  isOver,
  loadArenas,
  loadClassifier,
  loadRules,
  loadWeapons,
  step,
  submitInput,
  summarize,
  type ArenaParams,
  type Classification,
  type MatchConfig,
  type MatchState,
  type WeaponRegistry,
} from '@moa/sim';
import { arenas as arenasJson, classifier as classifierJson, rules as rulesJson, weapons as weaponsJson } from '@moa/content';

export const registry: WeaponRegistry = loadWeapons(weaponsJson);
export const rules = loadRules(rulesJson);
export const arenas = loadArenas(arenasJson);
export const classifierConfig = loadClassifier(classifierJson);
export const loadout: number[] = fireableWeapons(registry, weaponsJson);

export function arenaByIdOrThrow(id: string): ArenaParams {
  const a = arenas.get(id);
  if (a === undefined) throw new Error(`unknown arena "${id}"`);
  return a;
}

export function weaponIndex(id: string): number {
  const i = registry.byId.get(id);
  if (i === undefined) throw new Error(`unknown weapon "${id}"`);
  return i;
}

export function makeConfig(arenaId: string, playerCount: number): MatchConfig {
  return {
    playerCount,
    arena: arenaByIdOrThrow(arenaId),
    rules,
    registry,
    loadout,
  };
}

export type FixtureInput = {
  readonly angleDeg: number;
  readonly power: number;
  readonly weapon: string;
  /** Fire this same shot N times in a row. Keeps stalemate fixtures readable. */
  readonly repeat?: number;
};

export type FixtureExpect = {
  readonly outcomeReason?: string;
  readonly winner?: number;
  /** Sign of the wind recorded on the first turn. */
  readonly windSign?: -1 | 1;
  readonly firstImpactDistanceBetween?: readonly [number, number];
  readonly totalDamageAtMost?: number;
  readonly totalDamageAtLeast?: number;
  readonly deathCauses?: readonly string[];
  readonly buriedDeath?: boolean;
  readonly minRollDistance?: number;
  readonly sawRolling?: boolean;
  readonly sawBurrowing?: boolean;
  readonly maxActiveProjectilesAtLeast?: number;
  readonly turnVolumeRemovedAtLeast?: number;
  readonly turnVolumeAddedAtLeast?: number;
  readonly headline?: string;
  readonly stamp?: string | null;
};

export type Fixture = {
  readonly name: string;
  readonly note: string;
  readonly seed: number;
  readonly arena: string;
  readonly playerCount: number;
  readonly inputs: readonly FixtureInput[];
  readonly expect: FixtureExpect;
  readonly hash: string;
};

/**
 * Observations taken by watching live sim state during the replay. They exist
 * so a fixture can assert that a roller actually rolled rather than merely
 * that some hash changed — nothing here is written back into the sim.
 */
export type Observations = {
  sawRolling: boolean;
  sawBurrowing: boolean;
  maxActiveProjectiles: number;
  maxRolled: number;
  maxTurnVolumeRemoved: number;
  maxTurnVolumeAdded: number;
  turnsPlayed: number;
};

export type RunResult = {
  readonly state: MatchState;
  readonly hash: string;
  readonly observations: Observations;
  readonly classification: Classification | null;
};

function expandInputs(inputs: readonly FixtureInput[]): FixtureInput[] {
  const out: FixtureInput[] = [];
  for (const i of inputs) {
    const n = i.repeat === undefined ? 1 : i.repeat;
    for (let k = 0; k < n; k++) out.push(i);
  }
  return out;
}

export function runFixture(f: Fixture): RunResult {
  const s = createMatch(f.seed, makeConfig(f.arena, f.playerCount));
  const obs: Observations = {
    sawRolling: false,
    sawBurrowing: false,
    maxActiveProjectiles: 0,
    maxRolled: 0,
    maxTurnVolumeRemoved: 0,
    maxTurnVolumeAdded: 0,
    turnsPlayed: 0,
  };

  for (const input of expandInputs(f.inputs)) {
    if (!isAwaitingInput(s)) break;
    const removedBefore = s.terrain.volumeRemoved;
    const addedBefore = s.terrain.volumeAdded;

    submitInput(s, {
      angleDeg: input.angleDeg,
      power: input.power,
      weapon: weaponIndex(input.weapon),
    });

    let guard = 0;
    while (s.phase === PHASE_RESOLVING && guard < 8192) {
      step(s);
      guard++;

      let active = 0;
      for (const p of s.projectiles) {
        if (!p.active) continue;
        active++;
        if (p.mode === MODE_ROLLING) obs.sawRolling = true;
        if (p.mode === MODE_BURROWING) obs.sawBurrowing = true;
        if (p.rolled > obs.maxRolled) obs.maxRolled = p.rolled;
      }
      if (active > obs.maxActiveProjectiles) obs.maxActiveProjectiles = active;
    }
    if (s.phase === PHASE_RESOLVING) {
      throw new Error(`fixture ${f.name}: turn did not terminate within 8192 steps`);
    }

    obs.turnsPlayed++;
    const removed = s.terrain.volumeRemoved - removedBefore;
    const added = s.terrain.volumeAdded - addedBefore;
    if (removed > obs.maxTurnVolumeRemoved) obs.maxTurnVolumeRemoved = removed;
    if (added > obs.maxTurnVolumeAdded) obs.maxTurnVolumeAdded = added;

    if (isOver(s)) break;
  }

  return {
    state: s,
    hash: hashState(s),
    observations: obs,
    classification: isOver(s) ? classify(classifierConfig, summarize(s)) : null,
  };
}

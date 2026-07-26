import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { PHASE_RESOLVING, TRIGGER_IDS, type MatchConfig } from '../src/types';
import { createMatch, step, submitInput } from '../src/match';
import { loadRules } from '../src/rules';
import { loadWeapons } from '../src/weapons';
import rulesJson from '../../content/rules.json';

const SIM_SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../src');
const rules = loadRules(rulesJson);

/**
 * Every trigger name the schema accepts has to be wired to something. A name a
 * content author can write that silently does nothing is worse than no name at
 * all: the weapon looks authored and behaves like a dud.
 */
describe('trigger vocabulary', () => {
  it('fires every trigger somewhere in the sim', () => {
    const src = readdirSync(SIM_SRC)
      .filter((f) => f.endsWith('.ts'))
      .map((f) => readFileSync(join(SIM_SRC, f), 'utf8'))
      .join('\n');

    const unwired = TRIGGER_IDS.filter((id) => !src.includes(`TRIGGER_INDEX.${id}`));
    expect(unwired).toEqual([]);
  });
});

/**
 * A weapon built only out of the less-travelled trigger names. If any of them
 * were inert this would never detonate and the assertions below would fail.
 */
const EXOTIC = {
  weapons: [
    {
      id: 'test.fuse',
      name: 'Fuse Test',
      family: 'test',
      spawn: { fuse: 30 },
      triggers: [
        { on: 'fuse', effects: ['boom'] },
        { on: 'leaveArena', effects: ['gone'] },
      ],
      effects: {
        boom: { kind: 'blast', maxDamage: 10, blastRadius: 8, carveRadius: 6 },
        gone: { kind: 'expire' },
      },
    },
    {
      id: 'test.budget',
      name: 'Budget Test',
      family: 'test',
      triggers: [
        { on: 'impactTerrain', effects: ['dig'] },
        { on: 'budgetEnd', effects: ['boom'] },
        { on: 'leaveArena', effects: ['gone'] },
      ],
      effects: {
        // onEnd deliberately omitted, so only the budgetEnd trigger can fire.
        dig: { kind: 'mode', mode: 'burrow', speed: 40, budgetSteps: 20, carveRadius: 3 },
        boom: { kind: 'blast', maxDamage: 10, blastRadius: 8, carveRadius: 6 },
        gone: { kind: 'expire' },
      },
    },
    {
      id: 'test.rest',
      name: 'Rest Test',
      family: 'test',
      triggers: [
        { on: 'impactTerrain', effects: ['roll'] },
        { on: 'rest', effects: ['boom'] },
        { on: 'leaveArena', effects: ['gone'] },
      ],
      effects: {
        // onRest deliberately omitted, so only the rest trigger can fire.
        roll: { kind: 'mode', mode: 'roll', speed: 90, budgetSteps: 400 },
        boom: { kind: 'blast', maxDamage: 10, blastRadius: 8, carveRadius: 6 },
        gone: { kind: 'expire' },
      },
    },
  ],
};

const registry = loadWeapons(EXOTIC);

function config(): MatchConfig {
  return {
    playerCount: 2,
    arena: { width: 512, height: 256, roughness: 0.5, minGround: 110, maxGround: 190 },
    rules,
    registry,
    loadout: [],
  };
}

/**
 * `impactDistance` is only ever written by a blast, so a non-negative value is
 * proof the trigger reached its effect. Terrain volume would not do: a fuse
 * detonation happens in mid air, where there is nothing to carve.
 */
function fire(weaponId: string, angleDeg: number, power: number) {
  const s = createMatch(2024, config());
  const weapon = registry.byId.get(weaponId);
  expect(weapon).toBeDefined();
  if (weapon === undefined) throw new Error(`missing ${weaponId}`);

  const removedBefore = s.terrain.volumeRemoved;
  submitInput(s, { angleDeg, power, weapon });
  let ticks = 0;
  while (s.phase === PHASE_RESOLVING && ticks++ < 8192) step(s);
  expect(ticks).toBeLessThan(8192);

  const turn = s.log[0];
  if (turn === undefined) throw new Error('no turn recorded');
  return { ticks, detonated: turn.impactDistance >= 0, removed: s.terrain.volumeRemoved - removedBefore };
}

describe('less-travelled triggers actually fire', () => {
  it('fuse detonates in mid air on schedule', () => {
    const r = fire('test.fuse', 60, 700);
    expect(r.detonated).toBe(true);
    // Fuse is 30 steps; the turn ends the tick after it blows.
    expect(r.ticks).toBeLessThanOrEqual(32);
    // Mid air, so nothing to carve — which is why volume is the wrong probe.
    expect(r.removed).toBe(0);
  });

  it('budgetEnd detonates a burrower that declares no onEnd effects', () => {
    const r = fire('test.budget', 25, 600);
    expect(r.detonated).toBe(true);
    expect(r.removed).toBeGreaterThan(0);
  });

  it('rest detonates a roller that declares no onRest effects', () => {
    const r = fire('test.rest', 25, 600);
    expect(r.detonated).toBe(true);
    expect(r.removed).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from 'vitest';
import { fireableWeapons, loadWeapons, weaponAt } from '../src/weapons';
import { TRIGGER_INDEX } from '../src/types';
import weaponsJson from '../../content/weapons.json';

const MINIMAL = {
  weapons: [
    {
      id: 'a.shell',
      name: 'A',
      family: 'shell',
      triggers: [{ on: 'impactTerrain', effects: ['boom'] }],
      effects: { boom: { kind: 'blast', maxDamage: 10, blastRadius: 5, carveRadius: 4 } },
    },
  ],
};

function withWeapons(mutate: (w: Record<string, unknown>) => void): unknown {
  const clone = JSON.parse(JSON.stringify(MINIMAL)) as { weapons: Record<string, unknown>[] };
  const first = clone.weapons[0];
  if (first === undefined) throw new Error('fixture is malformed');
  mutate(first);
  return clone;
}

describe('weapon registry', () => {
  it('loads the shipped content', () => {
    const r = loadWeapons(weaponsJson);
    expect(r.weapons.length).toBe(6);
    expect([...r.byId.keys()].sort()).toEqual([
      'auger',
      'cluster.mk1',
      'cluster.mk1.bomblet',
      'roller.mk1',
      'shell.standard',
      'sod.ball',
    ]);
  });

  it('assigns indices from sorted ids, so reordering the JSON is a no-op', () => {
    const a = loadWeapons(weaponsJson);
    const reversed = {
      weapons: [...(weaponsJson as { weapons: unknown[] }).weapons].reverse(),
    };
    const b = loadWeapons(reversed);
    expect(b.weapons.map((w) => w.id)).toEqual(a.weapons.map((w) => w.id));
  });

  it('excludes non-fireable children from the loadout', () => {
    const r = loadWeapons(weaponsJson);
    const ids = fireableWeapons(r, weaponsJson).map((i) => weaponAt(r, i).id);
    expect(ids).not.toContain('cluster.mk1.bomblet');
    expect(ids.length).toBe(5);
  });

  it('expresses all three brief weapons plus rollers and dirt without a sim branch', () => {
    const r = loadWeapons(weaponsJson);
    const kinds = (id: string) => weaponAt(r, r.byId.get(id) ?? -1).effects.map((e) => e.kind).sort();
    expect(kinds('shell.standard')).toEqual(['blast', 'expire']);
    expect(kinds('cluster.mk1')).toEqual(['blast', 'expire', 'spawn']);
    expect(kinds('auger')).toEqual(['blast', 'expire', 'mode']);
    expect(kinds('roller.mk1')).toEqual(['blast', 'expire', 'mode']);
    // A dirt weapon is a blast whose radii happen to be additive. No new kind.
    expect(kinds('sod.ball')).toEqual(['blast', 'expire']);
  });

  it('resolves the cluster child to a registry index', () => {
    const r = loadWeapons(weaponsJson);
    const cluster = weaponAt(r, r.byId.get('cluster.mk1') ?? -1);
    const spawn = cluster.effects.find((e) => e.kind === 'spawn');
    expect(spawn).toBeDefined();
    if (spawn?.kind === 'spawn') {
      expect(weaponAt(r, spawn.childIndex).id).toBe('cluster.mk1.bomblet');
      expect(spawn.spreadUnits).toBeCloseTo((44 * 4096) / 360, 9);
    }
  });

  it('maps triggers into fixed slots', () => {
    const r = loadWeapons(weaponsJson);
    const shell = weaponAt(r, r.byId.get('shell.standard') ?? -1);
    expect(shell.triggers[TRIGGER_INDEX.impactTerrain]?.length).toBe(1);
    expect(shell.triggers[TRIGGER_INDEX.apex]?.length).toBe(0);
  });
});

describe('weapon validation', () => {
  it('accepts the minimal shape', () => {
    expect(() => loadWeapons(MINIMAL)).not.toThrow();
  });

  it('rejects an unknown trigger', () => {
    const bad = withWeapons((w) => {
      w['triggers'] = [{ on: 'onTuesday', effects: ['boom'] }];
    });
    expect(() => loadWeapons(bad)).toThrow(/unknown trigger/);
  });

  it('rejects an unknown effect kind', () => {
    const bad = withWeapons((w) => {
      w['effects'] = { boom: { kind: 'teleport' } };
    });
    expect(() => loadWeapons(bad)).toThrow(/unknown effect kind/);
  });

  it('rejects a trigger referencing an effect that does not exist', () => {
    const bad = withWeapons((w) => {
      w['triggers'] = [{ on: 'impactTerrain', effects: ['nope'] }];
    });
    expect(() => loadWeapons(bad)).toThrow(/unknown effect/);
  });

  it('rejects a spawn pointing at a weapon that does not exist', () => {
    const bad = withWeapons((w) => {
      w['effects'] = {
        boom: { kind: 'spawn', childId: 'ghost', count: 3 },
      };
    });
    expect(() => loadWeapons(bad)).toThrow(/not a known weapon/);
  });

  it('rejects a duplicate trigger', () => {
    const bad = withWeapons((w) => {
      w['triggers'] = [
        { on: 'impactTerrain', effects: ['boom'] },
        { on: 'impactTerrain', effects: ['boom'] },
      ];
    });
    expect(() => loadWeapons(bad)).toThrow(/duplicate trigger/);
  });

  it('rejects an unknown mode', () => {
    const bad = withWeapons((w) => {
      w['effects'] = { boom: { kind: 'mode', mode: 'swim', speed: 10, budgetSteps: 10 } };
    });
    expect(() => loadWeapons(bad)).toThrow(/unknown mode/);
  });

  it('rejects duplicate ids', () => {
    expect(() =>
      loadWeapons({ weapons: [MINIMAL.weapons[0], MINIMAL.weapons[0]] }),
    ).toThrow(/duplicate id/);
  });

  it('rejects an empty registry', () => {
    expect(() => loadWeapons({ weapons: [] })).toThrow(/no weapons/);
  });

  it('rejects a non-numeric radius', () => {
    const bad = withWeapons((w) => {
      w['effects'] = { boom: { kind: 'blast', blastRadius: 'wide' } };
    });
    expect(() => loadWeapons(bad)).toThrow(/finite number/);
  });
});

import { describe, expect, it } from 'vitest';
import {
  PHASE_AWAITING_INPUT,
  PHASE_ROUND_OVER,
  type MatchConfig,
  type MatchState,
} from '../src/types';
import { activePlayerOf, createMatch, isOver, resolveTurn, submitInput } from '../src/match';
import { hashState } from '../src/statehash';
import { blastFalloff } from '../src/damage';
import { loadRules } from '../src/rules';
import { loadWeapons } from '../src/weapons';
import { topAt } from '../src/terrain';
import weaponsJson from '../../content/weapons.json';
import rulesJson from '../../content/rules.json';

const registry = loadWeapons(weaponsJson);
const rules = loadRules(rulesJson);
const SHELL = registry.byId.get('shell.standard') ?? 0;

function config(playerCount: number, over: Partial<MatchConfig> = {}): MatchConfig {
  return {
    playerCount,
    arena: { width: 512, height: 256, roughness: 0.5, minGround: 110, maxGround: 190 },
    rules,
    registry,
    loadout: [SHELL],
    ...over,
  };
}

/** Lobs out of the arena so the turn resolves without touching anything. */
function passTurn(s: MatchState): void {
  const p = activePlayerOf(s);
  submitInput(s, { angleDeg: p.x < s.terrain.width / 2 ? 135 : 45, power: 1000, weapon: SHELL });
  resolveTurn(s);
}

describe('match setup', () => {
  it('places every player on the surface', () => {
    for (const n of [2, 3, 4]) {
      const s = createMatch(99, config(n));
      expect(s.players.length).toBe(n);
      for (const p of s.players) {
        expect(p.y).toBe(topAt(s.terrain, p.x));
        expect(p.health).toBe(rules.maxHealth);
        expect(p.alive).toBe(true);
      }
    }
  });

  it('spreads players out without overlap', () => {
    const s = createMatch(5, config(4));
    const xs = s.players.map((p) => p.x);
    for (let i = 1; i < xs.length; i++) {
      const a = xs[i - 1];
      const b = xs[i];
      expect(a !== undefined && b !== undefined && b - a > rules.playerRadius * 4).toBe(true);
    }
  });

  it('starts awaiting input from player 0', () => {
    const s = createMatch(1, config(2));
    expect(s.phase).toBe(PHASE_AWAITING_INPUT);
    expect(s.activePlayer).toBe(0);
    expect(s.outcome).toBeNull();
  });

  it('refuses input while a turn is resolving', () => {
    const s = createMatch(1, config(2));
    submitInput(s, { angleDeg: 45, power: 500, weapon: SHELL });
    expect(() => submitInput(s, { angleDeg: 45, power: 500, weapon: SHELL })).toThrow(
      /outside AwaitingInput/,
    );
  });
});

describe('turn order', () => {
  it('cycles players in index order', () => {
    for (const n of [2, 3, 4]) {
      const s = createMatch(11, config(n));
      const seen: number[] = [];
      for (let i = 0; i < n * 2; i++) {
        seen.push(s.activePlayer);
        passTurn(s);
        if (isOver(s)) break;
      }
      const expected: number[] = [];
      for (let i = 0; i < n * 2; i++) expected.push(i % n);
      expect(seen).toEqual(expected);
    }
  });

  it('advances the turn index once per shot', () => {
    const s = createMatch(11, config(3));
    for (let i = 0; i < 6; i++) {
      expect(s.turnIndex).toBe(i);
      passTurn(s);
    }
  });

  it('records one log entry per turn', () => {
    const s = createMatch(11, config(2));
    for (let i = 0; i < 5; i++) passTurn(s);
    expect(s.log.length).toBe(5);
    expect(s.log.map((t) => t.turnIndex)).toEqual([0, 1, 2, 3, 4]);
  });

  it('ends at the turn limit', () => {
    const s = createMatch(11, config(2));
    for (let i = 0; i < rules.turnLimit + 5 && !isOver(s); i++) passTurn(s);
    expect(s.phase).toBe(PHASE_ROUND_OVER);
    expect(s.outcome?.reason).toBe('turnLimit');
    expect(s.turnIndex).toBe(rules.turnLimit);
  });
});

describe('match log', () => {
  it('captures every field Appendix B.1 asks for', () => {
    const s = createMatch(11, config(2));
    passTurn(s);
    const t = s.log[0];
    expect(t).toBeDefined();
    if (t === undefined) return;
    expect(t).toHaveProperty('shooter');
    expect(t).toHaveProperty('weapon');
    expect(t).toHaveProperty('angleDeg');
    expect(t).toHaveProperty('power');
    expect(t).toHaveProperty('windAtFire');
    expect(t).toHaveProperty('impactDistance');
    expect(t.damageDealt.length).toBe(2);
    expect(t.healthBefore.length).toBe(2);
    expect(t.healthAfter.length).toBe(2);
    expect(Array.isArray(t.deaths)).toBe(true);
    expect(typeof t.volumeAdded).toBe('number');
    expect(typeof t.volumeRemoved).toBe('number');
  });

  it('records the wind in force when the shot was fired, not the next turn wind', () => {
    const s = createMatch(11, config(2));
    const windAtFire = s.wind;
    passTurn(s);
    expect(s.log[0]?.windAtFire).toBe(windAtFire);
    expect(s.wind).not.toBe(windAtFire);
  });
});

describe('damage falloff', () => {
  it('is linear from the epicentre to zero at the blast radius', () => {
    expect(blastFalloff(0, 50, 20)).toBe(50);
    expect(blastFalloff(10, 50, 20)).toBe(25);
    expect(blastFalloff(20, 50, 20)).toBe(0);
    expect(blastFalloff(25, 50, 20)).toBe(0);
  });

  it('is zero for a weapon with no blast', () => {
    expect(blastFalloff(0, 0, 0)).toBe(0);
  });
});

describe('determinism', () => {
  it('produces identical hashes for identical input sequences', () => {
    const hashes = new Set<string>();
    for (let run = 0; run < 20; run++) {
      const s = createMatch(4242, config(3));
      for (let i = 0; i < 8; i++) passTurn(s);
      hashes.add(hashState(s));
    }
    expect(hashes.size).toBe(1);
  });

  it('diverges when the seed changes', () => {
    const a = createMatch(1, config(2));
    const b = createMatch(2, config(2));
    passTurn(a);
    passTurn(b);
    expect(hashState(a)).not.toBe(hashState(b));
  });

  it('folds the match log into the hash', () => {
    const s = createMatch(7, config(2));
    passTurn(s);
    const before = hashState(s);
    const first = s.log[0];
    if (first === undefined) throw new Error('no log entry');
    s.log[0] = { ...first, impactDistance: first.impactDistance + 1 };
    expect(hashState(s)).not.toBe(before);
  });

  it('folds the terrain mask into the hash', () => {
    const s = createMatch(7, config(2));
    const before = hashState(s);
    s.terrain.mask[0] = s.terrain.mask[0] === 1 ? 0 : 1;
    expect(hashState(s)).not.toBe(before);
  });

  it('folds the RNG cursor into the hash', () => {
    const s = createMatch(7, config(2));
    const before = hashState(s);
    s.rng.s = (s.rng.s + 1) >>> 0;
    expect(hashState(s)).not.toBe(before);
  });
});

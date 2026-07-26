import { describe, expect, it } from 'vitest';
import { classify, loadClassifier } from '../src/classify';
import type { DeathRecord, MatchSummary, Outcome, TurnRecord } from '../src/types';
import classifierJson from '../../content/classifier.json';

/**
 * Appendix B.4: the classifier must be covered by unit tests over hand-built
 * match logs, not just by live play. Every log below is written by hand so a
 * rule can be tested in isolation from whether the sim can currently produce
 * that situation.
 */

const CONFIG = loadClassifier(classifierJson);

function death(over: Partial<DeathRecord> = {}): DeathRecord {
  return { player: 1, cause: 'blast', killer: 0, buried: false, rollDistance: 0, ...over };
}

function turn(over: Partial<TurnRecord> = {}): TurnRecord {
  return {
    turnIndex: 0,
    shooter: 0,
    weapon: 0,
    angleDeg: 45,
    power: 500,
    windAtFire: 0,
    impactDistance: 5,
    damageDealt: [0, 0],
    healthBefore: [100, 100],
    healthAfter: [100, 100],
    deaths: [],
    volumeAdded: 0,
    volumeRemoved: 0,
    ...over,
  };
}

function summary(turns: TurnRecord[], outcome: Outcome): MatchSummary {
  return { seed: 1, playerCount: 2, maxHealth: 100, turns, outcome };
}

const WON: Outcome = { winner: 0, reason: 'lastStanding' };

describe('title completion', () => {
  it('always prefixes the headline', () => {
    expect(CONFIG.prefix).toBe('Mother of All ');
    for (const rule of CONFIG.rules) expect(rule.headline.startsWith('Mother')).toBe(false);
  });

  it('falls back to Games, which is also the 1991 tagline', () => {
    // The winner has to have been hit for this to reach the catch-all;
    // an untouched winner is a Beating and correctly outranks it.
    const c = classify(CONFIG, summary([turn({ damageDealt: [15, 0] })], WON));
    expect(c.headline).toBe('Mother of All Games');
    expect(c.ruleId).toBe('games');
  });

  it('classifies a burial and stamps it SOD OFF', () => {
    const c = classify(
      CONFIG,
      summary([turn({ deaths: [death({ cause: 'crush', buried: true })] })], WON),
    );
    expect(c.headline).toBe('Mother of All Burials');
    expect(c.stamp).toBe('SOD OFF');
  });

  it('does not call an unburied crush a burial', () => {
    const c = classify(
      CONFIG,
      summary([turn({ deaths: [death({ cause: 'crush', buried: false })] })], WON),
    );
    expect(c.headline).not.toBe('Mother of All Burials');
  });

  it('classifies a comeback from below ten percent', () => {
    const c = classify(
      CONFIG,
      summary([turn({ healthAfter: [8, 100] }), turn({ turnIndex: 1, healthAfter: [8, 0] })], WON),
    );
    expect(c.headline).toBe('Mother of All Comebacks');
  });

  it('does not call a win from eleven percent a comeback', () => {
    const c = classify(CONFIG, summary([turn({ healthAfter: [11, 100] })], WON));
    expect(c.headline).not.toBe('Mother of All Comebacks');
  });

  it('does not read a dead player as having come back', () => {
    // healthAfter of 0 is below the floor but means eliminated, not clutch.
    const c = classify(CONFIG, summary([turn({ healthAfter: [0, 100] })], WON));
    expect(c.headline).not.toBe('Mother of All Comebacks');
  });

  it('classifies an own goal', () => {
    const c = classify(
      CONFIG,
      summary([turn({ deaths: [death({ player: 1, cause: 'self', killer: 1 })] })], {
        winner: 0,
        reason: 'lastStanding',
      }),
    );
    expect(c.headline).toBe('Mother of All Own Goals');
  });

  it('classifies three consecutive misses by the winner', () => {
    const miss = (i: number) => turn({ turnIndex: i, shooter: 0, impactDistance: 90 });
    const c = classify(CONFIG, summary([miss(0), miss(2), miss(4)], WON));
    expect(c.headline).toBe('Mother of All Whiffs');
  });

  it('does not count the loser misses towards Whiffs', () => {
    const winnerHit = turn({ shooter: 0, impactDistance: 3 });
    const loserMiss = (i: number) => turn({ turnIndex: i, shooter: 1, impactDistance: 200 });
    const c = classify(
      CONFIG,
      summary([winnerHit, loserMiss(1), loserMiss(3), loserMiss(5)], WON),
    );
    expect(c.headline).not.toBe('Mother of All Whiffs');
  });

  it('resets the miss run on a hit', () => {
    const miss = (i: number) => turn({ turnIndex: i, shooter: 0, impactDistance: 90 });
    const hit = (i: number) => turn({ turnIndex: i, shooter: 0, impactDistance: 4 });
    const c = classify(CONFIG, summary([miss(0), miss(2), hit(4), miss(6)], WON));
    expect(c.headline).not.toBe('Mother of All Whiffs');
  });

  it('treats a shot that left the arena as a miss', () => {
    const off = (i: number) => turn({ turnIndex: i, shooter: 0, impactDistance: -1 });
    const c = classify(CONFIG, summary([off(0), off(2), off(4)], WON));
    expect(c.headline).toBe('Mother of All Whiffs');
  });

  it('classifies a long roller walk', () => {
    const c = classify(
      CONFIG,
      summary(
        [turn({ shooter: 0, impactDistance: 2, deaths: [death({ cause: 'roll', rollDistance: 240 })] })],
        WON,
      ),
    );
    expect(c.headline).toBe('Mother of All Long Walks');
  });

  it('does not call a short roll a long walk', () => {
    const c = classify(
      CONFIG,
      summary(
        [turn({ shooter: 0, impactDistance: 2, deaths: [death({ cause: 'roll', rollDistance: 30 })] })],
        WON,
      ),
    );
    expect(c.headline).not.toBe('Mother of All Long Walks');
  });

  it('classifies a fall kill', () => {
    const c = classify(
      CONFIG,
      summary([turn({ shooter: 0, impactDistance: 2, deaths: [death({ cause: 'fall' })] })], WON),
    );
    expect(c.headline).toBe('Mother of All Pratfalls');
  });

  it('classifies a turn-limit draw as a stalemate', () => {
    const c = classify(CONFIG, summary([turn()], { winner: -1, reason: 'turnLimit' }));
    expect(c.headline).toBe('Mother of All Stalemates');
  });

  it('classifies an untouched winner as a beating', () => {
    const c = classify(
      CONFIG,
      summary([turn({ damageDealt: [0, 60] }), turn({ turnIndex: 1, damageDealt: [0, 40] })], WON),
    );
    expect(c.headline).toBe('Mother of All Beatings');
  });

  it('does not call a bruised winner a beating', () => {
    const c = classify(CONFIG, summary([turn({ damageDealt: [12, 60] })], WON));
    expect(c.headline).not.toBe('Mother of All Beatings');
  });

  it('honours rule order: a burial outranks a comeback', () => {
    const c = classify(
      CONFIG,
      summary(
        [turn({ healthAfter: [5, 100], deaths: [death({ cause: 'crush', buried: true })] })],
        WON,
      ),
    );
    expect(c.headline).toBe('Mother of All Burials');
  });

  it('skips winner-dependent rules on a draw', () => {
    const c = classify(
      CONFIG,
      summary([turn({ damageDealt: [0, 0] })], { winner: -1, reason: 'allDead' }),
    );
    expect(c.headline).toBe('Mother of All Games');
  });

  it('is deterministic', () => {
    const s = summary([turn({ deaths: [death({ cause: 'fall' })] })], WON);
    const first = classify(CONFIG, s);
    for (let i = 0; i < 50; i++) expect(classify(CONFIG, s)).toEqual(first);
  });
});

describe('classifier content', () => {
  it('requires a terminal catch-all so the fallback is always reachable', () => {
    expect(() =>
      loadClassifier({ prefix: 'x', rules: [{ id: 'a', predicate: 'deathBySelf', headline: 'A', stamp: null }] }),
    ).toThrow(/always/);
  });

  it('rejects an unknown predicate', () => {
    expect(() =>
      loadClassifier({ prefix: 'x', rules: [{ id: 'a', predicate: 'vibes', headline: 'A', stamp: null }] }),
    ).toThrow(/unknown predicate/);
  });

  it('leaves stamp copy beyond SOD OFF unwritten', () => {
    // B.3 says to ask before writing further stamp copy. Guessing it in a
    // content file is how placeholder voice work ships by accident.
    const stamped = CONFIG.rules.filter((r) => r.stamp !== null);
    expect(stamped.map((r) => r.id)).toEqual(['burials']);
  });
});

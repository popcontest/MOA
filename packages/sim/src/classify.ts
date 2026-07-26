import type { MatchSummary, TurnRecord } from './types';

/**
 * Appendix B.2. Ordered rules, first match wins, so the list is a priority
 * ordering rather than a scoring model.
 *
 * Order, thresholds, headlines and stamps are data. Only the predicate
 * vocabulary is code, because "did the winner miss three times running" is not
 * expressible in JSON without inventing an expression language, which would be
 * a worse trade than a closed list of nine names.
 */

export type ClassifierRule = {
  readonly id: string;
  readonly predicate: string;
  readonly params: Readonly<Record<string, unknown>>;
  readonly headline: string;
  readonly stamp: string | null;
};

export type ClassifierConfig = {
  readonly prefix: string;
  readonly rules: readonly ClassifierRule[];
};

export type Classification = {
  readonly ruleId: string;
  readonly headline: string;
  readonly stamp: string | null;
};

function paramNumber(params: Readonly<Record<string, unknown>>, key: string, dflt: number): number {
  const v = params[key];
  return typeof v === 'number' ? v : dflt;
}

function paramString(params: Readonly<Record<string, unknown>>, key: string, dflt: string): string {
  const v = params[key];
  return typeof v === 'string' ? v : dflt;
}

function winnerTurns(m: MatchSummary): TurnRecord[] {
  if (m.outcome.winner < 0) return [];
  return m.turns.filter((t) => t.shooter === m.outcome.winner);
}

type Predicate = (m: MatchSummary, params: Readonly<Record<string, unknown>>) => boolean;

const PREDICATES: Readonly<Record<string, Predicate>> = {
  deathByBurial: (m) => m.turns.some((t) => t.deaths.some((d) => d.buried)),

  deathBySelf: (m) => m.turns.some((t) => t.deaths.some((d) => d.cause === 'self')),

  killByFall: (m) => m.turns.some((t) => t.deaths.some((d) => d.cause === 'fall')),

  killByRollOver: (m, p) => {
    const cells = paramNumber(p, 'cells', 100);
    return m.turns.some((t) =>
      t.deaths.some((d) => d.cause === 'roll' && d.rollDistance >= cells),
    );
  },

  winnerHealthDippedBelow: (m, p) => {
    const w = m.outcome.winner;
    if (w < 0) return false;
    const floor = m.maxHealth * paramNumber(p, 'fraction', 0.1);
    return m.turns.some((t) => {
      const h = t.healthAfter[w];
      return h !== undefined && h > 0 && h < floor;
    });
  },

  winnerConsecutiveMisses: (m, p) => {
    const need = paramNumber(p, 'count', 3);
    const distance = paramNumber(p, 'distance', 40);
    let run = 0;
    for (const t of winnerTurns(m)) {
      const missed = t.impactDistance < 0 || t.impactDistance > distance;
      run = missed ? run + 1 : 0;
      if (run >= need) return true;
    }
    return false;
  },

  winnerUndamaged: (m) => {
    const w = m.outcome.winner;
    if (w < 0) return false;
    return m.turns.every((t) => {
      const d = t.damageDealt[w];
      return d === undefined || d === 0;
    });
  },

  outcomeReason: (m, p) => m.outcome.reason === paramString(p, 'reason', 'turnLimit'),

  always: () => true,
};

export function loadClassifier(json: unknown): ClassifierConfig {
  if (typeof json !== 'object' || json === null) throw new Error('classifier.json: expected an object');
  const root = json as Record<string, unknown>;
  const rawRules = root['rules'];
  if (!Array.isArray(rawRules) || rawRules.length === 0) {
    throw new Error('classifier.json: rules must be a non-empty array');
  }

  const rules: ClassifierRule[] = rawRules.map((r, i) => {
    if (typeof r !== 'object' || r === null) throw new Error(`classifier.json: rules[${i}] is not an object`);
    const o = r as Record<string, unknown>;
    const id = o['id'];
    const predicate = o['predicate'];
    const headline = o['headline'];
    const stamp = o['stamp'];
    if (typeof id !== 'string') throw new Error(`classifier.json: rules[${i}].id must be a string`);
    if (typeof predicate !== 'string' || PREDICATES[predicate] === undefined) {
      throw new Error(`classifier.json: rules[${i}] has unknown predicate "${String(predicate)}"`);
    }
    if (typeof headline !== 'string') {
      throw new Error(`classifier.json: rules[${i}].headline must be a string`);
    }
    if (stamp !== null && typeof stamp !== 'string') {
      throw new Error(`classifier.json: rules[${i}].stamp must be a string or null`);
    }
    const params = o['params'];
    return {
      id,
      predicate,
      params: typeof params === 'object' && params !== null ? (params as Record<string, unknown>) : {},
      headline,
      stamp,
    };
  });

  const last = rules[rules.length - 1];
  if (last === undefined || last.predicate !== 'always') {
    // Without a terminal catch-all the classifier can return nothing, and the
    // fallback headline is the one that matters most: "Mother of All Games".
    throw new Error('classifier.json: the last rule must use the "always" predicate');
  }

  return { prefix: typeof root['prefix'] === 'string' ? root['prefix'] : 'Mother of All ', rules };
}

export function classify(config: ClassifierConfig, m: MatchSummary): Classification {
  for (const rule of config.rules) {
    const fn = PREDICATES[rule.predicate];
    if (fn === undefined) continue;
    if (fn(m, rule.params)) {
      return { ruleId: rule.id, headline: config.prefix + rule.headline, stamp: rule.stamp };
    }
  }
  throw new Error('classify: no rule matched, which loadClassifier should have made impossible');
}

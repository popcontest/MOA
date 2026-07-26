import type { Fixture, RunResult } from './harness';

/**
 * Behavioural assertions live beside the hash on purpose. A hash alone proves
 * only that nothing changed; it cannot tell you the roller fixture still has a
 * roller in it. If a refactor quietly stopped rolling, the hash would change,
 * someone would rebaseline it, and the fixture would go on passing forever
 * while testing nothing.
 */
export function checkExpectations(f: Fixture, r: RunResult): string[] {
  const problems: string[] = [];
  const e = f.expect;
  const outcome = r.state.outcome;

  if (e.outcomeReason !== undefined) {
    if (outcome === null) problems.push(`expected outcome ${e.outcomeReason}, match never ended`);
    else if (outcome.reason !== e.outcomeReason) {
      problems.push(`outcome reason ${outcome.reason}, expected ${e.outcomeReason}`);
    }
  }

  if (e.winner !== undefined) {
    const w = outcome === null ? null : outcome.winner;
    if (w !== e.winner) problems.push(`winner ${String(w)}, expected ${e.winner}`);
  }

  const first = r.state.log[0];

  if (e.windSign !== undefined) {
    const w = first === undefined ? 0 : first.windAtFire;
    const sign = w < 0 ? -1 : 1;
    if (sign !== e.windSign) {
      problems.push(`wind at fire ${w.toFixed(2)} (sign ${sign}), expected sign ${e.windSign}`);
    }
  }

  if (e.firstImpactDistanceBetween !== undefined) {
    const [lo, hi] = e.firstImpactDistanceBetween;
    const d = first === undefined ? -1 : first.impactDistance;
    if (d < lo || d > hi) {
      problems.push(`first impact distance ${d.toFixed(1)}, expected between ${lo} and ${hi}`);
    }
  }

  const totalDamage = r.state.log.reduce(
    (sum, t) => sum + t.damageDealt.reduce((a, b) => a + b, 0),
    0,
  );
  if (e.totalDamageAtMost !== undefined && totalDamage > e.totalDamageAtMost) {
    problems.push(`total damage ${totalDamage.toFixed(1)}, expected <= ${e.totalDamageAtMost}`);
  }
  if (e.totalDamageAtLeast !== undefined && totalDamage < e.totalDamageAtLeast) {
    problems.push(`total damage ${totalDamage.toFixed(1)}, expected >= ${e.totalDamageAtLeast}`);
  }

  const allDeaths = r.state.log.flatMap((t) => t.deaths);

  if (e.deathCauses !== undefined) {
    for (const cause of e.deathCauses) {
      if (!allDeaths.some((d) => d.cause === cause)) {
        const got = allDeaths.map((d) => d.cause).join(', ') || 'none';
        problems.push(`no death with cause "${cause}" (got: ${got})`);
      }
    }
  }

  if (e.buriedDeath !== undefined) {
    const got = allDeaths.some((d) => d.buried);
    if (got !== e.buriedDeath) problems.push(`buried death ${got}, expected ${e.buriedDeath}`);
  }

  if (e.minRollDistance !== undefined) {
    const best = allDeaths.reduce((m, d) => Math.max(m, d.rollDistance), 0);
    if (best < e.minRollDistance) {
      problems.push(`best roll-kill distance ${best.toFixed(1)}, expected >= ${e.minRollDistance}`);
    }
  }

  if (e.sawRolling !== undefined && r.observations.sawRolling !== e.sawRolling) {
    problems.push(`sawRolling ${r.observations.sawRolling}, expected ${e.sawRolling}`);
  }
  if (e.sawBurrowing !== undefined && r.observations.sawBurrowing !== e.sawBurrowing) {
    problems.push(`sawBurrowing ${r.observations.sawBurrowing}, expected ${e.sawBurrowing}`);
  }

  if (e.maxActiveProjectilesAtLeast !== undefined) {
    if (r.observations.maxActiveProjectiles < e.maxActiveProjectilesAtLeast) {
      problems.push(
        `max concurrent projectiles ${r.observations.maxActiveProjectiles}, expected >= ${e.maxActiveProjectilesAtLeast}`,
      );
    }
  }

  if (e.turnVolumeRemovedAtLeast !== undefined) {
    if (r.observations.maxTurnVolumeRemoved < e.turnVolumeRemovedAtLeast) {
      problems.push(
        `max terrain removed in a turn ${r.observations.maxTurnVolumeRemoved}, expected >= ${e.turnVolumeRemovedAtLeast}`,
      );
    }
  }

  if (e.turnVolumeAddedAtLeast !== undefined) {
    if (r.observations.maxTurnVolumeAdded < e.turnVolumeAddedAtLeast) {
      problems.push(
        `max terrain added in a turn ${r.observations.maxTurnVolumeAdded}, expected >= ${e.turnVolumeAddedAtLeast}`,
      );
    }
  }

  if (e.headline !== undefined) {
    const got = r.classification === null ? null : r.classification.headline;
    if (got !== e.headline) problems.push(`headline ${String(got)}, expected ${e.headline}`);
  }

  if (e.stamp !== undefined) {
    const got = r.classification === null ? undefined : r.classification.stamp;
    if (got !== e.stamp) problems.push(`stamp ${String(got)}, expected ${String(e.stamp)}`);
  }

  return problems;
}

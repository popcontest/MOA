import {
  PHASE_RESOLVING,
  createMatch,
  isOver,
  makeRng,
  nextFloat,
  nextInt,
  nextRange,
  step,
  submitInput,
  summarize,
  weaponAt,
  type MatchConfig,
} from '@moa/sim';
import { classifierConfig, loadout, makeConfig, registry } from '@moa/replay';
import { classify } from '@moa/sim';

export type WeaponStats = {
  weapon: string;
  shots: number;
  damage: number;
  kills: number;
  /** Matches won by a player whose last shot used this weapon. */
  finishers: number;
};

export type BalanceReport = {
  matches: number;
  elapsedMs: number;
  turnsTotal: number;
  stalemates: number;
  draws: number;
  perWeapon: WeaponStats[];
  winRateByPlayer: number[];
  meanTurnsToKill: number;
  headlines: Map<string, number>;
};

export type RunOptions = {
  matches: number;
  playerCount: number;
  arena: string;
  seed: number;
};

/**
 * Random-vs-random. This is a measurement instrument, not an opponent: the AI
 * lands in M6, and balance numbers taken against a real AI would move every
 * time that AI changed. Random play keeps the baseline stable so weapon edits
 * are the only thing the numbers respond to.
 */
export function runBalance(opts: RunOptions): BalanceReport {
  const config: MatchConfig = makeConfig(opts.arena, opts.playerCount);
  const stats = new Map<number, WeaponStats>();
  for (const w of loadout) {
    stats.set(w, { weapon: weaponAt(registry, w).id, shots: 0, damage: 0, kills: 0, finishers: 0 });
  }

  const winRateByPlayer = new Array<number>(opts.playerCount).fill(0);
  const headlines = new Map<string, number>();
  let stalemates = 0;
  let draws = 0;
  let turnsTotal = 0;
  let killMatches = 0;
  let killTurns = 0;

  const start = performance.now();

  for (let m = 0; m < opts.matches; m++) {
    // One RNG for shot selection, separate from the match's own stream, so
    // changing how the runner picks shots cannot perturb terrain generation.
    const pick = makeRng(opts.seed + m * 2654435761);
    const s = createMatch(opts.seed + m, config);

    let guard = 0;
    while (!isOver(s) && guard < 20000) {
      const weapon = loadout[nextInt(pick, loadout.length)];
      if (weapon === undefined) break;
      const angleDeg = nextRange(pick, 10, 170);
      const power = 200 + nextFloat(pick) * 800;

      const st = stats.get(weapon);
      if (st !== undefined) st.shots++;

      submitInput(s, { angleDeg, power, weapon });
      while (s.phase === PHASE_RESOLVING && guard < 20000) {
        step(s);
        guard++;
      }

      const turn = s.log[s.log.length - 1];
      if (turn !== undefined && st !== undefined) {
        for (let i = 0; i < turn.damageDealt.length; i++) {
          const d = turn.damageDealt[i];
          if (d !== undefined) st.damage += d;
        }
        st.kills += turn.deaths.length;
      }
    }

    turnsTotal += s.turnIndex;
    const outcome = s.outcome;
    if (outcome === null) continue;

    if (outcome.reason === 'turnLimit') stalemates++;
    if (outcome.winner < 0) draws++;
    else {
      const prev = winRateByPlayer[outcome.winner];
      winRateByPlayer[outcome.winner] = (prev === undefined ? 0 : prev) + 1;
      if (outcome.reason === 'lastStanding') {
        killMatches++;
        killTurns += s.turnIndex;
        const last = s.log[s.log.length - 1];
        if (last !== undefined) {
          const st = stats.get(last.weapon);
          if (st !== undefined) st.finishers++;
        }
      }
    }

    const card = classify(classifierConfig, summarize(s));
    headlines.set(card.headline, (headlines.get(card.headline) ?? 0) + 1);
  }

  const elapsedMs = performance.now() - start;

  return {
    matches: opts.matches,
    elapsedMs,
    turnsTotal,
    stalemates,
    draws,
    perWeapon: [...stats.values()],
    winRateByPlayer,
    meanTurnsToKill: killMatches === 0 ? 0 : killTurns / killMatches,
    headlines,
  };
}

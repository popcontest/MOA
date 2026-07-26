import type { MatchState, MatchSummary } from './types';

export function summarize(s: MatchState): MatchSummary {
  if (s.outcome === null) throw new Error('summarize: match is not over');
  return {
    seed: s.seed,
    playerCount: s.players.length,
    maxHealth: s.config.rules.maxHealth,
    turns: s.log,
    outcome: s.outcome,
  };
}

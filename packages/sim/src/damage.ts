import type { DeathCause, MatchState, Player } from './types';

/** Distance from a blast centre to a player's body centre. */
export function distanceToPlayer(p: Player, cx: number, cy: number, playerHeight: number): number {
  const dx = p.x - cx;
  const dy = p.y - playerHeight / 2 - cy;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Linear from maxDamage at the epicentre to zero at blastRadius. */
export function blastFalloff(distance: number, maxDamage: number, blastRadius: number): number {
  if (blastRadius <= 0 || distance >= blastRadius) return 0;
  return maxDamage * (1 - distance / blastRadius);
}

/**
 * Single entry point for every health change, so that "who died, of what, and
 * was it their own fault" is recorded in exactly one place and cannot drift
 * between blast, fall and crush paths.
 */
export function applyDamage(
  s: MatchState,
  victim: Player,
  amount: number,
  cause: DeathCause,
  killer: number,
  rollDistance: number,
): void {
  if (!victim.alive || amount <= 0) return;

  const dealt = Math.min(amount, victim.health);
  victim.health -= dealt;

  const prev = s.turn.damageDealt[victim.id];
  s.turn.damageDealt[victim.id] = (prev === undefined ? 0 : prev) + dealt;

  if (victim.health <= 0) {
    victim.health = 0;
    victim.alive = false;
    s.turn.deaths.push({
      player: victim.id,
      cause: cause === 'blast' && killer === victim.id ? 'self' : cause,
      killer,
      buried: cause === 'crush' && s.turn.fillVolumeThisTurn > 0,
      rollDistance,
    });
  }
}

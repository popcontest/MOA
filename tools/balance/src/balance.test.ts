import { describe, expect, it } from 'vitest';
import { runBalance } from './runner';

describe('balance runner', () => {
  const r = runBalance({ matches: 200, playerCount: 2, arena: 'rolling', seed: 1 });

  it('finishes every match it starts', () => {
    expect(r.matches).toBe(200);
    expect(r.turnsTotal).toBeGreaterThan(0);
  });

  it('reports a row per fireable weapon', () => {
    expect(r.perWeapon.map((w) => w.weapon).sort()).toEqual([
      'auger',
      'cluster.mk1',
      'roller.mk1',
      'shell.standard',
      'sod.ball',
    ]);
    for (const w of r.perWeapon) expect(w.shots).toBeGreaterThan(0);
  });

  it('reports win rate, turns to kill and stalemate rate', () => {
    expect(r.winRateByPlayer.length).toBe(2);
    expect(r.meanTurnsToKill).toBeGreaterThan(0);
    expect(r.stalemates).toBeGreaterThanOrEqual(0);
    expect(r.stalemates).toBeLessThanOrEqual(r.matches);
  });

  it('classifies every finished match', () => {
    let carded = 0;
    for (const n of r.headlines.values()) carded += n;
    expect(carded).toBe(r.matches);
  });

  it('is reproducible for a given seed', () => {
    const again = runBalance({ matches: 200, playerCount: 2, arena: 'rolling', seed: 1 });
    expect(again.turnsTotal).toBe(r.turnsTotal);
    expect(again.stalemates).toBe(r.stalemates);
    expect(again.perWeapon).toEqual(r.perWeapon);
    expect([...again.headlines.entries()]).toEqual([...r.headlines.entries()]);
  });

  it('does not favour a seat', () => {
    // Random-vs-random with alternating first shot: a large seat skew would
    // mean turn order itself is worth something, which it should not be.
    const [p0 = 0, p1 = 0] = r.winRateByPlayer;
    expect(Math.abs(p0 - p1) / r.matches).toBeLessThan(0.15);
  });

  it('stays inside the throughput budget', () => {
    // 10,000 matches in under 60s is the milestone target; this is the same
    // work at 1/50 scale, with headroom for a loaded CI box.
    expect(r.elapsedMs).toBeLessThan(6000);
  });
});

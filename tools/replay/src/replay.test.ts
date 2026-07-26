import { describe, expect, it } from 'vitest';
import { FIXTURES } from './fixtures';
import { runFixture } from './harness';
import { checkExpectations } from './check';

describe('replay fixtures', () => {
  it('covers every scenario the milestone calls for', () => {
    expect(FIXTURES.map((f) => f.name).sort()).toEqual([
      'cluster-split',
      'collapse-fall-kill',
      'digger-detonation',
      'direct-hit',
      'near-miss',
      'roller-long-walk',
      'shot-into-wind',
      'shot-with-wind',
      'sod-burial',
      'stalemate',
    ]);
  });

  it('has a real baseline hash for every fixture', () => {
    for (const f of FIXTURES) expect(f.hash).toMatch(/^[0-9a-f]{16}$/);
  });

  for (const f of FIXTURES) {
    describe(f.name, () => {
      const r = runFixture(f);

      it('matches its baseline hash', () => {
        expect(r.hash).toBe(f.hash);
      });

      it('still does what it says it does', () => {
        expect(checkExpectations(f, r)).toEqual([]);
      });
    });
  }
});

describe('determinism', () => {
  it('replays the same fixture 100 times to 100 identical hashes', () => {
    const f = FIXTURES.find((x) => x.name === 'sod-burial');
    expect(f).toBeDefined();
    if (f === undefined) return;

    const hashes = new Set<string>();
    for (let i = 0; i < 100; i++) hashes.add(runFixture(f).hash);
    expect(hashes.size).toBe(1);
    expect([...hashes][0]).toBe(f.hash);
  });

  it('gives every fixture a distinct terminal state', () => {
    const hashes = new Set(FIXTURES.map((f) => f.hash));
    expect(hashes.size).toBe(FIXTURES.length);
  });

  it('is not order dependent across fixtures', () => {
    const forward = FIXTURES.map((f) => runFixture(f).hash);
    const backward = [...FIXTURES].reverse().map((f) => runFixture(f).hash);
    expect(backward.reverse()).toEqual(forward);
  });
});

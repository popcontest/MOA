import type { Fixture, FixtureInput } from './harness';

/**
 * A replay fixture is a seed plus an input sequence plus an expected final
 * hash — and, here, a set of behavioural expectations alongside it.
 *
 * The behavioural half is not redundant. A hash alone only proves nothing
 * changed; it cannot tell you the roller fixture still contains a roller. If a
 * refactor quietly stopped rolling, the hash would move, someone would
 * rebaseline it, and the fixture would go on passing forever while testing
 * nothing.
 *
 * The inputs below were found by sweeping angle and power against these seeds,
 * not hand-computed. That is why they look arbitrary: they are the shots that
 * actually produce the scenario each fixture is named for.
 */

/** P1 sits right of centre, so a full-power lob to the right clears the arena. */
const OFF_ARENA_RIGHT: FixtureInput = { angleDeg: 45, power: 1000, weapon: 'shell.standard' };
/** Mirrored for P0, and into the prevailing wind on seed 1234. */
const OFF_ARENA_LEFT: FixtureInput = { angleDeg: 135, power: 1000, weapon: 'shell.standard' };

/** Drops P1 to 39.2, which is what puts the later kills where they land. */
const SOFTEN_AUGER: FixtureInput = { angleDeg: 16, power: 640, weapon: 'auger' };
/** Follows the auger and takes P1 to 18.8. */
const SOFTEN_SHELL: FixtureInput = { angleDeg: 25, power: 600, weapon: 'shell.standard' };

function alternatingOffArena(turns: number): FixtureInput[] {
  const out: FixtureInput[] = [];
  for (let i = 0; i < turns; i++) out.push(i % 2 === 0 ? OFF_ARENA_LEFT : OFF_ARENA_RIGHT);
  return out;
}

export const FIXTURES: readonly Fixture[] = [
  {
    name: 'direct-hit',
    note: 'Auger softens, shell finishes at the epicentre. Blast kill, last standing.',
    seed: 1234,
    arena: 'rolling',
    playerCount: 2,
    inputs: [SOFTEN_AUGER, OFF_ARENA_RIGHT, { angleDeg: 44, power: 580, weapon: 'shell.standard' }],
    expect: {
      outcomeReason: 'lastStanding',
      winner: 0,
      deathCauses: ['blast'],
      buriedDeath: false,
      headline: 'Mother of All Beatings',
      stamp: null,
    },
    hash: '9bd32349b61ae095',
  },

  {
    name: 'near-miss',
    note: 'Lands 26 cells out, outside the 22-cell blast radius. Nobody is touched.',
    seed: 1234,
    arena: 'rolling',
    playerCount: 2,
    inputs: [{ angleDeg: 22, power: 580, weapon: 'shell.standard' }],
    expect: {
      firstImpactDistanceBetween: [23, 30],
      totalDamageAtMost: 0,
    },
    hash: 'c9d38ab8c728b2b4',
  },

  {
    name: 'shot-into-wind',
    note: 'Seed 7 blows left at -33; P0 fires right and needs 980 power to reach.',
    seed: 7,
    arena: 'rolling',
    playerCount: 2,
    inputs: [{ angleDeg: 15, power: 980, weapon: 'shell.standard' }],
    expect: {
      windSign: -1,
      firstImpactDistanceBetween: [0, 6],
      totalDamageAtLeast: 45,
    },
    hash: '105570dd9f22cda1',
  },

  {
    name: 'shot-with-wind',
    note: 'Seed 1234 blows right at +22; comparable reach costs 620 power.',
    seed: 1234,
    arena: 'rolling',
    playerCount: 2,
    inputs: [{ angleDeg: 22, power: 620, weapon: 'shell.standard' }],
    expect: {
      windSign: 1,
      firstImpactDistanceBetween: [0, 6],
      totalDamageAtLeast: 45,
    },
    hash: '7da68a780c64aa44',
  },

  {
    name: 'cluster-split',
    note: 'Splits at apex into five bomblets. One dud crater could not remove this much.',
    seed: 1234,
    arena: 'rolling',
    playerCount: 2,
    inputs: [{ angleDeg: 15, power: 860, weapon: 'cluster.mk1' }],
    expect: {
      maxActiveProjectilesAtLeast: 5,
      turnVolumeRemovedAtLeast: 800,
    },
    hash: '5f8e54d7ab62e3cb',
  },

  {
    name: 'digger-detonation',
    note: 'Burrows on impact, then detonates when the step budget runs out.',
    seed: 1234,
    arena: 'rolling',
    playerCount: 2,
    inputs: [SOFTEN_AUGER],
    expect: {
      sawBurrowing: true,
      sawRolling: false,
      turnVolumeRemovedAtLeast: 1400,
      totalDamageAtLeast: 55,
    },
    hash: 'efda9b6d5756b659',
  },

  {
    name: 'collapse-fall-kill',
    note: 'P1 survives the blast on a sliver, then the crater drops them out from under.',
    seed: 1234,
    arena: 'rolling',
    playerCount: 2,
    inputs: [SOFTEN_AUGER, OFF_ARENA_RIGHT, { angleDeg: 42, power: 580, weapon: 'shell.standard' }],
    expect: {
      outcomeReason: 'lastStanding',
      winner: 0,
      deathCauses: ['fall'],
      headline: 'Mother of All Pratfalls',
    },
    hash: '798157da525d74de',
  },

  {
    name: 'stalemate',
    note: 'Both players lob out of the arena for the full turn limit. Nobody wins.',
    seed: 1234,
    arena: 'rolling',
    playerCount: 2,
    inputs: alternatingOffArena(30),
    expect: {
      outcomeReason: 'turnLimit',
      winner: -1,
      totalDamageAtMost: 0,
      headline: 'Mother of All Stalemates',
    },
    hash: '6a4c3932dbc128fe',
  },

  {
    name: 'roller-long-walk',
    note: 'Deliberately short lob at 300 power; the roller walks 225 cells downhill into P1.',
    seed: 1234,
    arena: 'rolling',
    playerCount: 2,
    inputs: [
      SOFTEN_AUGER,
      OFF_ARENA_RIGHT,
      SOFTEN_SHELL,
      OFF_ARENA_RIGHT,
      { angleDeg: 15, power: 300, weapon: 'roller.mk1' },
    ],
    expect: {
      outcomeReason: 'lastStanding',
      winner: 0,
      deathCauses: ['roll'],
      sawRolling: true,
      minRollDistance: 200,
      headline: 'Mother of All Long Walks',
    },
    hash: 'e89c1d899ec90d25',
  },

  {
    name: 'sod-burial',
    note: 'Appendix B.3. The Sod Ball buries P1 and the crush finishes them. SOD OFF.',
    seed: 1234,
    arena: 'rolling',
    playerCount: 2,
    inputs: [
      SOFTEN_AUGER,
      OFF_ARENA_RIGHT,
      SOFTEN_SHELL,
      OFF_ARENA_RIGHT,
      { angleDeg: 24, power: 600, weapon: 'sod.ball' },
    ],
    expect: {
      outcomeReason: 'lastStanding',
      winner: 0,
      deathCauses: ['crush'],
      buriedDeath: true,
      turnVolumeAddedAtLeast: 700,
      headline: 'Mother of All Burials',
      stamp: 'SOD OFF',
    },
    hash: '6cb2f0fba7799ac7',
  },
];

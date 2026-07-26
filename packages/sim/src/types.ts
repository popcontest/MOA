import type { Rng } from './rng';

/** y = 0 is the top of the arena. Gravity is +y. Distances are cells. */

export const STEP_HZ = 120;
export const STEP_SECONDS = 1 / STEP_HZ;

// ---------------------------------------------------------------- terrain

export type Terrain = {
  readonly width: number;
  readonly height: number;
  /**
   * Column-major: index = x * height + y. Every operation in this sim is
   * column-oriented (rasterize, settle, roller descent, player grounding), so
   * column-major turns each of them into a contiguous run. The renderer
   * transposes per dirty rect in M1; dirty rects are small, full rasterizes
   * are not.
   */
  readonly mask: Uint8Array;
  /** Topmost solid y per column, or `height` for an empty column. Derived; not hashed. */
  readonly columnTop: Int32Array;
  volumeAdded: number;
  volumeRemoved: number;
};

export type SettleResult = {
  /** Ascending, no duplicates. */
  columns: number[];
  /** Parallel to `columns`. Positive means the surface dropped. */
  drops: number[];
};

// ---------------------------------------------------------------- weapons

export const TRIGGER_IDS = [
  'impactPlayer',
  'impactTerrain',
  'apex',
  'fuse',
  'leaveArena',
  'budgetEnd',
  'rest',
] as const;
export type TriggerId = (typeof TRIGGER_IDS)[number];

export const TRIGGER_INDEX: Readonly<Record<TriggerId, number>> = {
  impactPlayer: 0,
  impactTerrain: 1,
  apex: 2,
  fuse: 3,
  leaveArena: 4,
  budgetEnd: 5,
  rest: 6,
};

export const MODE_FLYING = 0;
export const MODE_ROLLING = 1;
export const MODE_BURROWING = 2;
export type Mode = 0 | 1 | 2;

export type BlastEffect = {
  readonly kind: 'blast';
  readonly maxDamage: number;
  readonly blastRadius: number;
  readonly carveRadius: number;
  readonly fillRadius: number;
};

export type SpawnEffect = {
  readonly kind: 'spawn';
  readonly childIndex: number;
  readonly count: number;
  /** Total fan width, in trig table units, resolved from `spreadDeg` at load. */
  readonly spreadUnits: number;
  readonly speedScale: number;
  readonly inheritVelocity: boolean;
  readonly consumeParent: boolean;
};

export type ModeEffect = {
  readonly kind: 'mode';
  readonly mode: Mode;
  readonly speed: number;
  readonly budgetSteps: number;
  readonly carveRadius: number;
  readonly onEnd: readonly number[];
  readonly onRest: readonly number[];
  readonly onImpactPlayer: readonly number[];
};

export type ExpireEffect = { readonly kind: 'expire' };

export type Effect = BlastEffect | SpawnEffect | ModeEffect | ExpireEffect;

export type Weapon = {
  readonly id: string;
  readonly name: string;
  readonly family: string;
  readonly speedScale: number;
  readonly gravityScale: number;
  readonly windScale: number;
  /** Steps until the `fuse` trigger, or -1 for none. */
  readonly fuse: number;
  /** Indexed by TRIGGER_INDEX; each entry is a list of effect indices, in order. */
  readonly triggers: readonly (readonly number[])[];
  readonly effects: readonly Effect[];
};

export type WeaponRegistry = {
  readonly weapons: readonly Weapon[];
  readonly byId: ReadonlyMap<string, number>;
};

// ---------------------------------------------------------------- rules

export type Rules = {
  readonly maxHealth: number;
  readonly gravity: number;
  readonly windMax: number;
  readonly powerScale: number;
  readonly turnLimit: number;
  readonly playerRadius: number;
  readonly playerHeight: number;
  readonly muzzleOffset: number;
  readonly fallDamageThreshold: number;
  readonly fallDamagePerCell: number;
  readonly crushDamagePerTurn: number;
  readonly maxGeneration: number;
  readonly maxProjectiles: number;
  readonly rollMaxClimb: number;
  /** A shot landing further than this from every target counts as a miss. */
  readonly missDistance: number;
};

export type ArenaParams = {
  readonly width: number;
  readonly height: number;
  readonly roughness: number;
  readonly minGround: number;
  readonly maxGround: number;
};

// ---------------------------------------------------------------- match

export type Player = {
  readonly id: number;
  alive: boolean;
  x: number;
  /** Ground contact. The body occupies [y - playerHeight, y - 1]. */
  y: number;
  health: number;
  lastAngleDeg: number;
  lastPower: number;
  lastWeapon: number;
  /** Turn index at which fill material enclosed this player, else -1. */
  buriedTurn: number;
};

export type Projectile = {
  active: boolean;
  weapon: number;
  owner: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  mode: Mode;
  age: number;
  /** Steps left in the current mode, or -1 for unbounded. */
  budget: number;
  fuse: number;
  generation: number;
  /** Cells travelled while rolling. Feeds "Long Walks". */
  rolled: number;
  prevVy: number;
  hasSplit: boolean;
  /** Effect index that put this projectile into its current mode, else -1. */
  modeEffect: number;
};

export const PHASE_AWAITING_INPUT = 0;
export const PHASE_RESOLVING = 1;
export const PHASE_ROUND_OVER = 2;
export type Phase = 0 | 1 | 2;

export type DeathCause = 'blast' | 'fall' | 'crush' | 'roll' | 'self' | 'drown';

export type DeathRecord = {
  readonly player: number;
  readonly cause: DeathCause;
  /** -1 when environmental. */
  readonly killer: number;
  /** Crushed under material added by a fill this turn. Drives Burials / SOD OFF. */
  readonly buried: boolean;
  readonly rollDistance: number;
};

export type TurnRecord = {
  readonly turnIndex: number;
  readonly shooter: number;
  readonly weapon: number;
  readonly angleDeg: number;
  readonly power: number;
  readonly windAtFire: number;
  /** Cells from the first detonation to the nearest living target, or -1. */
  readonly impactDistance: number;
  readonly damageDealt: readonly number[];
  readonly healthBefore: readonly number[];
  readonly healthAfter: readonly number[];
  readonly deaths: readonly DeathRecord[];
  readonly volumeAdded: number;
  readonly volumeRemoved: number;
};

export type OutcomeReason = 'lastStanding' | 'turnLimit' | 'allDead';

export type Outcome = {
  /** -1 on a draw. */
  readonly winner: number;
  readonly reason: OutcomeReason;
};

export type MatchConfig = {
  readonly playerCount: number;
  readonly arena: ArenaParams;
  readonly rules: Rules;
  readonly registry: WeaponRegistry;
  /** Weapon indices each player may fire. Empty means the whole registry. */
  readonly loadout: readonly number[];
};

export type TurnInput = {
  readonly angleDeg: number;
  readonly power: number;
  readonly weapon: number;
};

export type MatchState = {
  readonly seed: number;
  readonly config: MatchConfig;
  tick: number;
  turnIndex: number;
  activePlayer: number;
  phase: Phase;
  wind: number;
  readonly terrain: Terrain;
  readonly players: Player[];
  readonly projectiles: Projectile[];
  readonly rng: Rng;
  readonly log: TurnRecord[];
  outcome: Outcome | null;
  /** Scratch for the turn in flight. Reset on submitInput; not hashed. */
  readonly turn: TurnAccumulator;
  /**
   * Pool indices active at the top of the current tick. Snapshotting keeps a
   * child spawned mid-tick from stepping in the tick it was born, which would
   * otherwise make a bomblet's behaviour depend on which pool slot it landed
   * in. Not hashed.
   */
  readonly stepOrder: Int32Array;
};

export type TurnAccumulator = {
  shooter: number;
  weapon: number;
  angleDeg: number;
  power: number;
  windAtFire: number;
  healthBefore: number[];
  damageDealt: number[];
  deaths: DeathRecord[];
  impactDistance: number;
  fillVolumeThisTurn: number;
  dirtyMinX: number;
  dirtyMaxX: number;
};

export type MatchSummary = {
  readonly seed: number;
  readonly playerCount: number;
  readonly maxHealth: number;
  readonly turns: readonly TurnRecord[];
  readonly outcome: Outcome;
};

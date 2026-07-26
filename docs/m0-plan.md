# Milestone 0 — plan (awaiting sign-off)

Headless simulation core plus test harness. No renderer, no PixiJS, no canvas.

Status: **proposed, not approved.** No M0 code exists yet.

---

## 0. Scope reconciliation (read first)

The M0 brief and Appendix A disagree about scope. Appendix A says "read this
before Milestone 0" and marks two systems **must exist in M0**, but neither
appears in the M0 scope list. This plan treats Appendix A as authoritative and
folds both in:

| System | Brief scope list | Appendix A | This plan |
|---|---|---|---|
| `fill()` + settle-from-above + crush damage | absent | "must exist in M0" | in |
| Roller mode (`postImpact`) | absent | "also M0" | in |
| Flowing weapons (napalm) | absent | no M0 marker | out; shares gradient code with rollers, lands in M7 |
| Economy, shop, shields, tracers | absent | no M0 marker | out |

Consequence: `weapons.json` needs five entries, not three, because a schema
feature with no instance is a schema feature with no test. See §4.

---

## 1. Module list

```
packages/sim/src/
  types.ts        every state type. No logic.
  rng.ts          mulberry32. Explicit instances, no module-level state.
  trig.ts         table lookup + lerp. Consumes trig.table.ts.
  trig.table.ts   GENERATED, checked in. 4096 sine samples as a literal.
  hash.ts         FNV-1a over a canonical byte stream.
  terrain.ts      generate, carve, fill, settle, raycast, columnTop.
  projectile.ts   integration, swept collision, mode machine.
  effects.ts      the effect dispatcher. Four kinds, zero weapon ids.
  damage.ts       blast falloff, fall damage, crush damage.
  weapons.ts      load + validate + freeze the weapon registry.
  rules.ts        sim constants loaded from content/rules.json.
  match.ts        turn state machine: createMatch, submitInput, step.
  log.ts          match log append + canonical serialization.
  index.ts        public API surface. The only file anything else imports.

packages/content/
  weapons.json  weapons.schema.json
  arenas.json   arenas.schema.json
  rules.json    rules.schema.json      <- sim constants. Hashed.
  tuning.json   tuning.schema.json     <- feel only. Sim must never read it.

tools/
  codegen/      emits trig.table.ts
  replay/       record, replay, compare
  balance/      headless batch runner
  fixtures/     the ten replay fixtures
```

### tuning.json vs rules.json

CLAUDE.md rule 5 puts feel values in `tuning.json` behind live sliders. A live
slider that reaches the sim would silently invalidate every replay hash on the
project. So the split is enforced, not conventional:

- `rules.json` — gravity, wind range, fall-damage threshold, crush rate, max
  health, turn limit, timestep. Loaded by sim, folded into `MatchConfig`,
  **hashed**. Changing it is a balance change and rebaselines fixtures on
  purpose, with the reason in the commit message.
- `tuning.json` — shake, hit-stop, slow-mo, particles, camera. `packages/sim`
  has no import path to it. A test asserts sim's source never mentions it.

---

## 2. Sim state shape (exact)

Coordinates: cells. `y = 0` is the top of the arena, gravity is `+y`.

### Terrain — column-major

```ts
type Terrain = {
  readonly width: number;
  readonly height: number;
  mask: Uint8Array;        // width*height, index = x*height + y, 1 = solid
  columnTop: Int32Array;   // per column, topmost solid y (== height if empty)
  volumeAdded: number;     // cumulative cells filled, for the match log
  volumeRemoved: number;   // cumulative cells carved
};
```

**Column-major is deliberate.** Every operation in this sim is column-oriented:
rasterizing the generated heightmap, `settle` compaction, roller gradient
descent, player grounding. Column-major makes each of those a contiguous run,
so rasterize and settle become `TypedArray.fill`/`copyWithin` instead of strided
cell loops. The renderer wants row-major for texture upload and will transpose
per dirty rect in M1 — dirty rects are small, full-grid rasterizes are not.

`columnTop` is derived state. It is rebuilt by `settle` and **excluded from the
hash**; only `mask` is hashed.

### Match

```ts
type MatchState = {
  readonly seed: number;
  readonly config: MatchConfig;   // players, turnLimit, arena, frozen rules
  tick: number;                   // 1/120s steps elapsed this match
  turnIndex: number;
  activePlayer: number;
  phase: Phase;                   // AwaitingInput | Resolving | Settling | RoundOver
  wind: number;                   // lateral acceleration, cells/s^2
  terrain: Terrain;
  players: Player[];              // fixed length, iterated by index
  projectiles: Projectile[];      // pool, iterated by index
  rng: RngState;                  // { s: number } — the cursor is the state
  log: MatchLog;
  outcome: Outcome | null;        // { winner, reason: lastStanding|turnLimit|allDead }
};

type Player = {
  id: number;
  alive: boolean;
  x: number; y: number;           // integer cells; y is ground contact
  health: number;                 // 0..maxHealth (100), so B.2's "below 10%" is literal
  lastAngleDeg: number;
  lastPower: number;
  lastWeapon: number;
  buriedTurn: number;             // -1, or the turn a fill enclosed them. Drives SOD OFF.
};

type Projectile = {
  active: boolean;
  weapon: number;                 // registry index, stable (registry sorted by id)
  owner: number;
  x: number; y: number;
  vx: number; vy: number;         // cells/second
  mode: Mode;                     // Flying | Rolling | Burrowing
  age: number;                    // steps since spawn
  budget: number;                 // steps left in current mode, -1 = unbounded
  fuse: number;                   // steps to fuse trigger, -1 = none
  generation: number;             // 0 = player-fired; children +1; capped
  rolled: number;                 // cells rolled, for "Long Walks"
  prevVy: number;                 // apex detection by sign change
  hasSplit: boolean;
};
```

Public API:

```ts
createMatch(seed: number, config: MatchConfig): MatchState
submitInput(s: MatchState, input: TurnInput): void   // AwaitingInput only
step(s: MatchState): void                            // exactly one 1/120s tick
hashState(s: MatchState): string
```

A driver submits an input, then calls `step` until `phase` is `AwaitingInput`
or `RoundOver`. No variable `dt` crosses the boundary, ever.

---

## 3. Terrain operations

- `generate(rng, params)` — 1D midpoint displacement over a power-of-two+1
  heightmap, roughness halving per level, then column-wise rasterize.
- `carve(t, cx, cy, r)` — clear a filled circle. Squared-distance integer
  compare per cell, no `sqrt` in the loop. Returns the touched column range.
- `fill(t, cx, cy, r)` — set a filled circle. First-class peer of `carve` per
  Appendix A. Any player whose body cells become solid gets `buriedTurn` set at
  this moment — that is what makes a later crush death a **Burial**, not a
  generic crush, and it is why SOD OFF is decidable from the log alone.
- `settle(t, x0?, x1?)` — per-column downward compaction: count the solid cells
  in the column, restack them at the bottom. Defaults to the full grid, so the
  brief's `settle()` signature still works; the range exists for performance
  (§7). Columns are independent, so there is no ordering hazard and no lateral
  flow. This one rule handles both "carve removed the support" and "fill dumped
  material from above". Returns `{ columns: Int32Array, drops: Int32Array }` —
  changed columns ascending, plus per-column drop distance, which fall damage
  and the M1 renderer's dirty rects both consume.
- `raycast(t, x0, y0, x1, y1)` — Amanatides–Woo DDA, integer stepping, first
  solid cell or null.

**Tunnelling is solved by construction, not by sampling density.** The swept
segment for a step is handed to `raycast` directly, so there is no sample-step
parameter that can be too coarse for a fast shot.

---

## 4. Weapon schema

Closed vocabulary. The sim switches on `effect.kind` — four cases — and never
on a weapon id. Adding weapon #30 is a JSON edit.

**Triggers** (7): `impactPlayer`, `impactTerrain`, `apex`, `fuse`,
`leaveArena`, `budgetEnd`, `rest`.

**Effect kinds** (4):

| kind | fields |
|---|---|
| `blast` | `maxDamage`, `blastRadius`, `carveRadius`, `fillRadius` |
| `spawn` | `childId`, `count`, `spreadDeg`, `speedScale`, `inheritVelocity`, `consumeParent` |
| `mode` | `mode` (`roll`\|`burrow`), `speed`, `budgetSteps`, `carveRadius`, `onEnd[]`, `onRest[]`, `onImpactPlayer[]` |
| `expire` | — |

Note `blast` carries both `carveRadius` and `fillRadius`, so subtractive and
additive weapons are the same effect with different numbers. A dirt weapon is
`maxDamage: 0, carveRadius: 0, fillRadius: 26`. No new branch.

```json
{
  "id": "shell.standard",
  "name": "Standard Shell",
  "family": "shell",
  "spawn": { "speedScale": 1, "gravityScale": 1, "windScale": 1, "fuse": -1 },
  "triggers": [
    { "on": "impactPlayer",  "effects": ["boom"] },
    { "on": "impactTerrain", "effects": ["boom"] },
    { "on": "leaveArena",    "effects": ["expire"] }
  ],
  "effects": {
    "boom": { "kind": "blast", "maxDamage": 50, "blastRadius": 22,
              "carveRadius": 20, "fillRadius": 0 }
  }
}
```

The five entries, each pulling a different part of the schema:

1. `shell.standard` — blast only. The floor.
2. `cluster.mk1` — `apex` trigger + `spawn`, with an `impactTerrain` fallback
   for the case where it hits before apex.
3. `auger` — `impactTerrain` -> `mode: burrow`, `onEnd` -> blast.
4. `roller.mk1` — `impactTerrain` -> `mode: roll`, `onRest`/`onImpactPlayer`/
   `onEnd` -> blast. Appendix A.
5. `sod.ball` — blast with `fillRadius` only. Appendix A + B.3. The SOD OFF
   family. Name flagged for sign-off, see §9.

`spreadDeg` is authored in degrees and converted once at load to integer trig
table indices (`deg * 4096 / 360`, rounded). Content stays readable, the
runtime never touches a float angle.

**Validation.** `packages/sim` must have zero runtime dependencies, so it
cannot ship `ajv`. Two layers: a ~80-line hand-written structural validator in
`weapons.ts` that runs at load and throws on malformed content, plus the real
JSON Schema validated against the content by `ajv` as a **devDependency** in
the test suite. Load-time validation is satisfied, the zero-dep rule holds, and
the schema is still authoritative.

---

## 5. Determinism

- **mulberry32**, `{ s: number }`, passed explicitly. One stream; `s` is the
  cursor and goes in the hash.
- **Float64 is safe.** `+ - * /` and `sqrt` are correctly rounded by IEEE-754,
  so they are bit-identical across engines. No fixed-point arithmetic needed.
  What is *not* safe is every transcendental.
- **The trig table must be generated, not computed at load.** CLAUDE.md
  specifies a 4096-entry table in `sim/trig.ts`, but the acceptance grep
  (`Math\.(random|sin|cos|tan)` over `packages/sim/src` returns nothing) forbids
  building that table at runtime. So `tools/codegen` emits `trig.table.ts` as a
  checked-in literal. Diffable, auditable, identical on every platform by
  construction. This adds a codegen step CLAUDE.md does not mention — flagging
  it rather than doing it quietly.
  Linear interpolation error at 4096 samples is ~2.9e-7, and the lerp itself is
  exact arithmetic.
- **The ban is wider than the acceptance grep.** A test scans
  `packages/sim/src` and fails on `random|sin|cos|tan|asin|acos|atan|atan2|exp|log|pow|hypot|cbrt|fround|expm1|log1p|sinh|cosh|tanh` and on `**` with a
  non-integer exponent. `abs, min, max, floor, ceil, round, trunc, sign, sqrt`
  stay allowed. `Math.hypot` is specifically banned — it is not correctly
  rounded and it is exactly the function someone reaches for in a distance
  calculation.
- **Fixed evaluation order per step**, stated once and tested: integrate ->
  terrain raycast over the swept segment -> player swept-AABB over the same
  segment -> nearer hit by segment parameter wins, ties go to the player ->
  non-impact triggers (`apex`, `fuse`, `leaveArena`) evaluate only if no impact
  occurred. One trigger per projectile per step.
- **Insertion order everywhere.** Players and projectiles are arrays indexed by
  integer. No `Set`, no `Object.keys`, no `Map` iteration affecting state.
- A second test asserts `packages/sim/package.json` has no `dependencies` key.

### Hashing

FNV-1a, two 32-bit lanes with different offset bases, concatenated to a 64-bit
hex string. CLAUDE.md says "FNV-1a is fine"; 32 bits is thin once ten thousand
balance matches are in play, and a second lane costs one extra multiply per
byte. Still FNV-1a, flagged as a deliberate widening.

Floats are hashed as raw IEEE-754 bytes via `DataView.setFloat64(0, v, true)` —
little-endian forced, so byte order is not a platform variable. A NaN reaching
the hash is a bug and asserts in dev builds.

Canonical order: seed, tick, turnIndex, activePlayer, phase, wind,
`terrain.mask`, volumeAdded, volumeRemoved, each player by index, each active
projectile by pool index, `rng.s`, then match log entries in order.

`hashState` walks the full mask, so it is called at match end or on demand —
never per tick.

---

## 6. Match log (Appendix B.1)

One record per turn, appended, hashed:

```ts
type TurnRecord = {
  turnIndex: number;
  shooter: number;
  weapon: number;
  angleDeg: number;
  power: number;
  windAtFire: number;
  impactDistanceToNearestTarget: number;   // cells, -1 if it left the arena
  damageDealt: number[];                   // per player, by index
  healthBefore: number[];
  healthAfter: number[];
  deaths: DeathRecord[];
  volumeAdded: number;                     // cumulative, end of turn
  volumeRemoved: number;
};

type DeathRecord = {
  player: number;
  cause: 'blast' | 'fall' | 'crush' | 'roll' | 'self' | 'drown';
  killer: number;          // -1 if environmental
  buried: boolean;         // crush under filled material -> Burials / SOD OFF
  rollDistance: number;    // cells, for Long Walks; 0 unless cause is 'roll'
};
```

`drown` is in the enum and unused — water is not in M0, and widening the enum
later would rebaseline every fixture hash.

Every field B.2 needs is derivable from this without a second pass: Burials
(`buried`), Comebacks (`healthBefore` of the winner), Own Goals (`self`),
Whiffs (`impactDistanceToNearestTarget` run), Long Walks (`rollDistance`),
Pratfalls (`fall`), Stalemates (`outcome.reason`), Beatings (`damageDealt`
column for the winner is all zeroes).

---

## 7. Balance runner and the performance budget

Target: 10,000 matches in under 60s — 6ms per match. A match is roughly 20
turns of ~2s flight, so ~4,800 ticks. Per-tick cost is trivial; the risk is
whole-grid work.

Two decisions follow from the budget, both already above:

1. `settle` takes a column range. A full-grid settle per turn is 10,000 x 20 x
   524,288 cell reads, which is nowhere near 60s. Carve and fill return their
   touched column range and settle only runs over it.
2. Column-major rasterize makes `generate` a per-column `fill()` run rather
   than a strided per-cell loop.

Default arena 1024x512. I will measure before optimizing anything further and
report where the time goes rather than guessing, per the brief.

---

## 8. Replay fixtures

The brief's eight, plus two that Appendix A's M0 systems would otherwise ship
untested:

1. direct hit
2. near miss
3. shot into wind
4. shot with wind
5. cluster split at apex
6. digger detonation after burrow
7. terrain collapse causing a fall-damage kill
8. stalemate reaching the turn limit
9. roller kill after a long descent (Appendix A)
10. sod burial crush kill — the SOD OFF case (Appendix A, B.3)

Plus: a determinism test replaying one fixture 100 times and asserting 100
identical hashes, and unit tests on `terrain`, `rng`, `trig`, `hash`.

---

## 9. Open questions

1. **Appendix A in M0** — confirmed in, per §0?
2. **Five weapons rather than three** — the brief says exactly three; rollers
   and dirt need entries to be testable.
3. **`classify()` in M0** — Appendix B puts it at M4.5, and the brief says the
   log "feeds the round summary system later". But B.1's whole argument for
   putting the log in M0 is that it is expensive to backfill, and the only real
   proof the log is sufficient is a consumer that reads it. Recommend: build
   `classify()` as data-driven rules in `content/` with hand-built-log unit
   tests, ~60 lines, this milestone. The card UI stays at M4.5.
4. **Weapon names** — per A.4 I am avoiding Hicken's coined names. Proposed:
   Standard Shell, Cluster Mk I, Auger, Roller Mk I, Sod Ball. "Sod Ball" is
   voice work and B.3 says to ask.

## 10. Things I am picking, not asking about

Say so if any of these are wrong; none are hard to change now and all are
expensive later.

- Max health 100, turn limit 30 turns, gravity and wind range placeholder in
  `rules.json` pending the balance runner.
- 2-player default for fixtures; 3 and 4 player turn order covered by unit test.
- Vitest, npm workspaces, TypeScript strict + `noUncheckedIndexedAccess`.
- Weapon registry indices are assigned by sorting ids at load, so registry
  order does not depend on JSON key order.
- Cluster generation is capped (children cannot split) to bound the pool.

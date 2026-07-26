# MOTHER OF ALL

Turn-based artillery. Milestone 0: the headless simulation core and its test
harness. There is no renderer yet, and nothing in this repo imports PixiJS.

Read `CLAUDE.md` first. `docs/` holds the appendices, the milestone ladder, and
the M0 plan.

## Commands

```
npm install
npm run codegen     # regenerate packages/sim/src/trig.table.ts
npm test            # unit tests, replay fixtures, determinism checks
npm run typecheck
npm run replay      # run the ten replay fixtures and print hashes
npm run balance     # 10,000 headless matches, prints the balance table
```

`npm run balance` takes `--matches=N --players=N --arena=id --seed=N`.

## Layout

```
packages/
  sim/      physics, terrain, damage, turn order, hashing. Zero runtime deps.
    src/    shipped simulation only — the Math.random/sin/cos/tan grep runs here
    test/   unit tests, kept out of src so that grep stays meaningful
  content/  weapons, rules, arenas, classifier, tuning + JSON Schemas
tools/
  codegen/  emits the trig lookup table as a checked-in literal
  replay/   fixtures, harness, hash comparison
  balance/  headless batch match runner
```

`ai/`, `render/`, `ui/` and `app/` are milestones M1 and later.

## Things worth knowing before you change anything

**The terrain mask is column-major.** `index = x * height + y`. Every operation
here is column-oriented, so this turns rasterize and settle into contiguous
runs. The renderer will transpose per dirty rect in M1.

**`settle` compacts each column against the floor.** Caves do not survive a
settle. That is the 1991 behaviour, it is what makes a digger worth a turn, and
it is what lets one rule cover both material falling after a `carve` and
material landing after a `fill`.

**`rules.json` and `tuning.json` are not the same kind of file.** `rules.json`
holds simulation constants and goes into the state hash. `tuning.json` holds
feel values for the M3 dev overlay, and `packages/sim` has no import path to
it — a test enforces that. A live slider that reached the sim would silently
invalidate every replay hash in the project.

**The trig table is generated, not computed.** `packages/sim` may not call
`Math.sin`, and `Math.sin` is not bit-identical across JS engines in any case.
`npm run codegen` bakes 4096 samples into a checked-in literal. Regenerating it
changes replay hashes.

**Weapons are data.** Seven triggers, four effect kinds, and no weapon id
anywhere below `effects.ts`. A dirt weapon is a blast with `fillRadius` set and
`carveRadius` zero. If a new weapon seems to need a new branch, the schema is
wrong — extend it.

**Replay fixtures carry behavioural expectations, not just hashes.** A hash
alone only proves nothing changed; it cannot tell you the roller fixture still
contains a roller. `npm run replay -- --rebaseline` exists, and the testing
doctrine in `CLAUDE.md` applies every time you use it: the commit message must
say what behaviour changed and why the new value is correct.

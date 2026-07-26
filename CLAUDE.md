# MOTHER OF ALL

Turn-based artillery game. Destructible and constructible terrain, ragdoll
deaths, absurd weapons, an economy.

Lineage: Scorched Earth (1991) for the sim, Bowmasters for the feel.

## Name and voice

The title is an unfinished sentence. The game finishes it, differently, at the
end of every round: "Mother of All Comebacks", "Mother of All Whiffs",
"Mother of All Burials". This is a real system, not a tagline. See Appendix B.

Tagline, used on the loading screen only: "The Mother of All Games". This is
Scorched Earth's original 1991 tagline, reused deliberately.

House voice is deadpan. The game never acknowledges its own jokes, never uses
exclamation marks in system copy, and never explains a reference. Write UI text
in a flat military-manual register and let the absurdity come from content.

## Platform target

- Primary: iPhone and iPad, portrait and landscape
- Build path: TypeScript + PixiJS (WebGL) + Vite, wrapped with Capacitor for iOS
- Web build is the dev surface and also ships as-is

## Non-negotiable architecture rules

1. **The simulation is headless.** `packages/sim` imports nothing from `render`,
   `ui`, or PixiJS. If you find yourself needing a canvas inside sim, you have
   made a mistake. Stop and ask.
2. **The simulation is deterministic.** Same seed plus same input sequence must
   produce a byte-identical state hash on every platform, every run.
3. **No physics engine.** Do not add Matter.js, Box2D, Planck, Rapier, or
   anything similar. Projectile motion here is four lines of Euler integration
   and a collision sample. An engine adds nondeterminism and 200kb for nothing.
4. **Weapons are data, not code.** Adding weapon #30 must be a JSON edit. If a
   new weapon requires a new `if` branch in the sim, the weapon schema is wrong.
   Extend the schema instead.
5. **Feel values are never hardcoded on first write.** Screen shake, hit-stop,
   slow-mo, particle counts, camera lag all live in `content/tuning.json` and
   are exposed as live sliders in the dev overlay. A human tunes them on device.

## Determinism requirements (read carefully)

- Never call `Math.random()`. Use the seeded PRNG in `sim/rng.ts` (mulberry32).
  Every consumer of randomness takes an explicit RNG instance.
- Never call `Math.sin`, `Math.cos`, or `Math.tan` inside `packages/sim`.
  These are not specified to bit-identical precision across JS engines, so
  Safari on iOS and V8 in CI can diverge. Use the fixed-resolution trig lookup
  table in `sim/trig.ts` (4096 entries, linear interpolation). `Math.sqrt` and
  the four basic ops are IEEE-754 exact and are fine to use.
- Fixed timestep only. The sim advances in 1/120s steps. Rendering interpolates
  between sim states. Never pass a variable `dt` into sim code.
- Iterate collections in insertion order. No `Object.keys` ordering assumptions,
  no `Set` iteration where order affects state.

## Repo layout

```
packages/
  sim/        physics, terrain, damage, turn order, state hashing. Zero deps.
  ai/         opponent shot selection. Imports sim only.
  content/    weapons.json, characters.json, tuning.json, arenas.json + schemas
  render/     PixiJS. Reads sim state, never writes it.
  ui/         menus, HUD, lobby. Reads sim state, emits intents.
  app/        composition root, Capacitor config, Vite entry
tools/
  replay/     record and replay harness
  balance/    headless batch match runner
  shotgun/    frame-capture screenshot tool
```

## Testing doctrine

- Every physics or terrain change requires a replay test. A replay test is a
  seed plus an input sequence plus an expected final state hash.
- Never update a replay hash to make a test pass without stating in the commit
  message exactly what behavior changed and why the new value is correct.
  Silently rebaselining hashes destroys the only safety net this project has.
- Balance is measured, not asserted. Weapon and character changes get a
  10,000-match headless run reporting win rate, average turns to kill, and
  stalemate rate.

## Code style

- TypeScript strict mode, `noUncheckedIndexedAccess` on
- No classes in `sim` except where object pooling demands it. Plain data plus
  functions that transform it.
- No `any`. No non-null assertions in sim code.
- Comments explain why, not what. Do not narrate the code.

## What you should ask about rather than guess

- Anything involving art direction, character design, or tone of writing
- Whether a new dependency is worth it
- Any change that would make the sim nondeterministic, even slightly
- Monetization, App Store, or analytics. Not in scope, do not scaffold it.

## Reference documents

The appendices and the milestone ladder referenced above live alongside this
file. They are project canon, not scratch notes.

- `docs/appendix-a-heritage.md` — Scorched Earth heritage. Two items in it
  (additive terrain, rollers) are Milestone 0 requirements. Read before M0.
- `docs/appendix-b-title-completion.md` — the "Mother of All ___" system,
  including the match-log fields the sim must record from M0 onward.
- `docs/roadmap.md` — the milestone ladder, M1 through M9. Reference only.
  The active milestone is the one you were asked for, never the next one down.

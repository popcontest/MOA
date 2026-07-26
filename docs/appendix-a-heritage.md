# Appendix A — Scorched Earth heritage

Read this before Milestone 0. Two items here change the sim's requirements and
are expensive to retrofit.

## A.1 Systems (these are the product, not fan service)

**Additive terrain weapons.** The terrain API needs `fill(cx, cy, radius)` as a
first-class peer of `carve`, and `settle()` must handle material arriving from
above. Enables Dirt Ball, Ton of Dirt, and Liquid Dirt. Consequences to get
right: a player fully enclosed in solid material takes crush damage over time,
and building cover is a legitimate defensive turn. **This must exist in M0.**
Bolting additive terrain onto a carve-only mask later means rewriting `settle`.

**Rollers.** On impact, instead of detonating, the projectile enters a rolling
state and follows the terrain gradient downhill until it comes to rest, hits a
player, or exceeds a step budget. Requires a `postImpact` behavior field in the
weapon schema. **Also M0**, since it changes the projectile state machine from
"fly then explode" to a two-phase model. Design purpose: without rollers, the
dominant strategy in every artillery game is to dig in and hide.

**Flowing weapons.** Napalm spreads downhill across the surface over several
sim steps, doing damage per step in contact. Shares the gradient-following code
with rollers.

**Economy.** Cash awarded per round for damage dealt and kills. Between rounds,
a shop. Unspent cash earns interest, so banking is a real alternative to arming
up. Purpose is comeback pressure: a player losing badly should be able to buy
their way back into the match.

**Defensive inventory.** Shields with a damage pool, deflectors that alter
incoming trajectories, parachutes that negate fall damage, batteries that
restore health. All purchasable, all consumed. This is the layer Bowmasters has
none of and it is what makes the shop a decision rather than a vending machine.

**Tracers.** A zero-damage projectile that costs a turn. A ranging resource.

## A.2 1991 Mode

A second renderer, not a filter. Because `sim` is headless and deterministic,
this is a skin: same simulation, byte-identical replays, entirely different
presentation.

- 16-color palette, chunky non-interpolated pixels, 4:3 letterbox
- Square-wave audio approximating PC speaker
- Numeric angle and power entry (degrees, 0 to 1000) as an alternative to
  touch-drag aim
- Original-style status bar and post-round scoreboard

Do not build this before M4. Do not let it constrain the modern renderer.
It exists to prove the architecture and to reward players who recognize it.
Unlock after a first win rather than exposing it in settings from launch.

## A.3 Tone and callbacks

- Loading screen tagline: "The Mother of All Games" (the original's tagline)
- AI opponents get personality names describing behavior, not difficulty tiers.
  Difficulty remains one number internally (aim error standard deviation), but
  personalities also vary target selection and weapon preference.
- A recurring gag: an occasional fake shareware registration nag on launch,
  asking the player to mail a check to a P.O. box. Deadpan, never explained,
  dismissible, never fully goes away. Ask before writing the copy for this.

## A.4 Naming caution

Scorched Earth is Wendell Hicken's 1991 shareware. Game mechanics are not
protectable, so everything in A.1 is fair to implement. Verbatim reuse of his
coined weapon names is a separate question. Default to original names for
marquee weapons and let 1991 Mode carry the homage. Flag to me any name you are
unsure about rather than shipping it.

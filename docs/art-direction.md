# Art direction

Derived from the reference board, July 2026. Every colour here is a
*presentation* value and belongs in `tuning.json`, never `rules.json` — none of
it may reach `packages/sim`, and a test enforces that.

Hex values marked approximate were read off the reference board by eye. They
are starting points for the M3 dev overlay, not final answers. A human tunes
them on device.

## Palette

| Slot | Value | Source |
|---|---|---|
| Sky top | `#6B4E9E` purple | approximate, from board |
| Sky mid | `#E8907C` | approximate |
| Sky horizon | `#F7C9A0` | approximate |
| Soil crust | `#F5E3B8` cream | approximate |
| Soil surface | `#836539` | swatch |
| Soil deep | `#3D2B1F` | swatch |
| Soil floor | `#241608` | approximate |
| Crater scorch | `#1B1B1B` | swatch |
| Projectile trail | `#FFBF00` amber | swatch |
| Damage red | `#C0392B` | swatch |

Soil renders as **8 bands** interpolated from surface to floor, quantised in the
fragment shader.

### Player colours

| Player | Value |
|---|---|
| P1 | `#1FB6C9` teal |
| P2 | `#E8468C` magenta |
| P3 | `#A8D219` lime |
| P4 | `#F2EDE4` bone |

Deliberately outside the earth range so a player is never camouflaged against
ground, sky or scorch. Confirmed readable at game framing on the composition
reference.

**Every character sprite needs a heavy dark outline.** This is load-bearing, not
decoration: players stand on the crust, which is the brightest thing on screen,
and the bone player would otherwise vanish into it.

## Terrain rendering

The mask is 1-bit. All of the look comes from the shader.

- **Strata** are `f(worldY)` — free.
- **Crust is an edge-distance function, not a depth function.** In every
  reference the cream band hugs crater walls, not just the top surface. That
  means "am I within N cells of empty space", implemented as a ring of mask taps
  (~16), with a per-dirty-rect distance field as the fallback if it ever costs
  too much. Crust thickness ~4 cells.
- A crust band that runs straight across open air at the original ground level
  is the artifact you get from the cheap `f(worldY)` version. It is wrong.

### What the terrain cannot do

`settle()` compacts each column against the floor, so **overhangs and caves
cannot persist**. Every column is empty above its surface and solid below it.
References showing undercut crater lips are unbuildable as drawn.

Two exceptions worth knowing:

- Overhangs exist *transiently*. An auger tunnel is open for its 60 ticks of
  flight and collapses at end of turn. That moment is real and worth rendering.
- The shader may add a small lip flourish where the surface gradient is steep,
  faking the look without the sim carrying the structure.

## Camera

The composition reference frames roughly **170 cells of arena width** — about a
sixth of a 1024-cell arena. Player-to-crater proportions in the reference match
`rules.json` closely (0.40 in the reference against 0.35 in the sim), so the
sim's scale is right; it is the camera that has to move.

Consequence: **both players cannot be framed at once at that zoom.** They start
300+ cells apart. The camera pans and zooms, which `tuning.json` already
anticipates via `zoomMin`, `zoomMax`, `followLag` and `lookaheadSeconds`.

Characters therefore need to read at two sizes: ~80px zoomed to a shot, ~14px
pulled back. Gear detail works at the former and disappears at the latter. The
outline carries the small case. Do not invest in character detail beyond what
survives at 80px.

## Projectiles

Five fireable weapons, five deliberately distinct silhouettes so an incoming
shot is identifiable in flight: pointed shell, banded cylinder, drill, sphere,
lumpy clod.

Drawn horizontal, pointing right, so the renderer applies `atan2(vy, vx)` with
no offset. Warm metal and earth tones only — **never a player colour**, or a
projectile becomes ambiguous with the player it is flying toward.

### Trail

**Dotted, one dot per fixed number of sim ticks** — not per fixed distance.
Spacing then encodes velocity for free: dots spread apart when the shell is
fast, bunch at apex. Cheapest of the three options to draw, and the tapering
alternative throws that information away.

## VFX

Two visual languages that must never be confused with each other.

**Blast** (shell, cluster, auger, roller): 8 frames. Sharp flash, fireball
grows, debris ring expands past it, fire collapses to a black scorch core,
smoke and debris outlive both. Fireball is a few scaled sprites on a curve;
debris is particles with their own gravity. Prefer the black scorch core over a
brown one — it reads as a mark left behind.

**Sod** (dirt family): 8 frames, soil tones only, no yellow, no red. Clod
squashes, bursts with a dust puff at the base, chunks fly, chunks rain down, a
mound builds and settles.

The sod sequence has a property the blast one does not: **frames 4 to 8 are the
terrain mask updating, not an animation.** The mound growing *is* `fill()`
followed by `settle()`. So the effect splits across two systems — particles
handle the flying chunks, the terrain layer handles the mound — and the second
half needs no art at all.

Debris uses a 24-chunk size ramp in soil tones. Interior facet detail only
matters at the large end; the small chunks are silhouettes.

## HUD

Flat military-manual register. Monospace, boxed panels, hairline rules, no
gloss, no bevels, no rounded corners.

ASCII-style health bars — `P1: [####■■■■----] (64%)` — are the house style. They
are text, so they cost nothing to render and scale perfectly.

**Power is 0–1000, not a percentage.** Appendix A.2 fixes this: 1991 Mode offers
"numeric angle and power entry (degrees, 0 to 1000)". Any reference showing
`POWER: 68%` is wrong.

**Wind carries no unit.** The sim's wind is a lateral acceleration, not a
velocity. Print the signed number and an arrow; do not print `m/s`.

Weapon buttons use the real names: `SHELL`, `CLUSTER`, `AUGER`, `ROLLER`, `SOD`.

### Readouts the sim can actually feed

Anything not on this list does not exist and must not appear in the HUD.
Ammunition counts, magazines, range finders, battery levels and ground/air
toggles have all appeared in reference material. None of them are real, and art
that invents a mechanic eventually gets it built.

| Readout | Source |
|---|---|
| Health per player, 0–100 | `players[].health` |
| Alive / eliminated | `players[].alive` |
| Wind, signed | `state.wind` |
| Turn N of 30 | `turnIndex` / `rules.turnLimit` |
| Active player | `activePlayer` |
| Angle, power, weapon | `lastAngleDeg`, `lastPower`, `lastWeapon` |
| Weapon list | 5 fireable entries |

## Round summary card

Declassified-document conceit: buff paper, paperclip, angled red rubber stamp,
monospace body. Portrait, screenshot-friendly, no sound sting.

Required content: the headline, the stamp where one exists, a boxed panel of
match data (weapon, cause of death, damage, turns), and **the match seed in
small type** — B.4 requires it so a shared card is a replay someone else can
load.

Stamp copy is voice work and is decided by a human, not inferred. `SOD OFF` is
the only stamp written; every other rule in `classifier.json` carries
`stamp: null` deliberately, and a test asserts that so placeholder copy cannot
ship by accident.

## Open

- Whether headlines other than Burials get stamps at all.
- Whether aim is pull-back (slingshot, Bowmasters style) or point-at. Changes
  the input mapping in M2.
- Whether to show a trajectory preview. Neither Scorched Earth nor Bowmasters
  has one; adding it is an aim-assist decision, not a UI decision. Currently
  specified as: no preview.

# Milestone ladder

Reference only. The active milestone is the one you were asked for. Do not
build ahead. The common failure mode with agent-built games is asking for the
whole game at once and getting a plausible-looking pile that cannot be
refactored — this ladder exists to prevent that.

**M0 — Headless sim.** Terrain, projectiles, damage, turn state, weapon schema,
match log, state hashing, replay harness, balance runner. No renderer.

**M1 — Renderer.** PixiJS. Terrain drawn from the mask as a texture with
dirty-rect updates, projectile sprite, trajectory trail, minimal HUD. Ugly is
fine. Correct and 60fps is not optional. Sim untouched.

**M2 — Input and hotseat.** Touch aim (drag to set angle and power, Bowmasters
style), 2 to 4 players passing one device. This is the first playable build.
Put it on your iPad the day it exists.

**M3 — Dev tuning overlay.** Live sliders bound to `tuning.json`, plus an export
button that writes the current values back to disk. Build this **before** any
juice work, so the juice can be tuned rather than guessed.

**M4 — Juice.** Screen shake with a decay curve, hit-stop on impact, slow-mo on a
killing blow, particles, debris, camera lookahead and settle. Every parameter
routed through the overlay. Expect to spend more time here than you think.

**M4.5 — Round summary cards.** The title-completion system. Requires the match
log from M0 and nothing from the renderer beyond text layout, so it can land
early and cheaply. See Appendix B. Build this before the content pass, because
it changes what data the sim needs to record and you want that settled before
twenty weapons exist.

**M5 — Ragdolls.** Verlet points plus distance constraints, roughly 8 points per
character. Runs in `render`, not `sim`, because death animation must not affect
game state. Deterministic anyway so replays look identical.

**M6 — AI opponent.** Sample the angle-power space against the headless sim,
score outcomes, pick the best, then inject gaussian error scaled by difficulty.
Difficulty is one number: the standard deviation of that error. Validate against
the balance runner rather than by feel.

**M7 — Content pass.** Twenty-plus weapons, characters, arenas. Pure data work.
Run the balance runner after every batch. See Appendix A, which changes the sim
requirements in Milestone 0 and should be read before you start.

**M8 — Capacitor and device.** iOS wrapper, safe-area insets, audio unlock on
first user gesture, haptics, app lifecycle pause and resume.

**M9 — Shell.** Menus, progression, settings, localization scaffold.

Online multiplayer is deliberately absent. It is turn-based, so it is
lockstep-simple and the determinism work above already pays for it, but lobbies,
matchmaking, reconnection, and disconnect handling are a project of their own.
Revisit only after M9 ships.

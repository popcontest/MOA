import { PHASE_RESOLVING, STEP_SECONDS, step, type MatchState } from '@moa/sim';

/**
 * The fixed-timestep boundary.
 *
 * The sim only ever advances in 1/120s increments. Feel effects — hit-stop in
 * M4, slow-mo on a killing blow — scale `timeScale`, which changes how many
 * steps a frame consumes, never the size of a step. That is what lets the
 * juice pass be tuned freely without any of it reaching a replay hash.
 *
 * Never pass a frame delta into sim code. If you find yourself wanting to,
 * the answer is a different timeScale.
 */

export type StepHooks = {
  beforeStep(s: MatchState): void;
  afterStep(s: MatchState): void;
  /** Return false to stop advancing (e.g. no further inputs to feed). */
  onTurnBoundary(s: MatchState): boolean;
};

export type Stepper = {
  /** Advance by wall-clock seconds. Returns the interpolation alpha for drawing. */
  advance(frameSeconds: number, timeScale: number): number;
  /** Advance exactly n sim ticks, ignoring wall clock. Used for deterministic capture. */
  advanceTicks(n: number): void;
  readonly ticksThisFrame: number;
};

/** A stall must not fast-forward hundreds of steps when the tab wakes up. */
const MAX_FRAME_SECONDS = 0.25;

export function createStepper(s: MatchState, hooks: StepHooks): Stepper {
  let accumulator = 0;
  let ticks = 0;

  // A function call, not an inline comparison: onTurnBoundary submits the
  // next input and flips the phase, which narrowing cannot see.
  const resolving = (st: MatchState): boolean => st.phase === PHASE_RESOLVING;

  function one(): boolean {
    if (!resolving(s)) {
      if (!hooks.onTurnBoundary(s)) return false;
      if (!resolving(s)) return false;
    }
    hooks.beforeStep(s);
    step(s);
    hooks.afterStep(s);
    return true;
  }

  return {
    get ticksThisFrame() {
      return ticks;
    },
    advance(frameSeconds, timeScale) {
      accumulator += Math.min(frameSeconds, MAX_FRAME_SECONDS) * timeScale;
      ticks = 0;
      while (accumulator >= STEP_SECONDS) {
        accumulator -= STEP_SECONDS;
        ticks++;
        if (!one()) {
          accumulator = 0;
          break;
        }
      }
      return accumulator / STEP_SECONDS;
    },
    advanceTicks(n) {
      ticks = 0;
      for (let i = 0; i < n; i++) {
        ticks++;
        if (!one()) break;
      }
      accumulator = 0;
    },
  };
}

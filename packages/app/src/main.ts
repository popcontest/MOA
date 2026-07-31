import { Application } from 'pixi.js';
import {
  PHASE_RESOLVING,
  createMatch,
  hashState,
  isAwaitingInput,
  isOver,
  submitInput,
  type MatchState,
  type TurnInput,
} from '@moa/sim';
import { createGameView, createStepper, loadTuning, arenaPaletteOrDefault, rgbToHexInt } from '@moa/render';
import { createHud } from '@moa/ui';
import { tuning as tuningJson } from '@moa/content/tuning';
import { FIXTURES, arenaByIdOrThrow, makeConfig, weaponIndex, type Fixture } from '@moa/replay';

/**
 * M1's driver is the replay fixtures, not a human. Touch input lands in M2, and
 * validating the renderer against inputs whose outcomes are already asserted is
 * cheaper than validating it against a thumb.
 */

type Mode = { fixture: Fixture; seekTicks: number; autoplay: boolean };

function readMode(): Mode {
  const q = new URLSearchParams(globalThis.location.search);
  const name = q.get('fixture') ?? 'roller-long-walk';
  const fixture = FIXTURES.find((f) => f.name === name);
  if (fixture === undefined) throw new Error(`unknown fixture "${name}"`);
  const seek = q.get('seek');
  return {
    fixture,
    seekTicks: seek === null ? 0 : Number.parseInt(seek, 10),
    autoplay: seek === null,
  };
}

function expandInputs(f: Fixture): TurnInput[] {
  const out: TurnInput[] = [];
  for (const i of f.inputs) {
    const n = i.repeat === undefined ? 1 : i.repeat;
    for (let k = 0; k < n; k++) {
      out.push({ angleDeg: i.angleDeg, power: i.power, weapon: weaponIndex(i.weapon) });
    }
  }
  return out;
}

async function main(): Promise<void> {
  const mode = readMode();
  const tuning = loadTuning(tuningJson);
  const arenaId = mode.fixture.arena;
  const arena = arenaByIdOrThrow(arenaId);
  const palette = arenaPaletteOrDefault(tuning, arenaId);

  const app = new Application();
  await app.init({
    background: rgbToHexInt(palette.skyTop),
    resizeTo: globalThis.window,
    antialias: true,
    // WebGPU on iOS Safari is still uneven, and a custom shader would
    // otherwise need writing twice.
    preference: 'webgl',
    preferWebGLVersion: 2,
    resolution: globalThis.devicePixelRatio || 1,
    autoDensity: true,
  });
  document.body.appendChild(app.canvas);

  const state: MatchState = createMatch(mode.fixture.seed, makeConfig(arenaId, mode.fixture.playerCount));
  const inputs = expandInputs(mode.fixture);
  let nextInput = 0;

  const w = () => app.renderer.width / app.renderer.resolution;
  const h = () => app.renderer.height / app.renderer.resolution;

  const view = createGameView(state, tuning, palette, arena, w(), h(),
    new URLSearchParams(globalThis.location.search).get('debug') === 'mask');
  const hud = createHud(
    { ink: rgbToHexInt(tuning.palette.hudInk), panel: rgbToHexInt(tuning.palette.hudPanel) },
    w(),
    h(),
  );
  app.stage.addChild(view.stage, hud.stage);

  const stepper = createStepper(state, {
    beforeStep: (s) => view.beforeStep(s),
    afterStep: (s) => view.afterStep(s, app.renderer),
    onTurnBoundary: (s) => {
      if (isOver(s) || !isAwaitingInput(s)) return false;
      const input = inputs[nextInput];
      if (input === undefined) return false;
      nextInput++;
      view.clearTrail();
      submitInput(s, input);
      return true;
    },
  });

  app.renderer.on('resize', () => {
    view.resize(w(), h());
    hud.resize(w(), h());
  });

  let fps = 0;
  const draw = (alpha: number, dt: number, snap = false): void => {
    view.draw(state, app.renderer, alpha, dt, snap);
    hud.update(state, fps, isOver(state) ? hashState(state) : '');
  };

  if (!mode.autoplay) {
    // Deterministic capture: advance exactly N ticks with no wall clock
    // involved, draw one frame, then signal. Screenshots of the same tick are
    // identical runs, which is the entire point of the sim being deterministic.
    if (state.phase !== PHASE_RESOLVING && inputs.length > 0) {
      const first = inputs[0];
      if (first !== undefined) {
        nextInput = 1;
        submitInput(state, first);
      }
    }
    stepper.advanceTicks(mode.seekTicks);
    draw(0, 0, true);
    app.renderer.render(app.stage);
    Object.assign(globalThis, { __MOA_READY__: true, __MOA_TICK__: state.tick });
    return;
  }

  let last = performance.now();
  app.ticker.add(() => {
    const now = performance.now();
    const dt = (now - last) / 1000;
    last = now;
    fps = fps * 0.9 + (1 / Math.max(dt, 0.0001)) * 0.1;
    // timeScale is 1 until M4 adds hit-stop and slow-mo. It scales how many
    // fixed steps a frame consumes, never the step size.
    const alpha = stepper.advance(dt, 1);
    draw(alpha, dt);
  });
  Object.assign(globalThis, { __MOA_READY__: true });
}

void main().catch((err: unknown) => {
  const pre = document.createElement('pre');
  pre.style.cssText = 'color:#f66;font:14px monospace;padding:16px;white-space:pre-wrap';
  pre.textContent = `MOA boot failed:\n${String(err instanceof Error ? err.stack : err)}`;
  document.body.appendChild(pre);
  Object.assign(globalThis, { __MOA_READY__: true, __MOA_ERROR__: String(err) });
});

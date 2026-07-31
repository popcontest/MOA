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

type Session = { destroy(): void };
let current: Session | null = null;

function fixtureByName(name: string): Fixture {
  const f = FIXTURES.find((x) => x.name === name);
  if (f === undefined) throw new Error(`unknown fixture "${name}"`);
  return f;
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

async function run(fixture: Fixture, seekTicks: number | null, debugMask: boolean): Promise<Session> {
  const tuning = loadTuning(tuningJson);
  const arenaId = fixture.arena;
  const arena = arenaByIdOrThrow(arenaId);
  const palette = arenaPaletteOrDefault(tuning, arenaId);

  const host = document.getElementById('stage') ?? document.body;
  const app = new Application();
  await app.init({
    background: rgbToHexInt(palette.skyTop),
    // Sized to its container, not the window: the shell puts a control strip
    // above the canvas and the two must not fight over the viewport.
    resizeTo: host,
    antialias: true,
    // WebGPU on iOS Safari is still uneven, and a custom shader would
    // otherwise need writing twice.
    preference: 'webgl',
    preferWebGLVersion: 2,
    resolution: globalThis.devicePixelRatio || 1,
    autoDensity: true,
  });
  host.appendChild(app.canvas);

  const state: MatchState = createMatch(fixture.seed, makeConfig(arenaId, fixture.playerCount));
  const inputs = expandInputs(fixture);
  let nextInput = 0;

  const w = () => app.renderer.width / app.renderer.resolution;
  const h = () => app.renderer.height / app.renderer.resolution;

  const view = createGameView(state, tuning, palette, arena, w(), h(), debugMask);
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

  if (seekTicks !== null) {
    // Deterministic capture: advance exactly N ticks with no wall clock
    // involved, draw one frame, then signal. Two screenshots of the same tick
    // are identical runs, which is the point of the sim being deterministic.
    if (state.phase !== PHASE_RESOLVING && inputs.length > 0) {
      const first = inputs[0];
      if (first !== undefined) {
        nextInput = 1;
        submitInput(state, first);
      }
    }
    stepper.advanceTicks(seekTicks);
    draw(0, 0, true);
    app.renderer.render(app.stage);
    Object.assign(globalThis, { __MOA_READY__: true, __MOA_TICK__: state.tick });
  } else {
    let last = performance.now();
    app.ticker.add(() => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      fps = fps * 0.9 + (1 / Math.max(dt, 0.0001)) * 0.1;
      // timeScale is 1 until M4 adds hit-stop and slow-mo. It scales how many
      // fixed steps a frame consumes, never the size of one.
      const alpha = stepper.advance(dt, 1);
      draw(alpha, dt);
    });
    Object.assign(globalThis, { __MOA_READY__: true });
  }

  return {
    destroy() {
      app.destroy(true, { children: true });
    },
  };
}

async function start(name: string): Promise<void> {
  const q = new URLSearchParams(globalThis.location.search);
  const seek = q.get('seek');
  if (current !== null) {
    current.destroy();
    current = null;
  }
  current = await run(fixtureByName(name), seek === null ? null : Number.parseInt(seek, 10), q.get('debug') === 'mask');
}

function boot(): void {
  const q = new URLSearchParams(globalThis.location.search);
  Object.assign(globalThis, {
    MOA: {
      fixtures: FIXTURES.map((f) => ({ name: f.name, note: f.note, hash: f.hash })),
      start: (name: string) => {
        void start(name).catch(fail);
      },
    },
  });
  void start(q.get('fixture') ?? 'roller-long-walk').catch(fail);
}

function fail(err: unknown): void {
  const pre = document.createElement('pre');
  pre.style.cssText = 'color:#f66;font:14px monospace;padding:16px;white-space:pre-wrap';
  pre.textContent = `MOA boot failed:\n${String(err instanceof Error ? err.stack : err)}`;
  document.body.appendChild(pre);
  Object.assign(globalThis, { __MOA_READY__: true, __MOA_ERROR__: String(err) });
}

boot();

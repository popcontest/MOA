import { describe, expect, it } from 'vitest';
import { hexToRgb, loadTuning, rgbToHexInt, arenaPaletteOrDefault } from '../src/palette';
import { createCamera, updateCamera } from '../src/camera';
import { createStepper } from '../src/frameLoop';
import {
  PHASE_AWAITING_INPUT,
  createMatch,
  hashState,
  loadRules,
  loadWeapons,
  submitInput,
  topAt,
  type MatchConfig,
} from '@moa/sim';
import tuningJson from '../../content/tuning.json';
import weaponsJson from '../../content/weapons.json';
import rulesJson from '../../content/rules.json';

/**
 * Everything here is the part of the renderer that has no GPU in it. The
 * shader and the texture upload are covered by the shotgun capture instead —
 * a screenshot is the only honest test of whether a fragment shader is right.
 */

const registry = loadWeapons(weaponsJson);
const rules = loadRules(rulesJson);

function config(): MatchConfig {
  return {
    playerCount: 2,
    arena: { width: 512, height: 256, roughness: 0.5, minGround: 110, maxGround: 190 },
    rules,
    registry,
    loadout: [registry.byId.get('shell.standard') ?? 0],
  };
}

describe('palette', () => {
  it('parses hex to normalised rgb', () => {
    expect(hexToRgb('#FFFFFF')).toEqual([1, 1, 1]);
    expect(hexToRgb('#000000')).toEqual([0, 0, 0]);
    const [r, g, b] = hexToRgb('#1FB6C9');
    expect(r).toBeCloseTo(0x1f / 255, 6);
    expect(g).toBeCloseTo(0xb6 / 255, 6);
    expect(b).toBeCloseTo(0xc9 / 255, 6);
  });

  it('round-trips through the Pixi integer form', () => {
    for (const hex of ['#1FB6C9', '#E8468C', '#A8D219', '#F2EDE4', '#FFBF00']) {
      expect(rgbToHexInt(hexToRgb(hex))).toBe(Number.parseInt(hex.slice(1), 16));
    }
  });

  it('rejects malformed hex rather than silently rendering black', () => {
    expect(() => hexToRgb('#D4ACID')).toThrow(/bad hex/);
    expect(() => hexToRgb('teal')).toThrow(/bad hex/);
  });

  it('loads the shipped tuning', () => {
    const t = loadTuning(tuningJson);
    expect(t.palette.players.length).toBe(4);
    expect([...t.palette.arenas.keys()]).toEqual(['broken', 'flats', 'rolling']);
    expect(t.terrain.crustCells).toBeGreaterThan(0);
    expect(t.trail.ticksPerDot).toBeGreaterThan(0);
  });

  it('gives every arena a palette, falling back rather than throwing', () => {
    const t = loadTuning(tuningJson);
    expect(arenaPaletteOrDefault(t, 'rolling').crust).toBeDefined();
    expect(arenaPaletteOrDefault(t, 'no-such-arena').crust).toBeDefined();
  });

  it('keeps player colours clear of the soil range', () => {
    // A player the colour of dirt is invisible; that is the whole reason the
    // player palette is specified separately from the arena palettes.
    const t = loadTuning(tuningJson);
    for (const arena of t.palette.arenas.values()) {
      for (const player of t.palette.players) {
        for (const soil of [arena.soilSurface, arena.soilDeep, arena.crust]) {
          const d =
            Math.abs(player[0] - soil[0]) + Math.abs(player[1] - soil[1]) + Math.abs(player[2] - soil[2]);
          expect(d).toBeGreaterThan(0.12);
        }
      }
    }
  });
});

describe('camera', () => {
  const style = {
    followLag: 0.12,
    lookaheadSeconds: 0.35,
    viewCells: 190,
    groundBias: 0.45,
    zoomMin: 0.55,
    zoomMax: 1.6,
  };

  it('scales so viewCells fill the width', () => {
    const s = createMatch(11, config());
    const cam = createCamera();
    updateCamera(cam, s, style, 1900, 1000, 0.016, true);
    expect(cam.scale).toBeCloseTo(10, 6);
  });

  it('keeps the ground in frame even when the focus is high above it', () => {
    const s = createMatch(11, config());
    const cam = createCamera();
    updateCamera(cam, s, style, 1280, 720, 0.016, true);

    const halfH = 720 / cam.scale / 2;
    const ground = topAt(s.terrain, Math.round(cam.x));
    expect(cam.y + halfH).toBeGreaterThan(ground);
  });

  it('never scrolls past the arena floor', () => {
    const s = createMatch(3, config());
    const cam = createCamera();
    for (let i = 0; i < 40; i++) updateCamera(cam, s, style, 1280, 720, 0.016);
    const halfH = 720 / cam.scale / 2;
    expect(cam.y + halfH).toBeLessThanOrEqual(s.terrain.height + 0.001);
  });

  it('eases toward the target rather than snapping', () => {
    const s = createMatch(11, config());
    const cam = createCamera();
    updateCamera(cam, s, style, 1280, 720, 0.016, true);
    cam.x -= 100;
    const before = cam.x;
    updateCamera(cam, s, style, 1280, 720, 0.016);
    expect(cam.x).toBeGreaterThan(before);
    expect(cam.x).toBeLessThan(cam.targetX);
  });
});

describe('fixed timestep', () => {
  function armed() {
    const s = createMatch(11, config());
    submitInput(s, { angleDeg: 45, power: 600, weapon: s.config.loadout[0] ?? 0 });
    return s;
  }

  it('consumes exactly one step per 1/120s of scaled wall clock', () => {
    const s = armed();
    let steps = 0;
    const stepper = createStepper(s, {
      beforeStep: () => {},
      afterStep: () => {
        steps++;
      },
      onTurnBoundary: () => false,
    });
    stepper.advance(1 / 60, 1);
    expect(steps).toBe(2);
    stepper.advance(1 / 60, 1);
    expect(steps).toBe(4);
  });

  it('scales step count by timeScale, never step size', () => {
    const s = armed();
    let steps = 0;
    const stepper = createStepper(s, {
      beforeStep: () => {},
      afterStep: () => {
        steps++;
      },
      onTurnBoundary: () => false,
    });
    // Slow-mo: same wall clock, quarter the steps. This is what keeps M4's
    // juice out of the replay hash.
    // 1/60s at quarter speed is 1/240s of sim time: not yet a whole step.
    stepper.advance(1 / 60, 0.25);
    expect(steps).toBe(0);
    // A further 3/60s adds 1/80s, taking the accumulator to exactly 2/120s.
    stepper.advance(3 / 60, 0.25);
    expect(steps).toBe(2);
  });

  it('hit-stop at timeScale zero advances nothing', () => {
    const s = armed();
    const before = s.tick;
    const stepper = createStepper(s, {
      beforeStep: () => {},
      afterStep: () => {},
      onTurnBoundary: () => false,
    });
    for (let i = 0; i < 10; i++) stepper.advance(1 / 60, 0);
    expect(s.tick).toBe(before);
  });

  it('clamps a long stall instead of fast-forwarding the match', () => {
    const s = armed();
    let steps = 0;
    const stepper = createStepper(s, {
      beforeStep: () => {},
      afterStep: () => {
        steps++;
      },
      onTurnBoundary: () => false,
    });
    stepper.advance(30, 1);
    expect(steps).toBeLessThanOrEqual(30);
  });

  it('produces the same hash as driving the sim directly', () => {
    const a = armed();
    const stepperA = createStepper(a, {
      beforeStep: () => {},
      afterStep: () => {},
      onTurnBoundary: () => false,
    });
    stepperA.advanceTicks(400);

    const b = armed();
    const stepperB = createStepper(b, {
      beforeStep: () => {},
      afterStep: () => {},
      onTurnBoundary: () => false,
    });
    // Same total ticks, arrived at through wildly different frame pacing.
    for (let i = 0; i < 400; i++) stepperB.advance(1 / 120, 1);

    expect(hashState(b)).toBe(hashState(a));
  });

  it('feeds the next input at a turn boundary', () => {
    const s = createMatch(11, config());
    expect(s.phase).toBe(PHASE_AWAITING_INPUT);
    let boundaries = 0;
    const stepper = createStepper(s, {
      beforeStep: () => {},
      afterStep: () => {},
      onTurnBoundary: (st) => {
        if (boundaries >= 2) return false;
        boundaries++;
        submitInput(st, { angleDeg: 135, power: 1000, weapon: st.config.loadout[0] ?? 0 });
        return true;
      },
    });
    stepper.advanceTicks(4000);
    expect(boundaries).toBe(2);
    expect(s.log.length).toBe(2);
  });
});

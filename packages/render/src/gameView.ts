import { Container, Graphics, type Renderer } from 'pixi.js';
import { MODE_ROLLING, type MatchState } from '@moa/sim';
import { createTerrainLayer, type TerrainLayer } from './terrainLayer';
import { applyCamera, createCamera, updateCamera, type Camera } from './camera';
import { rgbToHexInt, type ArenaPalette, type Tuning } from './palette';

/**
 * Reads sim state and draws it. Never writes to it — the sim is a pure
 * function of seed and inputs, and a renderer that could nudge a projectile
 * would make replays a fiction.
 */

type Snapshot = { x: number; y: number; active: boolean };
type TrailDot = { x: number; y: number };

export type GameView = {
  readonly stage: Container;
  /** Capture interpolation state. Call immediately before each sim step. */
  beforeStep(s: MatchState): void;
  afterStep(s: MatchState, renderer: Renderer): void;
  draw(s: MatchState, renderer: Renderer, alpha: number, dt: number, snapCamera?: boolean): void;
  resize(w: number, h: number): void;
  clearTrail(): void;
  destroy(): void;
};

export function createGameView(
  s: MatchState,
  tuning: Tuning,
  arenaPalette: ArenaPalette,
  arena: { readonly minGround: number; readonly maxGround: number },
  viewW: number,
  viewH: number,
  debugMask = false,
): GameView {
  const stage = new Container();
  const world = new Container();
  stage.addChild(world);

  const terrain: TerrainLayer = createTerrainLayer(s.terrain, arenaPalette, tuning.terrain, arena, debugMask);
  const trailG = new Graphics();
  const playersG = new Graphics();
  const projG = new Graphics();
  world.addChild(terrain.mesh, trailG, playersG, projG);

  const cam: Camera = createCamera();
  const n = s.projectiles.length;
  const prev: Snapshot[] = [];
  const cur: Snapshot[] = [];
  for (let i = 0; i < n; i++) {
    prev.push({ x: 0, y: 0, active: false });
    cur.push({ x: 0, y: 0, active: false });
  }
  let trail: TrailDot[] = [];
  let w = viewW;
  let h = viewH;
  let firstFrame = true;

  const playerInk = tuning.palette.players.map(rgbToHexInt);
  const outline = rgbToHexInt(tuning.palette.playerOutline);
  const projInk = rgbToHexInt(tuning.palette.projectile);
  const trailInk = rgbToHexInt(tuning.palette.trail);

  function capture(into: Snapshot[], state: MatchState): void {
    for (let i = 0; i < n; i++) {
      const p = state.projectiles[i];
      const slot = into[i];
      if (p === undefined || slot === undefined) continue;
      slot.x = p.x;
      slot.y = p.y;
      slot.active = p.active;
    }
  }

  function drawPlayers(state: MatchState): void {
    const { playerRadius, playerHeight } = state.config.rules;
    playersG.clear();
    for (const p of state.players) {
      if (!p.alive) continue;
      const ink = playerInk[p.id % playerInk.length] ?? 0xffffff;
      const bodyH = playerHeight - 2;
      // The outline is load-bearing: players stand on the crust, which is the
      // brightest thing on screen, and the bone player would vanish into it.
      playersG
        .roundRect(p.x - playerRadius - 1, p.y - bodyH - 1, playerRadius * 2 + 2, bodyH + 2, 2)
        .fill({ color: outline })
        .roundRect(p.x - playerRadius, p.y - bodyH, playerRadius * 2, bodyH, 1.5)
        .fill({ color: ink })
        .circle(p.x, p.y - playerHeight + 0.5, playerRadius - 0.2)
        .fill({ color: outline })
        .circle(p.x, p.y - playerHeight + 0.5, playerRadius - 1.2)
        .fill({ color: ink });
    }
  }

  function drawProjectiles(state: MatchState, alpha: number): void {
    projG.clear();
    for (let i = 0; i < n; i++) {
      const p = state.projectiles[i];
      const a = prev[i];
      const b = cur[i];
      if (p === undefined || a === undefined || b === undefined || !b.active) continue;

      const x = a.active ? a.x + (b.x - a.x) * alpha : b.x;
      const y = a.active ? a.y + (b.y - a.y) * alpha : b.y;
      const r = p.mode === MODE_ROLLING ? 3.2 : 2.6;

      projG.circle(x, y, r + 0.9).fill({ color: outline }).circle(x, y, r).fill({ color: projInk });
    }
  }

  function drawTrail(): void {
    trailG.clear();
    if (trail.length === 0) return;
    const radius = tuning.trail.dotRadiusPx / Math.max(0.0001, cam.scale);
    for (let i = 0; i < trail.length; i++) {
      const d = trail[i];
      if (d === undefined) continue;
      // Older dots fade, so the head of the trail reads as the live shell.
      const t = (i + 1) / trail.length;
      trailG.circle(d.x, d.y, radius * (0.45 + 0.55 * t)).fill({ color: trailInk, alpha: 0.25 + 0.6 * t });
    }
  }

  return {
    stage,
    clearTrail() {
      trail = [];
    },
    beforeStep(state) {
      capture(prev, state);
    },
    afterStep(state, renderer) {
      capture(cur, state);
      terrain.sync(renderer, state);

      // One dot every N ticks, not every N cells — the spacing then encodes
      // velocity for free: dots spread apart when the shell is fast.
      if (state.tick % Math.max(1, Math.round(tuning.trail.ticksPerDot)) === 0) {
        for (const p of state.projectiles) {
          if (!p.active) continue;
          trail.push({ x: p.x, y: p.y });
        }
        const max = Math.max(8, Math.round(tuning.trail.maxDots));
        if (trail.length > max) trail = trail.slice(trail.length - max);
      }
    },
    draw(state, renderer, alpha, dt, snapCamera = false) {
      updateCamera(cam, state, tuning.camera, w, h, dt, snapCamera || firstFrame);
      applyCamera(cam, world, w, h);
      if (firstFrame) {
        terrain.sync(renderer, state);
        firstFrame = false;
      }
      drawTrail();
      drawPlayers(state);
      drawProjectiles(state, alpha);
    },
    resize(nw, nh) {
      w = nw;
      h = nh;
    },
    destroy() {
      terrain.destroy();
      stage.destroy({ children: true });
    },
  };
}

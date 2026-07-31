import { topAt, type MatchState } from '@moa/sim';
import type { CameraStyle } from './palette';

/**
 * World units are cells. The camera is a transform on the world container, so
 * nothing downstream has to know about zoom.
 *
 * The reference art frames roughly 190 cells of arena, which is about a sixth
 * of a 1024-cell arena — so both players cannot be on screen at once at that
 * zoom, and the camera has to follow. It tracks the live projectile when there
 * is one and the active player otherwise.
 */

export type Camera = {
  x: number;
  y: number;
  scale: number;
  targetX: number;
  targetY: number;
};

export function createCamera(): Camera {
  return { x: 0, y: 0, scale: 1, targetX: 0, targetY: 0 };
}

function focusOf(s: MatchState, lookaheadSeconds: number): { x: number; y: number } {
  for (const p of s.projectiles) {
    if (!p.active) continue;
    // Lead the shot slightly so a fast shell is not pinned to the screen edge.
    return { x: p.x + p.vx * lookaheadSeconds, y: p.y + p.vy * lookaheadSeconds };
  }
  const active = s.players[s.activePlayer];
  if (active !== undefined && active.alive) return { x: active.x, y: active.y - 20 };
  for (const p of s.players) if (p.alive) return { x: p.x, y: p.y - 20 };
  return { x: s.terrain.width / 2, y: s.terrain.height / 2 };
}

export function updateCamera(
  cam: Camera,
  s: MatchState,
  style: CameraStyle,
  viewW: number,
  viewH: number,
  dt: number,
  snap = false,
): void {
  cam.scale = viewW / style.viewCells;

  const halfW = viewW / cam.scale / 2;
  const halfH = viewH / cam.scale / 2;
  const f = focusOf(s, style.lookaheadSeconds);

  // Clamp horizontally to the arena; let the view sit above the arena top so a
  // high lob stays visible, but never show below the floor.
  const minX = Math.min(halfW, s.terrain.width / 2);
  const maxX = Math.max(s.terrain.width - halfW, s.terrain.width / 2);
  cam.targetX = Math.max(minX, Math.min(maxX, f.x));

  // Keep the ground in frame. Following a lob straight up looks like tracking
  // a dot across an empty sky, and you lose all sense of where the shot is
  // going relative to the terrain it has to clear.
  const col = Math.max(0, Math.min(s.terrain.width - 1, Math.round(cam.targetX)));
  const groundY = topAt(s.terrain, col);
  // Ground sits roughly three quarters down the frame. Following a lob
  // straight up otherwise looks like tracking a dot across an empty sky, with
  // no sense of what the shot has to clear.
  const highest = groundY - halfH * style.groundBias;
  cam.targetY = Math.min(s.terrain.height - halfH, Math.max(highest, f.y));

  if (snap) {
    cam.x = cam.targetX;
    cam.y = cam.targetY;
    return;
  }
  // Exponential approach, framerate independent.
  const k = 1 - Math.exp(-dt / Math.max(0.0001, style.followLag));
  cam.x += (cam.targetX - cam.x) * k;
  cam.y += (cam.targetY - cam.y) * k;
}

export function applyCamera(
  cam: Camera,
  container: { position: { set(x: number, y: number): void }; scale: { set(v: number): void } },
  viewW: number,
  viewH: number,
): void {
  container.scale.set(cam.scale);
  container.position.set(viewW / 2 - cam.x * cam.scale, viewH / 2 - cam.y * cam.scale);
}

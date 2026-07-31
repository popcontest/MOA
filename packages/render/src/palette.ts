/**
 * Colour comes from tuning.json, which is presentation-only. Nothing in this
 * file may be read by packages/sim: a value that reached the simulation would
 * make every replay hash in the project depend on a colour picker.
 */

export type Rgb = readonly [number, number, number];

export type ArenaPalette = {
  readonly skyTop: Rgb;
  readonly skyHorizon: Rgb;
  readonly crust: Rgb;
  readonly soilSurface: Rgb;
  readonly soilDeep: Rgb;
  readonly soilFloor: Rgb;
};

export type Palette = {
  readonly arenas: ReadonlyMap<string, ArenaPalette>;
  readonly players: readonly Rgb[];
  readonly playerOutline: Rgb;
  readonly projectile: Rgb;
  readonly projectileOutline: Rgb;
  readonly trail: Rgb;
  readonly hudInk: Rgb;
  readonly hudPanel: Rgb;
};

export type TerrainStyle = { readonly crustCells: number; readonly strataBands: number };
export type TrailStyle = {
  readonly ticksPerDot: number;
  readonly maxDots: number;
  readonly dotRadiusPx: number;
};
export type CameraStyle = {
  readonly followLag: number;
  readonly lookaheadSeconds: number;
  readonly viewCells: number;
  readonly groundBias: number;
  readonly zoomMin: number;
  readonly zoomMax: number;
};

export type Tuning = {
  readonly palette: Palette;
  readonly terrain: TerrainStyle;
  readonly trail: TrailStyle;
  readonly camera: CameraStyle;
};

export function hexToRgb(hex: string): Rgb {
  const m = /^#([0-9A-Fa-f]{6})$/.exec(hex);
  if (m === null || m[1] === undefined) throw new Error(`tuning.json: bad hex "${hex}"`);
  const v = Number.parseInt(m[1], 16);
  return [((v >> 16) & 0xff) / 255, ((v >> 8) & 0xff) / 255, (v & 0xff) / 255];
}

/** Pixi wants 0xRRGGBB integers for tints and text fills. */
export function rgbToHexInt(c: Rgb): number {
  const q = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));
  return (q(c[0]) << 16) | (q(c[1]) << 8) | q(c[2]);
}

function record(v: unknown, where: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    throw new Error(`tuning.json: ${where} must be an object`);
  }
  return v as Record<string, unknown>;
}

function hexField(o: Record<string, unknown>, key: string, where: string): Rgb {
  const v = o[key];
  if (typeof v !== 'string') throw new Error(`tuning.json: ${where}.${key} must be a hex string`);
  return hexToRgb(v);
}

function numField(o: Record<string, unknown>, key: string, dflt: number): number {
  const v = o[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : dflt;
}

function arenaPalette(v: unknown, where: string): ArenaPalette {
  const o = record(v, where);
  return {
    skyTop: hexField(o, 'skyTop', where),
    skyHorizon: hexField(o, 'skyHorizon', where),
    crust: hexField(o, 'crust', where),
    soilSurface: hexField(o, 'soilSurface', where),
    soilDeep: hexField(o, 'soilDeep', where),
    soilFloor: hexField(o, 'soilFloor', where),
  };
}

export function loadTuning(json: unknown): Tuning {
  const root = record(json, 'root');
  const pal = record(root['palette'], 'palette');
  const arenasRaw = record(pal['arenas'], 'palette.arenas');

  const arenas = new Map<string, ArenaPalette>();
  // Sorted so arena ordering never depends on JSON key order.
  for (const id of Object.keys(arenasRaw).sort()) {
    arenas.set(id, arenaPalette(arenasRaw[id], `palette.arenas.${id}`));
  }

  const playersRaw = pal['players'];
  if (!Array.isArray(playersRaw) || playersRaw.length < 4) {
    throw new Error('tuning.json: palette.players needs four colours');
  }
  const players = playersRaw.map((h, i) => {
    if (typeof h !== 'string') throw new Error(`tuning.json: palette.players[${i}] must be a hex string`);
    return hexToRgb(h);
  });

  const terrain = record(root['terrain'], 'terrain');
  const trail = record(root['trailStyle'], 'trailStyle');
  const cam = record(root['camera'], 'camera');

  return {
    palette: {
      arenas,
      players,
      playerOutline: hexField(pal, 'playerOutline', 'palette'),
      projectile: hexField(pal, 'projectile', 'palette'),
      projectileOutline: hexField(pal, 'projectileOutline', 'palette'),
      trail: hexField(pal, 'trail', 'palette'),
      hudInk: hexField(pal, 'hudInk', 'palette'),
      hudPanel: hexField(pal, 'hudPanel', 'palette'),
    },
    terrain: {
      crustCells: numField(terrain, 'crustCells', 4),
      strataBands: numField(terrain, 'strataBands', 8),
    },
    trail: {
      ticksPerDot: numField(trail, 'ticksPerDot', 5),
      maxDots: numField(trail, 'maxDots', 96),
      dotRadiusPx: numField(trail, 'dotRadiusPx', 2.5),
    },
    camera: {
      followLag: numField(cam, 'followLag', 0.12),
      lookaheadSeconds: numField(cam, 'lookaheadSeconds', 0.35),
      viewCells: numField(cam, 'viewCells', 190),
      groundBias: numField(cam, 'groundBias', 0.45),
      zoomMin: numField(cam, 'zoomMin', 0.55),
      zoomMax: numField(cam, 'zoomMax', 1.6),
    },
  };
}

export function arenaPaletteOrDefault(t: Tuning, arenaId: string): ArenaPalette {
  const p = t.palette.arenas.get(arenaId);
  if (p !== undefined) return p;
  const first = [...t.palette.arenas.values()][0];
  if (first === undefined) throw new Error('tuning.json: no arena palettes defined');
  return first;
}

import type { ArenaParams, Rules } from './types';

function need(o: Record<string, unknown>, key: string, where: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`${where}: ${key} must be a finite number`);
  }
  return v;
}

function asRecord(v: unknown, where: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    throw new Error(`${where}: expected an object`);
  }
  return v as Record<string, unknown>;
}

/**
 * These are sim constants, not feel values, so they live here and go into the
 * hash. Changing one is a balance change that rebaselines fixtures on purpose,
 * with the reason stated in the commit message. tuning.json is the other file
 * and packages/sim has no import path to it.
 */
export function loadRules(json: unknown): Rules {
  const o = asRecord(json, 'rules.json');
  return {
    maxHealth: need(o, 'maxHealth', 'rules.json'),
    gravity: need(o, 'gravity', 'rules.json'),
    windMax: need(o, 'windMax', 'rules.json'),
    powerScale: need(o, 'powerScale', 'rules.json'),
    turnLimit: need(o, 'turnLimit', 'rules.json'),
    playerRadius: need(o, 'playerRadius', 'rules.json'),
    playerHeight: need(o, 'playerHeight', 'rules.json'),
    muzzleOffset: need(o, 'muzzleOffset', 'rules.json'),
    fallDamageThreshold: need(o, 'fallDamageThreshold', 'rules.json'),
    fallDamagePerCell: need(o, 'fallDamagePerCell', 'rules.json'),
    crushDamagePerTurn: need(o, 'crushDamagePerTurn', 'rules.json'),
    maxGeneration: need(o, 'maxGeneration', 'rules.json'),
    maxProjectiles: need(o, 'maxProjectiles', 'rules.json'),
    rollMaxClimb: need(o, 'rollMaxClimb', 'rules.json'),
    missDistance: need(o, 'missDistance', 'rules.json'),
  };
}

export function loadArenas(json: unknown): Map<string, ArenaParams> {
  const root = asRecord(json, 'arenas.json');
  const list = root['arenas'];
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error('arenas.json: arenas must be a non-empty array');
  }
  const out = new Map<string, ArenaParams>();
  for (let i = 0; i < list.length; i++) {
    const where = `arenas.json: arenas[${i}]`;
    const o = asRecord(list[i], where);
    const id = o['id'];
    if (typeof id !== 'string' || id.length === 0) throw new Error(`${where}: id must be a non-empty string`);
    out.set(id, {
      width: need(o, 'width', where),
      height: need(o, 'height', where),
      roughness: need(o, 'roughness', where),
      minGround: need(o, 'minGround', where),
      maxGround: need(o, 'maxGround', where),
    });
  }
  return out;
}

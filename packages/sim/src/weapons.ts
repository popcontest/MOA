import {
  MODE_BURROWING,
  MODE_ROLLING,
  TRIGGER_IDS,
  TRIGGER_INDEX,
  type Effect,
  type Mode,
  type TriggerId,
  type Weapon,
  type WeaponRegistry,
} from './types';
import { degreesToUnits } from './trig';

/**
 * Content validation lives here rather than in a schema library because
 * packages/sim ships zero runtime dependencies. The JSON Schema alongside
 * weapons.json is still authoritative and is checked against the content by
 * ajv in the test suite; this is the load-time guard that ships.
 */

function fail(where: string, msg: string): never {
  throw new Error(`weapons.json: ${where}: ${msg}`);
}

function asRecord(v: unknown, where: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) fail(where, 'expected an object');
  return v as Record<string, unknown>;
}

function asArray(v: unknown, where: string): unknown[] {
  if (!Array.isArray(v)) fail(where, 'expected an array');
  return v;
}

function num(o: Record<string, unknown>, key: string, where: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(where, `${key} must be a finite number`);
  return v;
}

function numOr(o: Record<string, unknown>, key: string, where: string, dflt: number): number {
  return o[key] === undefined ? dflt : num(o, key, where);
}

function str(o: Record<string, unknown>, key: string, where: string): string {
  const v = o[key];
  if (typeof v !== 'string' || v.length === 0) fail(where, `${key} must be a non-empty string`);
  return v;
}

function bool(o: Record<string, unknown>, key: string, where: string, dflt: boolean): boolean {
  const v = o[key];
  if (v === undefined) return dflt;
  if (typeof v !== 'boolean') fail(where, `${key} must be a boolean`);
  return v;
}

function strList(o: Record<string, unknown>, key: string, where: string): string[] {
  const v = o[key];
  if (v === undefined) return [];
  const arr = asArray(v, `${where}.${key}`);
  return arr.map((e, i) => {
    if (typeof e !== 'string') fail(`${where}.${key}[${i}]`, 'expected a string');
    return e;
  });
}

type RawWeapon = {
  id: string;
  name: string;
  family: string;
  fireable: boolean;
  speedScale: number;
  gravityScale: number;
  windScale: number;
  fuse: number;
  /** Effect names sorted lexicographically; index in this array is the effect index. */
  effectNames: string[];
  effectBodies: Record<string, unknown>[];
  triggers: { on: TriggerId; effects: string[] }[];
};

function readWeapon(raw: unknown, at: number): RawWeapon {
  const where = `weapons[${at}]`;
  const o = asRecord(raw, where);
  const id = str(o, 'id', where);
  const spawn = asRecord(o['spawn'] ?? {}, `${where}.spawn`);

  const effectsObj = asRecord(o['effects'], `${where}.effects`);
  // Sorted, so the index a weapon's effect gets never depends on JSON key order.
  const effectNames = Object.keys(effectsObj).sort();
  if (effectNames.length === 0) fail(`${where}.effects`, 'a weapon needs at least one effect');
  const effectBodies = effectNames.map((n) =>
    asRecord(effectsObj[n], `${where}.effects.${n}`),
  );

  const triggerArr = asArray(o['triggers'], `${where}.triggers`);
  if (triggerArr.length === 0) fail(`${where}.triggers`, 'a weapon needs at least one trigger');
  const seen = new Set<string>();
  const triggers = triggerArr.map((t, i) => {
    const tw = `${where}.triggers[${i}]`;
    const to = asRecord(t, tw);
    const on = str(to, 'on', tw);
    if (!(TRIGGER_IDS as readonly string[]).includes(on)) {
      fail(tw, `unknown trigger "${on}"; expected one of ${TRIGGER_IDS.join(', ')}`);
    }
    if (seen.has(on)) fail(tw, `duplicate trigger "${on}"`);
    seen.add(on);
    const effects = strList(to, 'effects', tw);
    for (const e of effects) {
      if (!effectNames.includes(e)) fail(tw, `references unknown effect "${e}"`);
    }
    return { on: on as TriggerId, effects };
  });

  return {
    id,
    name: str(o, 'name', where),
    family: str(o, 'family', where),
    fireable: bool(o, 'fireable', where, true),
    speedScale: numOr(spawn, 'speedScale', `${where}.spawn`, 1),
    gravityScale: numOr(spawn, 'gravityScale', `${where}.spawn`, 1),
    windScale: numOr(spawn, 'windScale', `${where}.spawn`, 1),
    fuse: numOr(spawn, 'fuse', `${where}.spawn`, -1),
    effectNames,
    effectBodies,
    triggers,
  };
}

function resolveEffect(
  raw: RawWeapon,
  bodyAt: number,
  byId: Map<string, number>,
): Effect {
  const name = raw.effectNames[bodyAt];
  const body = raw.effectBodies[bodyAt];
  if (name === undefined || body === undefined) fail(raw.id, 'internal effect index mismatch');
  const where = `${raw.id}.effects.${name}`;
  const kind = str(body, 'kind', where);

  const effectIndex = (effectName: string): number => {
    const i = raw.effectNames.indexOf(effectName);
    if (i < 0) fail(where, `references unknown effect "${effectName}"`);
    return i;
  };

  switch (kind) {
    case 'blast':
      return {
        kind: 'blast',
        maxDamage: numOr(body, 'maxDamage', where, 0),
        blastRadius: numOr(body, 'blastRadius', where, 0),
        carveRadius: numOr(body, 'carveRadius', where, 0),
        fillRadius: numOr(body, 'fillRadius', where, 0),
      };

    case 'spawn': {
      const childId = str(body, 'childId', where);
      const childIndex = byId.get(childId);
      if (childIndex === undefined) fail(where, `childId "${childId}" is not a known weapon`);
      const count = num(body, 'count', where);
      if (count < 1) fail(where, 'count must be at least 1');
      return {
        kind: 'spawn',
        childIndex,
        count,
        spreadUnits: degreesToUnits(numOr(body, 'spreadDeg', where, 0)),
        speedScale: numOr(body, 'speedScale', where, 1),
        inheritVelocity: bool(body, 'inheritVelocity', where, true),
        consumeParent: bool(body, 'consumeParent', where, true),
      };
    }

    case 'mode': {
      const modeName = str(body, 'mode', where);
      let mode: Mode;
      if (modeName === 'roll') mode = MODE_ROLLING;
      else if (modeName === 'burrow') mode = MODE_BURROWING;
      else return fail(where, `unknown mode "${modeName}"; expected roll or burrow`);
      return {
        kind: 'mode',
        mode,
        speed: num(body, 'speed', where),
        budgetSteps: num(body, 'budgetSteps', where),
        carveRadius: numOr(body, 'carveRadius', where, 0),
        onEnd: strList(body, 'onEnd', where).map(effectIndex),
        onRest: strList(body, 'onRest', where).map(effectIndex),
        onImpactPlayer: strList(body, 'onImpactPlayer', where).map(effectIndex),
      };
    }

    case 'expire':
      return { kind: 'expire' };

    default:
      return fail(where, `unknown effect kind "${kind}"`);
  }
}

export function loadWeapons(json: unknown): WeaponRegistry {
  const root = asRecord(json, 'root');
  const list = asArray(root['weapons'], 'weapons');
  if (list.length === 0) fail('weapons', 'no weapons defined');

  const raws = list.map(readWeapon);

  // Registry indices come from sorted ids, so they are stable against
  // reordering the JSON — which matters because indices go into the hash.
  raws.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const byId = new Map<string, number>();
  raws.forEach((r, i) => {
    if (byId.has(r.id)) fail('weapons', `duplicate id "${r.id}"`);
    byId.set(r.id, i);
  });

  const weapons: Weapon[] = raws.map((raw) => {
    const effects = raw.effectNames.map((_, i) => resolveEffect(raw, i, byId));
    const triggers: number[][] = TRIGGER_IDS.map(() => []);
    for (const t of raw.triggers) {
      const slot = triggers[TRIGGER_INDEX[t.on]];
      if (slot === undefined) fail(raw.id, `internal trigger index mismatch for "${t.on}"`);
      for (const e of t.effects) slot.push(raw.effectNames.indexOf(e));
    }
    return {
      id: raw.id,
      name: raw.name,
      family: raw.family,
      speedScale: raw.speedScale,
      gravityScale: raw.gravityScale,
      windScale: raw.windScale,
      fuse: raw.fuse,
      triggers,
      effects,
    };
  });

  return { weapons, byId };
}

export function fireableWeapons(registry: WeaponRegistry, json: unknown): number[] {
  const root = asRecord(json, 'root');
  const list = asArray(root['weapons'], 'weapons');
  const out: number[] = [];
  for (const raw of list) {
    const o = asRecord(raw, 'weapons[]');
    if (bool(o, 'fireable', 'weapons[]', true)) {
      const i = registry.byId.get(str(o, 'id', 'weapons[]'));
      if (i !== undefined) out.push(i);
    }
  }
  return out.sort((a, b) => a - b);
}

export function weaponAt(registry: WeaponRegistry, index: number): Weapon {
  const w = registry.weapons[index];
  if (w === undefined) throw new Error(`no weapon at registry index ${index}`);
  return w;
}

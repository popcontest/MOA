import { describe, expect, it } from 'vitest';
import Ajv from 'ajv';
import { loadArenas, loadClassifier, loadRules, loadWeapons } from '@moa/sim';

import weaponsJson from '../weapons.json';
import weaponsSchema from '../weapons.schema.json';
import rulesJson from '../rules.json';
import rulesSchema from '../rules.schema.json';
import arenasJson from '../arenas.json';
import arenasSchema from '../arenas.schema.json';
import classifierJson from '../classifier.json';
import classifierSchema from '../classifier.schema.json';
import tuningJson from '../tuning.json';
import tuningSchema from '../tuning.schema.json';

/**
 * The hand-written validators in packages/sim are what ships, because the sim
 * carries no runtime dependencies. These tests are the other half of that
 * bargain: the JSON Schema stays authoritative and ajv checks it here, as a
 * devDependency, where a dependency costs nothing.
 */
const ajv = new Ajv({ allErrors: true, strict: false });

function validate(schema: object, data: unknown, label: string): void {
  const fn = ajv.compile(schema);
  if (!fn(data)) {
    throw new Error(`${label} failed its schema:\n${ajv.errorsText(fn.errors, { separator: '\n' })}`);
  }
}

describe('content validates against its schemas', () => {
  it('weapons.json', () => {
    expect(() => validate(weaponsSchema, weaponsJson, 'weapons.json')).not.toThrow();
  });
  it('rules.json', () => {
    expect(() => validate(rulesSchema, rulesJson, 'rules.json')).not.toThrow();
  });
  it('arenas.json', () => {
    expect(() => validate(arenasSchema, arenasJson, 'arenas.json')).not.toThrow();
  });
  it('classifier.json', () => {
    expect(() => validate(classifierSchema, classifierJson, 'classifier.json')).not.toThrow();
  });
  it('tuning.json', () => {
    expect(() => validate(tuningSchema, tuningJson, 'tuning.json')).not.toThrow();
  });
});

describe('content loads at runtime', () => {
  it('weapons', () => {
    expect(loadWeapons(weaponsJson).weapons.length).toBeGreaterThan(0);
  });
  it('rules', () => {
    const r = loadRules(rulesJson);
    expect(r.maxHealth).toBeGreaterThan(0);
    expect(r.turnLimit).toBeGreaterThan(0);
  });
  it('arenas', () => {
    expect(loadArenas(arenasJson).has('rolling')).toBe(true);
  });
  it('classifier', () => {
    expect(loadClassifier(classifierJson).rules.length).toBeGreaterThan(0);
  });
});

describe('the sim and feel content stay separated', () => {
  it('rules.json holds no presentation values', () => {
    const keys = Object.keys(rulesJson);
    const feel = keys.filter((k) => /shake|particle|camera|slowmo|hitstop|trail|colour|color/i.test(k));
    expect(feel).toEqual([]);
  });

  it('tuning.json holds no simulation values', () => {
    const keys = Object.keys(tuningJson);
    const sim = keys.filter((k) => /gravity|wind|health|damage|turnLimit|power/i.test(k));
    expect(sim).toEqual([]);
  });

  it('every arena declares the same shape the sim expects', () => {
    for (const [id, a] of loadArenas(arenasJson)) {
      expect(a.minGround, id).toBeLessThan(a.maxGround);
      expect(a.maxGround, id).toBeLessThan(a.height);
    }
  });
});

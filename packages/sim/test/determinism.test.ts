import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const SIM_SRC = resolve(HERE, '../src');
const SIM_PKG = resolve(HERE, '../package.json');

/**
 * Tests live in packages/sim/test rather than beside the source so that
 * packages/sim/src contains only shipped simulation code. The acceptance grep
 * for Math.random and friends runs over that directory, and a test comparing
 * the trig table against Math.sin would otherwise trip it.
 */
function simSources(): { file: string; text: string }[] {
  return readdirSync(SIM_SRC)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => ({ file: f, text: readFileSync(join(SIM_SRC, f), 'utf8') }));
}

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
}

/**
 * An allowlist rather than a denylist, so a newly reached-for transcendental
 * fails the build instead of slipping through because nobody thought to ban it.
 * Everything here is either exact integer work or correctly rounded by
 * IEEE-754, and therefore bit-identical across JS engines.
 */
const ALLOWED_MATH = new Set([
  'abs',
  'ceil',
  'floor',
  'imul',
  'max',
  'min',
  'round',
  'sign',
  'sqrt',
  'trunc',
]);

describe('sim determinism guarantees', () => {
  it('uses only bit-exact Math members', () => {
    const offenders: string[] = [];
    for (const { file, text } of simSources()) {
      for (const m of text.matchAll(/Math\.(\w+)/g)) {
        const name = m[1];
        if (name !== undefined && !ALLOWED_MATH.has(name)) {
          offenders.push(`${file}: Math.${name}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('satisfies the acceptance grep for random and trig', () => {
    // Mirrors the literal criterion:
    //   grep -rE "Math\.(random|sin|cos|tan)" packages/sim/src
    const offenders: string[] = [];
    for (const { file, text } of simSources()) {
      if (/Math\.(random|sin|cos|tan)/.test(text)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it('has no test files sitting in the shipped source directory', () => {
    expect(readdirSync(SIM_SRC).filter((f) => f.endsWith('.test.ts'))).toEqual([]);
  });

  it('never uses the exponent operator', () => {
    // Math.pow is covered by the allowlist; ** would sneak past it, and it is
    // not correctly rounded for non-integer exponents.
    const offenders: string[] = [];
    for (const { file, text } of simSources()) {
      if (/[^*]\*\*[^*]/.test(stripComments(text))) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it('has zero runtime dependencies', () => {
    const pkg: unknown = JSON.parse(readFileSync(SIM_PKG, 'utf8'));
    const o = pkg as Record<string, unknown>;
    expect(o['dependencies']).toBeUndefined();
    expect(o['peerDependencies']).toBeUndefined();
    expect(o['optionalDependencies']).toBeUndefined();
  });

  it('cannot reach tuning.json', () => {
    // Rule 5 puts feel values behind live sliders. A slider that reached the
    // sim would silently invalidate every replay hash in the project. Comments
    // are stripped first so discussing the split does not count as doing it.
    const offenders: string[] = [];
    for (const { file, text } of simSources()) {
      if (/tuning/i.test(stripComments(text))) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it('imports nothing from render, ui or a physics engine', () => {
    const banned = /from '(@moa\/(render|ui|app|content)|pixi\.js|matter-js|box2d|planck|@dimforge\/rapier)/;
    const offenders: string[] = [];
    for (const { file, text } of simSources()) {
      if (banned.test(text)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});

import weaponsJson from '../weapons.json';
import rulesJson from '../rules.json';
import arenasJson from '../arenas.json';
import classifierJson from '../classifier.json';

/**
 * Content is handed to the sim as plain data rather than imported by it.
 * packages/sim depending on packages/content would give it a runtime
 * dependency, and the sim is meant to be a pure function of (seed, content,
 * inputs) anyway.
 *
 * tuning.json is deliberately absent from this barrel: it is presentation-only
 * and nothing on a sim code path should be able to reach it.
 */
export const weapons: unknown = weaponsJson;
export const rules: unknown = rulesJson;
export const arenas: unknown = arenasJson;
export const classifier: unknown = classifierJson;

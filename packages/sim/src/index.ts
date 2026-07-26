export * from './types';

export { makeRng, cloneRng, nextU32, nextFloat, nextRange, nextInt, type Rng } from './rng';
export {
  sinUnits,
  cosUnits,
  sinDegrees,
  cosDegrees,
  degreesToUnits,
  rotate,
  TURN,
} from './trig';

export {
  generateTerrain,
  carve,
  fill,
  settle,
  raycast,
  solidAt,
  topAt,
  type DirtyRange,
  type RaycastHit,
} from './terrain';

export { loadWeapons, fireableWeapons, weaponAt } from './weapons';
export { loadRules, loadArenas } from './rules';

export {
  createMatch,
  submitInput,
  step,
  resolveTurn,
  isAwaitingInput,
  isOver,
  activePlayerOf,
} from './match';

export { hashState } from './statehash';
export { summarize } from './log';
export { blastFalloff, distanceToPlayer } from './damage';
export {
  classify,
  loadClassifier,
  type Classification,
  type ClassifierConfig,
  type ClassifierRule,
} from './classify';

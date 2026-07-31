import tuningJson from '../tuning.json';

/**
 * Deliberately a separate entry point from the main barrel. tuning.json is
 * presentation-only, and keeping it off the path that sim-adjacent code
 * imports makes "a feel slider must never reach the simulation" structural
 * rather than a convention someone has to remember.
 */
export const tuning: unknown = tuningJson;

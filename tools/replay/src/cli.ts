import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { FIXTURES } from './fixtures';
import { runFixture } from './harness';
import { checkExpectations } from './check';

const rebaseline = process.argv.includes('--rebaseline');

let failures = 0;
const fresh = new Map<string, string>();

for (const f of FIXTURES) {
  const r = runFixture(f);
  const problems = checkExpectations(f, r);
  const hashOk = f.hash === r.hash;
  fresh.set(f.name, r.hash);

  const status = problems.length === 0 && (hashOk || rebaseline) ? 'ok  ' : 'FAIL';
  if (status === 'FAIL') failures++;

  process.stdout.write(
    `${status} ${f.name.padEnd(20)} ${r.hash}  turns=${String(r.observations.turnsPlayed).padStart(2)}` +
      `  ${r.classification === null ? '(unfinished)' : r.classification.headline}\n`,
  );
  if (!hashOk && !rebaseline) {
    process.stdout.write(`       hash: expected ${f.hash}, got ${r.hash}\n`);
  }
  for (const p of problems) process.stdout.write(`       ${p}\n`);
}

if (rebaseline) {
  const here = dirname(fileURLToPath(import.meta.url));
  const file = resolve(here, 'fixtures.ts');
  let src = readFileSync(file, 'utf8');
  const names = FIXTURES.map((f) => f.name);

  // Rewrite the hash literal that follows each fixture's name literal.
  for (const name of names) {
    const h = fresh.get(name);
    if (h === undefined) continue;
    const start = src.indexOf(`name: '${name}'`);
    if (start < 0) throw new Error(`could not locate fixture ${name} in fixtures.ts`);
    const hashAt = src.indexOf('hash:', start);
    const open = src.indexOf("'", hashAt);
    const close = src.indexOf("'", open + 1);
    src = src.slice(0, open + 1) + h + src.slice(close);
  }
  writeFileSync(file, src, 'utf8');

  process.stdout.write(
    '\nRebaselined fixtures.ts.\n' +
      'CLAUDE.md testing doctrine: the commit message must state exactly what\n' +
      'behaviour changed and why these values are correct. A hash updated without\n' +
      'that explanation removes the only safety net this project has.\n',
  );
} else if (failures > 0) {
  process.stdout.write(`\n${failures} of ${FIXTURES.length} fixtures failed\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`\nall ${FIXTURES.length} fixtures pass\n`);
}

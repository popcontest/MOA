import { runBalance } from './runner';

function arg(name: string, dflt: number): number {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit === undefined) return dflt;
  const v = Number(hit.slice(name.length + 3));
  return Number.isFinite(v) ? v : dflt;
}

function argStr(name: string, dflt: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit === undefined ? dflt : hit.slice(name.length + 3);
}

const matches = arg('matches', 10000);
const playerCount = arg('players', 2);
const arena = argStr('arena', 'rolling');
const seed = arg('seed', 1);

const r = runBalance({ matches, playerCount, arena, seed });

const pad = (s: string, n: number) => s.padEnd(n);
const num = (v: number, n: number, dp = 1) => v.toFixed(dp).padStart(n);

process.stdout.write(
  `\nMOTHER OF ALL — balance run\n` +
    `${matches} matches, ${playerCount} players, arena "${arena}", seed ${seed}\n` +
    `elapsed ${(r.elapsedMs / 1000).toFixed(2)}s  (${(r.elapsedMs / matches).toFixed(2)} ms/match)\n\n`,
);

process.stdout.write(
  `${pad('WEAPON', 22)}${pad('SHOTS', 9)}${pad('DMG/SHOT', 10)}${pad('KILLS', 8)}${pad('KILL/SHOT', 11)}${pad('FINISHES', 9)}\n`,
);
process.stdout.write('-'.repeat(69) + '\n');
for (const w of r.perWeapon) {
  process.stdout.write(
    pad(w.weapon, 22) +
      pad(String(w.shots), 9) +
      pad(num(w.shots === 0 ? 0 : w.damage / w.shots, 8, 2), 10) +
      pad(String(w.kills), 8) +
      pad(num(w.shots === 0 ? 0 : (w.kills / w.shots) * 100, 9, 2) + '%', 11) +
      pad(String(w.finishers), 9) +
      '\n',
  );
}

const decided = matches - r.draws;
process.stdout.write(
  `\n${pad('win rate by seat', 22)}` +
    r.winRateByPlayer
      .map((w, i) => `P${i} ${((w / matches) * 100).toFixed(1)}%`)
      .join('  ') +
    `\n${pad('mean turns to kill', 22)}${r.meanTurnsToKill.toFixed(2)}` +
    `\n${pad('mean turns overall', 22)}${(r.turnsTotal / matches).toFixed(2)}` +
    `\n${pad('stalemate rate', 22)}${((r.stalemates / matches) * 100).toFixed(2)}%` +
    `\n${pad('draw rate', 22)}${((r.draws / matches) * 100).toFixed(2)}%` +
    `\n${pad('decided matches', 22)}${decided}\n`,
);

process.stdout.write('\nround summary cards\n');
const cards = [...r.headlines.entries()].sort((a, b) => b[1] - a[1]);
for (const [headline, count] of cards) {
  process.stdout.write(
    `  ${pad(headline, 32)}${String(count).padStart(7)}  ${((count / matches) * 100).toFixed(2)}%\n`,
  );
}
process.stdout.write('\n');

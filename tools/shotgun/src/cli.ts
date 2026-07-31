import { capture, type Shot } from './capture';

const SHOTS: Shot[] = [
  { name: '01-roller-descent', fixture: 'roller-long-walk', seek: 560 },
  { name: '02-roller-approach', fixture: 'roller-long-walk', seek: 610 },
  { name: '03-sod-burial', fixture: 'sod-burial', seek: 720 },
  { name: '04-cluster-split', fixture: 'cluster-split', seek: 150 },
  { name: '05-digger-burrow', fixture: 'digger-detonation', seek: 130 },
  { name: '06-direct-hit', fixture: 'direct-hit', seek: 95 },
  { name: '07-portrait', fixture: 'roller-long-walk', seek: 560, width: 430, height: 932 },
];

const name = process.argv[2];
const chosen = name === undefined ? SHOTS : SHOTS.filter((s) => s.name.includes(name));
process.stdout.write(`shotgun: ${chosen.length} shot(s)\n`);
await capture(chosen, 'scratch/shots');

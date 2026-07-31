import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

/**
 * Wraps the built bundle in a single self-contained page.
 *
 * The published page runs under a CSP that blocks every external host, so the
 * script is inlined rather than linked and no webfont is fetched. The shell
 * borrows the game's own palette and monospace register instead of inventing
 * a second visual language for the frame around it.
 */

const DIST = resolve(process.cwd(), 'packages/app/dist');
const OUT = resolve(process.cwd(), process.argv[2] ?? 'scratch/moa-m1.html');

const bundle = readFileSync(resolve(DIST, 'app.js'), 'utf8')
  // A literal </script inside a string or regex would close the tag early.
  // The escaped form is equivalent everywhere it can legally appear.
  .replace(/<\/script/gi, '<\\/script');

const page = `<title>MOTHER OF ALL — Milestone 1</title>
<style>
  :root {
    --ground: #1A1208;
    --panel: #241a0c;
    --rule: #4a3720;
    --ink: #F2E1C9;
    --ink-dim: #A67B54;
    --accent: #FFBF00;
    --p1: #1FB6C9;
    --p2: #E8468C;
    --mono: ui-monospace, "SF Mono", "DejaVu Sans Mono", Menlo, Consolas, monospace;
  }

  /* Committed to one visual world: this is the game's own ground, and a light
     theme would put the shell in a different key from the canvas it frames. */
  html, body { margin: 0; padding: 0; background: var(--ground); }

  .shell {
    display: flex;
    flex-direction: column;
    height: 100dvh;
    overflow: hidden;
    font-family: var(--mono);
    color: var(--ink);
    -webkit-font-smoothing: antialiased;
  }

  .bar {
    flex: 0 0 auto;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 10px 18px;
    padding: 10px 14px;
    border-bottom: 1px solid var(--rule);
    background: var(--panel);
  }

  .mark {
    font-size: 13px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .note {
    flex: 1 1 260px;
    min-width: 0;
    font-size: 12px;
    color: var(--ink-dim);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .picks { display: flex; flex-wrap: wrap; gap: 6px; width: 100%; }

  button {
    font: inherit;
    font-size: 11.5px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ink-dim);
    background: transparent;
    border: 1px solid var(--rule);
    padding: 4px 8px;
    cursor: pointer;
  }
  button:hover { color: var(--ink); border-color: var(--ink-dim); }
  button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  /* Boldness spent in exactly one place: which fixture is on screen. */
  button[aria-pressed="true"] { color: var(--ground); background: var(--accent); border-color: var(--accent); }

  #stage { flex: 1 1 auto; min-height: 0; position: relative; overflow: hidden; }
  #stage canvas { display: block; position: absolute; inset: 0; width: 100%; height: 100%; }

  .foot {
    flex: 0 0 auto;
    padding: 7px 14px;
    border-top: 1px solid var(--rule);
    background: var(--panel);
    font-size: 11px;
    color: var(--ink-dim);
    display: flex;
    flex-wrap: wrap;
    gap: 4px 16px;
  }
  .foot b { color: var(--ink); font-weight: 400; }
  .swatch { display: inline-block; width: 8px; height: 8px; vertical-align: baseline; }
  .p1 { background: var(--p1); }
  .p2 { background: var(--p2); }
</style>

<div class="shell">
  <div class="bar">
    <span class="mark">Mother of All &middot; M1</span>
    <span class="note" id="note">Loading</span>
    <div class="picks" id="picks"></div>
  </div>
  <div id="stage"></div>
  <div class="foot">
    <span><span class="swatch p1"></span> P1</span>
    <span><span class="swatch p2"></span> P2</span>
    <span>Terrain is a 1-bit mask coloured by a fragment shader.</span>
    <span>Sim runs at a fixed <b>1/120s</b> step; rendering interpolates.</span>
    <span>Each run replays a test fixture to its recorded hash.</span>
  </div>
</div>

<script type="module">
${bundle}
</script>

<script type="module">
  const picks = document.getElementById('picks');
  const note = document.getElementById('note');

  function paint(active) {
    for (const b of picks.querySelectorAll('button')) {
      b.setAttribute('aria-pressed', String(b.dataset.name === active));
    }
    const f = window.MOA.fixtures.find((x) => x.name === active);
    note.textContent = f ? f.note : '';
  }

  function ready() {
    if (!window.MOA) return void setTimeout(ready, 30);
    for (const f of window.MOA.fixtures) {
      const b = document.createElement('button');
      b.textContent = f.name;
      b.dataset.name = f.name;
      b.title = f.note;
      b.addEventListener('click', () => {
        window.MOA.start(f.name);
        paint(f.name);
      });
      picks.appendChild(b);
    }
    paint('roller-long-walk');
  }
  ready();
</script>
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, page, 'utf8');
process.stdout.write(`wrote ${OUT} (${(page.length / 1024).toFixed(0)} KB)\n`);

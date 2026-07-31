import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { isOver, weaponAt, type MatchState } from '@moa/sim';

/**
 * Flat military-manual register: monospace, boxed panels, hairline rules, no
 * gloss. Health bars are ASCII because that is the house style and because
 * text costs nothing to render and scales perfectly.
 *
 * Every readout here maps to a real field on MatchState. Ammunition counts,
 * magazines, range finders and battery levels have all turned up in reference
 * art; none of them exist, and a HUD that shows one eventually gets it built.
 */

export type HudColours = { ink: number; panel: number };

export type Hud = {
  readonly stage: Container;
  update(s: MatchState, fps: number, hash: string): void;
  resize(w: number, h: number): void;
  destroy(): void;
};

const BAR_CELLS = 12;

function bar(health: number, maxHealth: number): string {
  const filled = Math.round((health / maxHealth) * BAR_CELLS);
  return '[' + '#'.repeat(Math.max(0, filled)) + '-'.repeat(Math.max(0, BAR_CELLS - filled)) + ']';
}

function pct(health: number, maxHealth: number): string {
  return String(Math.round((health / maxHealth) * 100)).padStart(3, ' ') + '%';
}

export function createHud(colours: HudColours, viewW: number, viewH: number): Hud {
  const stage = new Container();
  const panel = new Graphics();
  stage.addChild(panel);

  const style = new TextStyle({
    fontFamily: 'ui-monospace, "DejaVu Sans Mono", "Courier New", monospace',
    fontSize: 15,
    fill: colours.ink,
    lineHeight: 20,
  });
  const bigStyle = new TextStyle({
    fontFamily: 'ui-monospace, "DejaVu Sans Mono", "Courier New", monospace',
    fontSize: 22,
    fontWeight: 'bold',
    fill: colours.ink,
    lineHeight: 28,
  });

  const top = new Text({ text: '', style });
  const health = new Text({ text: '', style });
  const aim = new Text({ text: '', style: bigStyle });
  const weapons = new Text({ text: '', style });
  const debug = new Text({ text: '', style });
  stage.addChild(top, health, aim, weapons, debug);

  let w = viewW;
  let h = viewH;

  function layout(): void {
    const pad = 14;
    top.position.set(pad, pad);
    health.position.set(pad, pad + 26);
    aim.position.set(pad, h - 118);
    weapons.position.set(pad, h - 56);
    debug.position.set(pad, h - 26);

    panel.clear();
    panel.rect(0, 0, w, 26 + 22 * 4 + 10).fill({ color: colours.panel, alpha: 0.72 });
    panel.rect(0, h - 130, w, 130).fill({ color: colours.panel, alpha: 0.72 });
  }
  layout();

  return {
    stage,
    resize(nw, nh) {
      w = nw;
      h = nh;
      layout();
    },
    update(s, fps, hash) {
      const { rules, registry } = s.config;
      const windArrow = s.wind < 0 ? '<--' : '-->';
      const sign = s.wind < 0 ? '-' : '+';
      const windMag = Math.abs(s.wind).toFixed(0).padStart(2, '0');

      top.text =
        `TURN ${String(s.turnIndex).padStart(2, '0')} / ${rules.turnLimit}` +
        `   WD: ${windArrow} ${sign}${windMag}` +
        `   ACTIVE: P${s.activePlayer + 1}`;

      const lines: string[] = [];
      for (const p of s.players) {
        const mark = p.alive ? (p.id === s.activePlayer ? '>' : ' ') : 'X';
        lines.push(`${mark}P${p.id + 1}: ${bar(p.health, rules.maxHealth)} (${pct(p.health, rules.maxHealth)})`);
      }
      health.text = lines.join('\n');

      const active = s.players[s.activePlayer];
      if (isOver(s) && s.outcome !== null) {
        aim.text =
          s.outcome.winner < 0
            ? 'ROUND OVER: DRAW'
            : `ROUND OVER: P${s.outcome.winner + 1} (${s.outcome.reason})`;
        weapons.text = '';
      } else if (active !== undefined) {
        aim.text =
          `ANGLE: ${active.lastAngleDeg.toFixed(1).padStart(5, ' ')}\n` +
          `POWER: ${String(Math.round(active.lastPower)).padStart(4, ' ')} (0-1000)`;
        // Loadout, not the whole registry — the registry includes the cluster
        // bomblet, which is a spawn target and never fireable.
        weapons.text = s.config.loadout
          .map((idx, i) => {
            const label = `W${i + 1}-${weaponAt(registry, idx).family.toUpperCase()}`;
            return idx === active.lastWeapon ? `[${label}]` : ` ${label} `;
          })
          .join(' ');
      }

      const wname = active === undefined ? '' : weaponAt(registry, active.lastWeapon).id;
      debug.text = `tick ${s.tick}  ${fps.toFixed(0)}fps  ${wname}  ${hash}`;
    },
    destroy() {
      stage.destroy({ children: true });
    },
  };
}

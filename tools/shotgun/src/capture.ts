import { chromium, type Browser, type Page } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Frame capture against the dev server. The sim is deterministic and the
 * capture path seeks an exact tick count with no wall clock involved, so the
 * same shot re-renders byte-identically — which is what makes these usable as
 * regression images rather than just screenshots.
 *
 * Chromium is preinstalled in this environment; the bundled Playwright
 * revision does not always match, so the binary is named explicitly.
 */

const CHROMIUM = '/opt/pw-browsers/chromium';
const BASE = process.env['MOA_BASE'] ?? 'http://127.0.0.1:5173';

export type Shot = {
  readonly name: string;
  readonly fixture: string;
  readonly seek: number;
  readonly width?: number;
  readonly height?: number;
  readonly debug?: string;
  readonly extra?: string;
};

export async function capture(shots: readonly Shot[], outDir: string): Promise<string[]> {
  mkdirSync(outDir, { recursive: true });
  const written: string[] = [];

  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({
      executablePath: CHROMIUM,
      args: [
        // Software GL in a headless container; without this there is no
        // WebGL2 context at all and the terrain shader never compiles.
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--no-sandbox',
        '--disable-dev-shm-usage',
      ],
    });

    for (const shot of shots) {
      const width = shot.width ?? 1280;
      const height = shot.height ?? 720;
      const page: Page = await browser.newPage({
        viewport: { width, height },
        deviceScaleFactor: 1,
      });

      const logs: string[] = [];
      page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
      page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

      const url = `${BASE}/?fixture=${encodeURIComponent(shot.fixture)}&seek=${shot.seek}${shot.debug === undefined ? '' : '&debug=' + shot.debug}${shot.extra ?? ''}`;
      await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
      await page.waitForFunction('window.__MOA_READY__ === true', undefined, { timeout: 60_000 });

      const err = await page.evaluate('window.__MOA_ERROR__ ?? null');
      const tick = await page.evaluate('window.__MOA_TICK__ ?? -1');

      const file = resolve(outDir, `${shot.name}.png`);
      await page.screenshot({ path: file });
      written.push(file);

      const status = err === null ? `tick=${String(tick)}` : `ERROR ${String(err)}`;
      process.stdout.write(`  ${shot.name.padEnd(24)} ${status}\n`);
      for (const l of logs.slice(0, 12)) process.stdout.write(`      ${l}\n`);

      await page.close();
    }
  } finally {
    if (browser !== null) await browser.close();
  }

  writeFileSync(
    resolve(outDir, 'index.txt'),
    written.map((f) => f).join('\n') + '\n',
    'utf8',
  );
  return written;
}

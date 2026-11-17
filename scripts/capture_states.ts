/* Capture in-game frozen-state renders (stage omitted) for visual review. */
import { chromium } from '@playwright/test';

const OUT = '/home/z/my-project/scripts/out/ingame';
const SHOTS: Array<[number, string, string | null, number, string]> = [
  [0, 'idle', null, -1, 'kaito-idle'],
  [0, 'walk', null, -1, 'kaito-walk'],
  [0, 'crouch', null, -1, 'kaito-crouch'],
  [0, 'jump', null, -1, 'kaito-jump-up'],
  [0, 'dash', null, -1, 'kaito-dash'],
  [0, 'attack', 'lp', -1, 'kaito-jab'],
  [0, 'attack', 'mp', -1, 'kaito-cross'],
  [0, 'attack', 'launcher', -1, 'kaito-launcher'],
  [0, 'attack', 'hk', -1, 'kaito-heavy-heel'],
  [0, 'attack', 'cr_hk', -1, 'kaito-sweep'],
  [0, 'hitstun', null, -1, 'kaito-hitstun'],
  [0, 'knockdown', null, -1, 'kaito-knockdown'],
  [0, 'win', null, -1, 'kaito-win'],
  [1, 'idle', null, -1, 'vx9-idle'],
  [1, 'walk', null, -1, 'vx9-walk'],
  [1, 'crouch', null, -1, 'vx9-crouch'],
  [1, 'jump', null, 1, 'vx9-jump-down'],
  [1, 'dash', null, -1, 'vx9-dash'],
  [1, 'attack', 'lp', -1, 'vx9-jab'],
  [1, 'attack', 'launcher', -1, 'vx9-launcher'],
  [1, 'attack', 'mk', -1, 'vx9-rush-knee'],
  [1, 'knockdown', null, -1, 'vx9-knockdown'],
  [1, 'win', null, -1, 'vx9-win'],
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://localhost:3000/');
await page.getByRole('button', { name: 'ENTER THE ARENA' })
  .waitFor({ state: 'visible', timeout: 120000 });
await page.getByRole('button', { name: 'ENTER THE ARENA' }).click();
await page.getByRole('button', { name: 'FIGHT', exact: true }).click();
await page.waitForFunction(() => Boolean((window as unknown as { __game?: unknown }).__game),
  null, { timeout: 30000 });
await page.waitForTimeout(2500);

// pause loop, then capture each frozen state; ALSO capture one full-stage frame
await page.evaluate(() => {
  (window as unknown as { __game: { setPaused: (p: boolean) => void } }).__game.setPaused(true);
});
const rows: Array<[string, number]> = [];
for (const tuple of SHOTS) {
  const [w, st, mv, v, name] = tuple;
  const m = await page.evaluate(([w, st, mv, v]) => {
    const g = (window as unknown as {
      __game: {
        debugDrawState: (who: number, state: string, move: string | null, vy: number) => void;
      };
    }).__game;
    g.debugDrawState(w, st, mv, v);
    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable');
    const x0 = 610, y0 = 200, x1 = 1310, y1 = 958;
    const img = ctx.getImageData(x0, y0, x1 - x0, y1 - y0);
    let minY = -1, maxY = -1;
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        if (img.data[(y * img.width + x) * 4 + 3] > 200) {
          if (minY < 0) minY = y;
          maxY = y;
        }
      }
    }
    const data = canvas.toDataURL('image/png');
    return { h: maxY - minY + 1, data };
  }, tuple);
  rows.push([name, m.h]);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  // save raw canvas png (crisper)
  await page.evaluate((d) => {
    const a = document.createElement('a');
    a.href = d; return null;
  }, m.data);
}
console.log('measured heights:', JSON.stringify(rows));
await browser.close();
console.log('done ->', OUT);

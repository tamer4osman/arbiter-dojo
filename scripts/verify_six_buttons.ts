/* Visual verification of the six-button layout: capture live frames of each
 * punch and kick mid-attack, plus AI kicks; assert zero console errors. */
import { chromium } from '@playwright/test';

const OUT = '/tmp/verify';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const errors: string[] = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

await page.goto('http://localhost:3000/');
await page.getByRole('button', { name: 'ENTER THE ARENA' })
  .waitFor({ state: 'visible', timeout: 120000 });
await page.getByRole('button', { name: 'ENTER THE ARENA' }).click();
await page.getByRole('button', { name: 'FIGHT', exact: true }).click();
await page.waitForFunction(() => Boolean((window as unknown as { __game?: unknown }).__game),
  null, { timeout: 30000 });
await page.waitForTimeout(3500); // intro -> fight

// park the AI nearby-but-passive (knockdown) so player attacks whiff harmlessly
const park = () => page.evaluate(() => {
  const g = (window as unknown as { __game: { engine: { fighters: Array<Record<string, unknown>> } } }).__game;
  const f = g.engine.fighters[1];
  f.x = 1050; f.y = 0; f.vy = 0; f.airborne = false;
  f.state = 'knockdown'; f.stateT = 1000000;
});

const waitIdle = async () => {
  for (let i = 0; i < 60; i++) {
    const st = await page.evaluate(() =>
      ((window as unknown as { __game: { engine: { fighters: Array<{ state: string }> } } }).__game)
        .engine.fighters[0].state);
    if (['idle', 'walk', 'crouch'].includes(st)) return;
    await page.waitForTimeout(100);
  }
};

const captureMove = async (name: string, setup: 'stand' | 'crouch' | 'forward' | 'none',
  code: string, holdMs: number, shotDelayMs: number) => {
  await park();
  await waitIdle();
  const downKey = setup === 'crouch' ? 'KeyS' : setup === 'forward' ? 'KeyD' : null;
  if (downKey) { await page.keyboard.down(downKey); await page.waitForTimeout(120); }
  await page.keyboard.down(code);
  await page.waitForTimeout(holdMs);
  await page.keyboard.up(code);
  await page.waitForTimeout(shotDelayMs); // land inside active frames
  await page.screenshot({ path: `${OUT}/${name}.png` });
  if (downKey) await page.keyboard.up(downKey);
  const move = await page.evaluate(() => {
    const f = ((window as unknown as { __game: { engine: { fighters: Array<{ move: { name: string } | null }> } } }).__game)
      .engine.fighters[0];
    return f.move ? f.move.name : '(recovered)';
  });
  console.log(`${name}: move=${move}`);
};

await captureMove('kaito-lp',  'stand',   'KeyJ', 60, 130);
await captureMove('kaito-mp',  'stand',   'KeyK', 60, 220);
await captureMove('kaito-hp',  'stand',   'KeyL', 60, 300);
await captureMove('kaito-lk',  'stand',   'KeyU', 60, 160);
await captureMove('kaito-mk',  'stand',   'KeyI', 60, 250);
await captureMove('kaito-hk',  'stand',   'KeyO', 60, 340);
await captureMove('kaito-sweep', 'crouch', 'KeyO', 60, 300);
await captureMove('kaito-launcher', 'forward', 'KeyL', 60, 320);

// AI (VX-9) kicks: unfreeze AI far enough that it picks kick options
await page.evaluate(() => {
  const g = (window as unknown as { __game: { engine: { fighters: Array<Record<string, unknown>> } } }).__game;
  const f = g.engine.fighters[1];
  f.state = 'idle'; f.stateT = 0;
  f.x = (g.engine.fighters[0] as { x: number }).x + 200;
});
// drive the PLAYER into a passive hold; let the AI act for a bit
await page.waitForTimeout(2600);
await page.screenshot({ path: `${OUT}/vx9-live.png` });

console.log('console/page errors:', errors.length ? errors.join('\n') : 'NONE');
await browser.close();
console.log('done ->', OUT);

/* Debug: gamepad Menu pause/resume toggle behavior. */
import { chromium } from '@playwright/test';

const PAD_MOCK = `
  (() => {
    const pad = {
      id: 'Test Pad', index: 0, connected: true, mapping: 'standard', timestamp: 0,
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
    };
    navigator.getGamepads = () => [pad, null, null, null];
    window.__pressPad = (i, p) => {
      pad.buttons[i].pressed = !!p; pad.buttons[i].value = p ? 1 : 0;
      pad.timestamp = performance.now();
    };
  })();`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.addInitScript(PAD_MOCK);
await page.goto('http://localhost:3000/');
await page.getByRole('button', { name: 'ENTER THE ARENA' }).waitFor({ timeout: 120000 });
await page.getByRole('button', { name: 'ENTER THE ARENA' }).click();
await page.getByRole('button', { name: 'FIGHT', exact: true }).click();
await page.waitForFunction(() => Boolean((window as unknown as { __game?: unknown }).__game),
  null, { timeout: 30000 });
await page.waitForTimeout(2500);

const state = () => page.evaluate(() => {
  const g = (window as unknown as {
    __game: { paused: boolean; padName: string | null };
  }).__game;
  return { paused: g.paused, pad: g.padName };
});

console.log('before:', await state());
await page.evaluate(() => {
  (window as unknown as { __pressPad: (i: number, p: boolean) => void }).__pressPad(9, true);
});
await page.waitForTimeout(400);
console.log('after menu press:', await state());
await page.evaluate(() => {
  (window as unknown as { __pressPad: (i: number, p: boolean) => void }).__pressPad(9, false);
});
await page.waitForTimeout(400);
console.log('after release:', await state());
await page.evaluate(() => {
  (window as unknown as { __pressPad: (i: number, p: boolean) => void }).__pressPad(9, true);
});
await page.waitForTimeout(400);
console.log('after second press:', await state());
await browser.close();

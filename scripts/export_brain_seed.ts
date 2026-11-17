/* Train a fresh brain on 100 self-play matches and export the snapshot as
 * the shipped default seed (public/game/brain-seed.json). Users without a
 * local brain get this trained memory on first boot; their own matches then
 * grow it further and override the seed in localStorage. */
import { chromium } from '@playwright/test';
import { writeFileSync } from 'fs';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://localhost:3000/');
await page.getByRole('button', { name: 'ENTER THE ARENA' }).waitFor({ timeout: 120000 });

await page.evaluate(() => {
  const w = window as unknown as { __brain?: { reset(): void } };
  w.__brain?.reset();
  localStorage.removeItem('arbiter_brain_v1');
});

console.log('training 100 matches for the seed...');
await page.evaluate(() => {
  (window as unknown as { __trainBrain?: (n: number) => void }).__trainBrain?.(100);
});
await page.waitForFunction(() => {
  const w = window as unknown as {
    __brainState?: () => { training: { done: boolean } | null } | null;
  };
  const s = w.__brainState?.();
  return !!s && !!s.training && s.training.done;
}, null, { timeout: 600000 });

const snapshot = await page.evaluate(() =>
  localStorage.getItem('arbiter_brain_v1'));
const info = await page.evaluate(() => {
  const w = window as unknown as {
    __brainState?: () => { entries: number; visits: number } | null;
  };
  return w.__brainState?.();
});
if (!snapshot) throw new Error('no brain snapshot in localStorage');
writeFileSync('/home/z/my-project/public/game/brain-seed.json', snapshot);
console.log(`seed saved: ${info?.entries} experiences, ${info?.visits} outcomes`);
await browser.close();

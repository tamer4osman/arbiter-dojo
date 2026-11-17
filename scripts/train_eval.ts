/* Train the Arbiter brain on 100 self-play matches in the real browser and
 * run an A/B evaluation: plain kernel (brain weight 0) before training vs
 * brain-weighted kernel after. Results go to scripts/out/brain_report.json. */
import { chromium } from '@playwright/test';
import { writeFileSync } from 'fs';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://localhost:3000/');
await page.getByRole('button', { name: 'ENTER THE ARENA' }).waitFor({ timeout: 120000 });

// fresh brain for a clean A/B
await page.evaluate(() => {
  const w = window as unknown as { __brain?: { reset(): void } };
  w.__brain?.reset();
  localStorage.removeItem('arbiter_brain_v1');
});

/* ---------- baseline: 20 matches, plain kernel ---------- */
console.log('evaluating baseline (plain kernel, 20 matches)...');
const baseline = await page.evaluate(async () => {
  const w = window as unknown as {
    __evalBrain?: (n: number, useBrain: boolean) => Promise<unknown>;
  };
  return await w.__evalBrain?.(50, false);
});
console.log('baseline:', JSON.stringify(baseline));

/* ---------- train: 100 self-play matches ---------- */
console.log('training 100 matches...');
const t0 = Date.now();
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
const trainMs = Date.now() - t0;

const state = await page.evaluate(() => {
  const w = window as unknown as {
    __brainState?: () => {
      entries: number; visits: number;
      training: { traineeWins: number; oppWins: number; draws: number;
        log: string[] } | null;
      lessons: Array<{ kind: string; option: string; wins: number;
        losses: number; visits: number; bonus: number }>;
    } | null;
  };
  return w.__brainState?.();
});
console.log(`training wall time: ${(trainMs / 1000).toFixed(1)}s`);
console.log(`brain: ${state?.entries} experiences, ${state?.visits} outcomes`);
console.log('self-play record:',
  `${state?.training?.traineeWins}-${state?.training?.oppWins}-${state?.training?.draws}`);
console.log('last matches:', state?.training?.log.slice(-3).join(' | '));
console.log('top lessons:', JSON.stringify(state?.lessons?.slice(0, 3)));

/* ---------- post-training: 20 matches with the brain ---------- */
console.log('evaluating trained brain (weight 0.35, 20 matches)...');
const after = await page.evaluate(async () => {
  const w = window as unknown as {
    __evalBrain?: (n: number, useBrain: boolean) => Promise<unknown>;
  };
  return await w.__evalBrain?.(50, true);
});
console.log('with brain:', JSON.stringify(after));

/* ---------- screenshot of the setup screen brain panel ---------- */
await page.getByRole('button', { name: 'ENTER THE ARENA' }).click();
await page.getByRole('button', { name: 'FIGHT', exact: true })
  .waitFor({ state: 'visible', timeout: 30000 });
await page.waitForTimeout(600);
await page.screenshot({ path: '/home/z/my-project/scripts/out/ingame/brain-panel.png', fullPage: false });

writeFileSync('/home/z/my-project/scripts/out/brain_report.json', JSON.stringify({
  baseline, after, trainMs,
  brainEntries: state?.entries, brainVisits: state?.visits,
  selfPlayRecord: state?.training, lessons: state?.lessons,
}, null, 1));
console.log('report saved -> scripts/out/brain_report.json');
await browser.close();

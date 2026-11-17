/* Brain E2E: the experience memory grows through self-play training,
 * persists to localStorage, reproduces the documented odk_brain bonus math,
 * and keeps learning during live fights. Zero console errors throughout. */
import { test, expect } from '@playwright/test';
import { bootToMenu, enterFight, trackErrors } from './helpers';

interface TrainStateView {
  running: boolean; done: boolean; match: number; total: number;
  traineeWins: number; oppWins: number; draws: number;
}

interface BrainStateView {
  entries: number; visits: number; weight: number; saved: boolean;
  training: TrainStateView | null;
}

function brainState(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const w = window as unknown as
      { __brainState?: () => BrainStateView | null };
    return w.__brainState ? w.__brainState() : null;
  });
}

test.describe('arbiter brain', () => {
  test('bonus math matches the documented odk_brain semantics', async ({ page }) => {
    const errors = trackErrors(page);
    await bootToMenu(page);
    const probe = await page.evaluate(() => {
      const b = (window as unknown as {
        __brain?: {
          record: (kind: string, opt: string, r: number) => void;
          advise: (kind: string, opts: string[]) => number[];
        };
      }).__brain;
      if (!b) return { twoWins: -9, oneVisit: -9 };
      // two rewards of +1.0 -> bonus = (2-0)/2 * (2/(2+4)) = 0.3333
      b.record('probe_kind', 'zz_probe', 1.0);
      b.record('probe_kind', 'zz_probe', 1.0);
      const twoWins = b.advise('probe_kind', ['zz_probe'])[0];
      // a single visit must advise 0 (needs MIN_VISITS = 2)
      b.record('probe_kind', 'zz_single', 1.0);
      const oneVisit = b.advise('probe_kind', ['zz_single'])[0];
      return { twoWins, oneVisit };
    });
    expect(probe.twoWins).toBeCloseTo(0.3333, 2);
    expect(probe.oneVisit).toBe(0);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('training 2 matches grows the memory and persists it', async ({ page }) => {
    const errors = trackErrors(page);
    await bootToMenu(page);
    // start from a clean slate
    await page.evaluate(() => {
      const w = window as unknown as { __brain?: { reset(): void } };
      w.__brain?.reset();
      localStorage.removeItem('arbiter_brain_v1');
    });
    const before = await brainState(page);
    expect(before?.entries).toBe(0);

    await page.evaluate(() => {
      (window as unknown as { __trainBrain?: (n: number) => void }).__trainBrain?.(2);
    });
    await page.waitForFunction(() => {
      const w = window as unknown as
        { __brainState?: () => BrainStateView | null };
      const s = w.__brainState?.();
      return !!s && !!s.training && s.training.done;
    }, null, { timeout: 240000 });

    const after = await brainState(page);
    expect(after, 'brain state available').toBeTruthy();
    expect(after!.entries, 'memory entries created').toBeGreaterThan(0);
    expect(after!.visits, 'outcomes recorded').toBeGreaterThanOrEqual(after!.entries);
    expect(after!.saved, 'brain persisted to localStorage').toBe(true);
    const t = after!.training!;
    expect(t.traineeWins + t.oppWins + t.draws, '2 matches completed').toBe(2);
    expect(t.total).toBe(2);

    const stored = await page.evaluate(() => localStorage.getItem('arbiter_brain_v1'));
    expect(stored, 'snapshot JSON exists').toBeTruthy();
    const parsed = JSON.parse(stored!) as { entries: Record<string, unknown> };
    expect(Object.keys(parsed.entries).length).toBe(after!.entries);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('a live fight keeps learning through the trained memory', async ({ page }) => {
    const errors = trackErrors(page);
    await bootToMenu(page);
    const mid = await brainState(page);
    await enterFight(page);
    // live matches record outcome rewards on top of the boot baseline
    // (the shipped seed already carries ~15k outcomes, so compare relatively)
    await page.waitForFunction((m) => {
      const w = window as unknown as
        { __brainState?: () => BrainStateView | null };
      const s = w.__brainState?.();
      return !!s && s.visits > ((m as BrainStateView | null)?.visits ?? 0);
    }, mid, { timeout: 60000 });
    const post = await brainState(page);
    expect(post!.visits).toBeGreaterThan(mid?.visits ?? 0);
    expect(post!.entries).toBeGreaterThanOrEqual(mid?.entries ?? 0);
    expect(post!.weight).toBeCloseTo(0.35, 2);
    expect(errors, errors.join('\n')).toEqual([]);
  });
});

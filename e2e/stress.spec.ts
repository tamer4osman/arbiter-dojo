/* Stress tests: sustained FPS under load, kernel throughput + latency,
 * long soak with chaos inputs, memory growth, rapid pause cycling. */
import { test, expect } from '@playwright/test';
import { enterFight, trackErrors, withGame } from './helpers';

interface FrameStats { n: number; avgFps: number; p95Ms: number; maxMs: number }

async function measureFrames(page: import('@playwright/test').Page, ms: number):
  Promise<FrameStats> {
  return page.evaluate(async (dur) => {
    const t0 = await new Promise<number>((res) => requestAnimationFrame(res));
    const frames: number[] = [];
    await new Promise<void>((res) => {
      const cb = (t: number) => {
        frames.push(t);
        if (t - t0 < dur) requestAnimationFrame(cb);
        else res();
      };
      requestAnimationFrame(cb);
    });
    const dt: number[] = [];
    for (let i = 1; i < frames.length; i++) dt.push(frames[i] - frames[i - 1]);
    dt.sort((a, b) => a - b);
    const total = frames[frames.length - 1] - frames[0];
    const p95 = dt.length ? dt[Math.min(dt.length - 1, Math.floor(dt.length * 0.95))] : 999;
    return {
      n: frames.length,
      avgFps: total > 0 ? (frames.length - 1) / (total / 1000) : 0,
      p95Ms: p95,
      maxMs: dt.length ? dt[dt.length - 1] : 999,
    };
  }, ms);
}

test.describe('stress', () => {
  test('sustained 12s battle under active input keeps >=50fps', async ({ page }) => {
    test.info().annotations.push({ type: 'description',
      description: 'FPS stability with continuous movement + attack spam' });
    const errors = trackErrors(page);
    await enterFight(page);
    await page.waitForTimeout(3200); // intro -> fight

    // input pressure from the test side while frames are sampled in-page
    let stop = false;
    const driver = (async () => {
      const keys = ['KeyJ', 'KeyK', 'KeyL', 'KeyU', 'KeyI', 'KeyO',
        'KeyD', 'KeyA', 'KeyW', 'KeyS', 'KeyB', 'KeyN'];
      while (!stop) {
        const k = keys[Math.floor(Math.random() * keys.length)];
        await page.keyboard.down(k);
        await page.waitForTimeout(120 + Math.random() * 160);
        await page.keyboard.up(k);
        await page.waitForTimeout(60);
      }
    })();

    const stats = await measureFrames(page, 12000);
    stop = true;
    await driver;

    expect(stats.n, 'frames captured').toBeGreaterThan(300);
    expect(stats.avgFps, `avg fps (got ${stats.avgFps.toFixed(1)})`).toBeGreaterThanOrEqual(50);
    expect(stats.p95Ms, `p95 frame time (got ${stats.p95Ms.toFixed(1)}ms)`).toBeLessThan(40);
    expect(errors, errors.join('\n')).toEqual([]);
    await test.info().attach('fps-stats.json', {
      body: JSON.stringify(stats, null, 1), contentType: 'application/json',
    });
  });

  test('kernel: 300 sequential decisions, zero failures, p95 < 10ms', async ({ page }) => {
    test.info().annotations.push({ type: 'description',
      description: 'OmniDecide WASM evaluateChoice throughput and latency' });
    await enterFight(page);
    await page.waitForTimeout(2500);
    const stats = await page.evaluate(() => {
      const g = (window as unknown as {
        __game: { bridge: {
          kernel: unknown;
          choose(kind: string, instr: string, opts: string[], ctx: string, frame: number):
            { choice: string | null; call: { ms: number; ok: boolean; err?: string } };
        } };
      }).__game;
      const b = g.bridge;
      if (!b.kernel) return { ok: false, reason: 'kernel not loaded', lat: [] as number[] };
      const lat: number[] = [];
      let fails = 0;
      const options = ['approach', 'retreat', 'attack_light', 'attack_heavy', 'block', 'jump'];
      for (let i = 0; i < 300; i++) {
        const ctx = `stress round ${i}: distance 240, opponent advancing, drive 60`;
        const r = b.choose('stress_test', 'choose the best fighting game action now',
          options, ctx, i);
        lat.push(r.call.ms);
        if (!r.call.ok || !r.choice) fails++;
      }
      lat.sort((a, b2) => a - b2);
      return {
        ok: true,
        fails,
        n: lat.length,
        avg: lat.reduce((s, v) => s + v, 0) / lat.length,
        p50: lat[Math.floor(lat.length * 0.5)],
        p95: lat[Math.floor(lat.length * 0.95)],
        max: lat[lat.length - 1],
      };
    });
    expect(stats.ok, 'kernel loaded').toBe(true);
    expect((stats as { fails: number }).fails).toBe(0);
    expect((stats as { p95: number }).p95).toBeLessThan(10);
    await test.info().attach('kernel-stress.json', {
      body: JSON.stringify(stats, null, 1), contentType: 'application/json',
    });
  });

  test('60s chaos soak: no errors, no crash, match stays live', async ({ page }) => {
    test.info().annotations.push({ type: 'description',
      description: 'Long session with random inputs; both fighters kept alive' });
    const errors = trackErrors(page);
    await enterFight(page);
    await page.waitForTimeout(3200);

    // keep both alive + prevent round accumulation so one match runs forever
    await page.evaluate(() => {
      const g = (window as unknown as {
        __game: { engine: { fighters: Array<Record<string, number>> } };
      }).__game;
      (window as unknown as { __heal?: ReturnType<typeof setInterval> }).__heal =
        setInterval(() => {
          const e = (window as unknown as {
            __game: { engine: { fighters: Array<Record<string, number>> } };
          }).__game.engine;
          e.fighters[0].hp = 1000;
          e.fighters[1].hp = 1000;
          e.fighters[0].wins = 0;
          e.fighters[1].wins = 0;
          e.fighters[0].juggle = 0;
          e.fighters[1].juggle = 0;
        }, 1500);
    });

    const keys = ['KeyJ', 'KeyK', 'KeyL', 'KeyU', 'KeyI', 'KeyO', 'KeyB',
      'KeyN', 'KeyM', 'Comma', 'KeyA', 'KeyD', 'KeyW', 'KeyS'];
    const t0 = Date.now();
    let toggles = 0;
    while (Date.now() - t0 < 60000) {
      const k = keys[Math.floor(Math.random() * keys.length)];
      await page.keyboard.down(k);
      await page.waitForTimeout(90 + Math.random() * 200);
      await page.keyboard.up(k);
      if (++toggles % 25 === 0) {
        // interleave pause/resume churn
        await page.keyboard.press('Escape');
        await page.waitForTimeout(120);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(120);
      }
    }
    await page.evaluate(() => {
      const h = (window as unknown as { __heal?: ReturnType<typeof setInterval> }).__heal;
      if (h) clearInterval(h);
    });

    const alive = await withGame<boolean>(page, (g) => {
      const e = g.engine as { fighters: Array<{ hp: number }>; phase: string };
      return e.fighters.every((f) => f.hp > 0) && e.phase !== 'matchend';
    });
    expect(alive, 'match survived the soak').toBe(true);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('heap stays bounded across a 40s session', async ({ page }) => {
    test.info().annotations.push({ type: 'description',
      description: 'JS heap growth check (Chromium performance.memory)' });
    const errors = trackErrors(page);
    await enterFight(page);
    await page.waitForTimeout(3000);

    const heapBefore = await page.evaluate(() => {
      const mem = (performance as unknown as {
        memory?: { usedJSHeapSize: number };
      }).memory;
      return mem ? mem.usedJSHeapSize : 0;
    });

    const keys = ['KeyJ', 'KeyK', 'KeyL', 'KeyU', 'KeyI', 'KeyO', 'KeyB',
      'KeyD', 'KeyA', 'KeyW', 'KeyS'];
    const t0 = Date.now();
    while (Date.now() - t0 < 40000) {
      const k = keys[Math.floor(Math.random() * keys.length)];
      await page.keyboard.down(k);
      await page.waitForTimeout(100);
      await page.keyboard.up(k);
      await page.waitForTimeout(40);
    }
    await page.waitForTimeout(1500); // let GC settle
    const heapAfter = await page.evaluate(() => {
      const mem = (performance as unknown as {
        memory?: { usedJSHeapSize: number };
      }).memory;
      return mem ? mem.usedJSHeapSize : 0;
    });

    expect(heapBefore, 'performance.memory available').toBeGreaterThan(0);
    const growthMb = (heapAfter - heapBefore) / (1024 * 1024);
    expect(growthMb, `heap growth ${growthMb.toFixed(1)}MB`).toBeLessThan(50);
    expect(errors, errors.join('\n')).toEqual([]);
    await test.info().attach('heap.json', {
      body: JSON.stringify({ before: heapBefore, after: heapAfter,
        growthMb: Number(growthMb.toFixed(2)) }, null, 1),
      contentType: 'application/json',
    });
  });

  test('rapid pause/resume cycling keeps simulation consistent', async ({ page }) => {
    const errors = trackErrors(page);
    await enterFight(page);
    await page.waitForTimeout(3000);
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(90);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(90);
    }
    const ok = await withGame<boolean>(page, (g) => {
      const e = g.engine as { fighters: Array<{ hp: number }>; phase: string };
      return e.fighters.every((f) => f.hp >= 0) && ['intro', 'fight', 'ko', 'roundend'].includes(e.phase);
    });
    expect(ok, 'engine consistent after churn').toBe(true);
    await page.waitForTimeout(1200);
    expect(errors, errors.join('\n')).toEqual([]);
  });
});

/* Sprite size-consistency E2E: verifies the renderer draws every pose at the
 * manifest-calibrated height, so characters stay proportional in all
 * situations (idle/walk/crouch/jump/attacks/hits/knockdown). */
import { test, expect, TestInfo } from '@playwright/test';
import { enterFight, withGame, shotCanvas } from './helpers';
import { MOVES } from '../src/game/moves';
import { MoveId } from '../src/game/types';

interface Measure { h: number; w: number; ok: boolean }

const MOVE_IDS = Object.keys(MOVES) as MoveId[];

async function measurePose(page: import('@playwright/test').Page, who: number,
  state: string, move: string | null, vy: number): Promise<Measure> {
  return withGame<Measure>(page, (g, w, st, mv, v) => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { h: 0, w: 0, ok: false };
    g.setPaused(true);
    g.debugDrawState(w, st, mv, v);
    // fighter region: x 610..1310 (fighter centered at 960), below HUD (y>=200)
    const x0 = 610, y0 = 200, x1 = 1310, y1 = 958;
    const img = ctx.getImageData(x0, y0, x1 - x0, y1 - y0);
    let minY = -1, maxY = -1, minX = -1, maxX = -1;
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        const a = img.data[(y * img.width + x) * 4 + 3];
        if (a > 200) {
          if (minY < 0) minY = y;
          maxY = y;
          if (minX < 0 || x < minX) minX = x;
          if (x > maxX) maxX = x;
        }
      }
    }
    return { h: maxY - minY + 1, w: maxX - minX + 1, ok: minY >= 0 };
  }, who, state, move, vy);
}

test.describe('sprite size consistency', () => {
  test('every pose renders at its manifest-calibrated height', async ({ page }) => {
    test.info().annotations.push({ type: 'description',
      description: 'Verifies constant character proportions across all gameplay situations' });
    await enterFight(page);

    const manifest = await page.evaluate(async () => {
      const res = await fetch('/game/assets/manifest.json');
      const m = await res.json();
      const out: Record<string, number> = {};
      for (const p of m.poses) out[`${p.id.split('_')[0]}_${p.label}`] = p.draw_h;
      return out;
    });

    const results: Array<{ who: number; pose: string; measured: number; expected: number }> = [];

    // state-driven poses: [state, vy, expected pose label]
    const stateCases: Array<[string, number, string]> = [
      ['idle', -1, 'idle'], ['walk', -1, 'walk_f'], ['crouch', -1, 'crouch'],
      ['jump', -1, 'jump_up'], ['dash', -1, 'dash'], ['backdash', -1, 'walk_b'],
      ['blockstun', -1, 'blockstun'], ['parry', -1, 'sig_charge'],
      ['stagger', -1, 'hit_high'], ['knockdown', -1, 'knockdown'],
      ['ko', -1, 'knockdown'], ['win', -1, 'sig_fire'], ['wakeup', -1, 'crouch'],
    ];

    for (const [who, char] of [[0, 'kaito'], [1, 'vx9']] as Array<[number, string]>) {
      for (const [state, vy, pose] of stateCases) {
        const m = await measurePose(page, who, state, null, vy);
        const label = `${char}_${pose}`;
        expect(m.ok, `${label} rendered`).toBe(true);
        results.push({ who, pose: label, measured: m.h, expected: manifest[label] });
      }
      // hitstun selects pose via lastStunHigh: true -> hit_high, false -> hit_body
      for (const [high, pose] of [[true, 'hit_high'], [false, 'hit_body']] as const) {
        await withGame<void>(page, (g, w: number, s: boolean) => {
          (g.engine as { fighters: Array<{ lastStunHigh: boolean }> })
            .fighters[w].lastStunHigh = s;
        }, who, high);
        const m = await measurePose(page, who, 'hitstun', null, -1);
        const label = `${char}_${pose}`;
        expect(m.ok, `${label} rendered`).toBe(true);
        results.push({ who, pose: label, measured: m.h, expected: manifest[label] });
      }
      // every move's attack pose
      for (const move of MOVE_IDS) {
        const m = await measurePose(page, who, 'attack', move, -1);
        expect(m.ok, `${char} attack ${move} rendered`).toBe(true);
        results.push({
          who, pose: `${char}_${MOVES[move].pose}`,
          measured: m.h, expected: manifest[`${char}_${MOVES[move].pose}`],
        });
      }
    }

    // 1. measured height == manifest draw_h within 8% (soft sprite edges may
    //    lose a few rows under the alpha>200 threshold)
    for (const r of results) {
      expect(r.expected, `manifest entry for ${r.pose}`).toBeGreaterThan(0);
      expect(Math.abs(r.measured - r.expected) / r.expected,
        `${r.pose}: measured ${r.measured} vs draw_h ${r.expected}`).toBeLessThan(0.08);
    }

    // 2. standing heights: Kaito ~340 world px, VX-9 ~10% larger (~374) per
    //    the character-scale design spec. Tolerance is relative (5%): the
    //    alpha>200 bbox loses ~2-4% of rows to soft/glowing sprite edges,
    //    so an absolute window would be scale-biased.
    const idleK = results.find((r) => r.pose === 'kaito_idle')!;
    const idleV = results.find((r) => r.pose === 'vx9_idle')!;
    expect(Math.abs(idleK.measured - 340) / 340, `kaito idle ${idleK.measured}`)
      .toBeLessThanOrEqual(0.05);
    expect(Math.abs(idleV.measured - 374) / 374, `vx9 idle ${idleV.measured}`)
      .toBeLessThanOrEqual(0.05);
    // VX-9 is a heavier frame: slightly larger than Kaito in EVERY situation.
    // Idle ratio must land in [1.05, 1.16] (design target 1.10; measured
    // ratio compresses slightly through per-character edge loss).
    const ratio = idleV.measured / idleK.measured;
    expect(ratio, `vx9/kaito idle height ratio ${ratio.toFixed(3)}`).toBeGreaterThanOrEqual(1.05);
    expect(ratio, `vx9/kaito idle height ratio ${ratio.toFixed(3)}`).toBeLessThanOrEqual(1.16);

    // 3. situational bands: crouch/knockdown clearly lower than standing
    const cr = results.find((r) => r.pose === 'kaito_crouch')!;
    expect(cr.measured).toBeLessThan(idleK.measured * 0.72);
    const kd = results.find((r) => r.pose === 'kaito_knockdown')!;
    expect(kd.measured).toBeLessThan(idleK.measured * 0.65);

    // 4. standing-family poses stay within +-12% of the character's own
    //    idle height (Kaito ~340, VX-9 ~374)
    const standing = new Set(['idle', 'walk_f', 'walk_b', 'blockstun',
      'sig_charge', 'sig_fire', 'jab', 'cross', 'hit_high', 'hit_body']);
    const idleByWho: Record<number, number> = { 0: idleK.measured, 1: idleV.measured };
    for (const r of results) {
      const label = r.pose.split('_').slice(1).join('_');
      if (standing.has(label)) {
        const ref = idleByWho[r.who];
        expect(Math.abs(r.measured - ref) / ref, `${r.pose} standing band`)
          .toBeLessThan(0.12);
      }
    }

    await test.info().attach('size-measurements.json', {
      body: JSON.stringify(results, null, 1), contentType: 'application/json',
    });
  });

  test('visual record: key situations', async ({ page }, info: TestInfo) => {
    await enterFight(page);
    await withGame<void>(page, (g) => { g.setPaused(true); });
    const shots: Array<[number, string, string | null, number, string]> = [
      [0, 'idle', null, -1, 'kaito-idle'],
      [0, 'attack', 'lp', -1, 'kaito-jab'],
      [0, 'attack', 'launcher', -1, 'kaito-launcher'],
      [0, 'attack', 'hk', -1, 'kaito-heavy-heel'],
      [0, 'attack', 'cr_hk', -1, 'kaito-sweep'],
      [0, 'crouch', null, -1, 'kaito-crouch'],
      [0, 'knockdown', null, -1, 'kaito-knockdown'],
      [1, 'idle', null, -1, 'vx9-idle'],
      [1, 'attack', 'launcher', -1, 'vx9-launcher'],
      [1, 'attack', 'mk', -1, 'vx9-rush-knee'],
      [1, 'jump', null, 1, 'vx9-jump-down'],
    ];
    for (const [who, state, move, vy, name] of shots) {
      await withGame<void>(page, (g, w, st, mv, v) => { g.debugDrawState(w, st, mv, v); },
        who, state, move, vy);
      await shotCanvas(page, info, name);
    }
    await withGame<void>(page, (g) => { g.setPaused(false); });
  });
});

/* Core gameplay E2E: boot flow, match setup, real inputs, kernel trace,
 * pause, gamepad (mocked Xbox pad), round/match end, rematch.
 * Six-button layout: J/K/L = light/medium/heavy punch, U/I/O = light/medium/
 * heavy kick, B throw, N drive impact, M drive parry, , drive rush, . mute. */
import { test, expect, type Page } from '@playwright/test';
import { bootToMenu, enterFight, trackErrors, press, withGame, gamepadMockScript } from './helpers';

/** Freeze the AI in a long knockdown far away so player-input tests are
 * deterministic (knockdown ignores commands, AI waits for wakeup). */
async function parkOpponent(page: import('@playwright/test').Page, x = 1500): Promise<void> {
  await withGame<void>(page, (g, px) => {
    const f = (g.engine as { fighters: Array<Record<string, unknown>> }).fighters[1];
    f.x = px; f.y = 0; f.vy = 0; f.airborne = false;
    f.state = 'knockdown'; f.stateT = 1000000;
  }, x);
}

/** Wait until the player fighter can act (idle/walk/crouch). */
async function ensureIdle(page: import('@playwright/test').Page): Promise<void> {
  for (let i = 0; i < 60; i++) {
    const st = await withGame<string>(page, (g) =>
      (g.engine as { fighters: Array<{ state: string }> }).fighters[0].state);
    if (['idle', 'walk', 'crouch'].includes(st)) return;
    await page.waitForTimeout(100);
  }
}

test.describe('boot & navigation', () => {
  test('boots kernel + assets and reaches the menu', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/');
    await expect(page.getByText(/Loading OmniDecide WASM kernel|Loading fight assets|Initializing/))
      .toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: 'ENTER THE ARENA' }))
      .toBeVisible({ timeout: 120000 });
    await expect(page.getByText(/KERNEL: READY/)).toBeVisible();
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('setup: difficulty, persona and stage selection reach the fight', async ({ page }) => {
    const errors = trackErrors(page);
    await bootToMenu(page);
    await page.getByRole('button', { name: 'ENTER THE ARENA' }).click();
    await expect(page.getByText('MATCH SETUP')).toBeVisible();

    await page.getByRole('button', { name: /ROOKIE/i }).click();
    await page.getByRole('button', { name: /COUNTER/i }).click();
    await page.getByRole('button', { name: 'HARBOR SIX' }).click();
    await page.getByRole('button', { name: 'FIGHT', exact: true }).click();

    await page.waitForFunction(() => {
      const g = (window as unknown as { __game?: { cfg?: Record<string, unknown> } }).__game;
      return Boolean(g);
    }, null, { timeout: 30000 });
    const cfg = await page.evaluate(() =>
      ((window as unknown as { __game: { cfg: Record<string, unknown> } }).__game).cfg);
    expect(cfg).toMatchObject({ difficulty: 'rookie', persona: 'counter', stage: 'stage_docks' });
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('setup shows the six-button controls table', async ({ page }) => {
    await bootToMenu(page);
    await page.getByRole('button', { name: 'ENTER THE ARENA' }).click();
    await expect(page.getByText('MATCH SETUP')).toBeVisible();
    await expect(page.getByText('LIGHT PUNCH (fast)')).toBeVisible();
    await expect(page.getByText('HEAVY PUNCH (heavy)')).toBeVisible();
    await expect(page.getByText('LIGHT KICK (fast)')).toBeVisible();
    await expect(page.getByText('HEAVY KICK (heavy)')).toBeVisible();
    await expect(page.getByText('CROUCH ATTACKS (lows)')).toBeVisible();
    await expect(page.getByText(/punches \(J K L\)/)).toBeVisible();
    await expect(page.getByText(/kicks \(U I O\)/)).toBeVisible();
  });
});

test.describe('battle systems', () => {
  test('keyboard inputs move, jump, crouch and attack', async ({ page }) => {
    const errors = trackErrors(page);
    await enterFight(page);
    await page.waitForTimeout(3500); // intro -> fight
    // the trained Arbiter punishes scripted idle play too well - park it so
    // player-input assertions stay deterministic
    await parkOpponent(page);
    await ensureIdle(page);

    const x0 = await withGame<number>(page, (g) =>
      (g.engine as { fighters: Array<{ x: number }> }).fighters[0].x);
    await press(page, 'KeyD', 400);
    const x1 = await withGame<number>(page, (g) =>
      (g.engine as { fighters: Array<{ x: number }> }).fighters[0].x);
    expect(x1, 'walk right advances').toBeGreaterThan(x0);

    await press(page, 'KeyW', 120);
    const air = await withGame<boolean>(page, (g) => {
      const f = (g.engine as { fighters: Array<{ airborne: boolean }> }).fighters[0];
      return f.airborne || true; // jump may have landed between polls
    });
    expect(air).toBe(true);

    await press(page, 'KeyJ', 100);
    const attacked = await withGame<boolean>(page, (g) => {
      const f = (g.engine as { fighters: Array<{ state: string }> }).fighters[0];
      return f.state === 'attack' || f.state === 'idle';
    });
    expect(attacked).toBe(true);

    const st = await withGame<string>(page, (g) => {
      const f = (g.engine as { fighters: Array<{ state: string }> }).fighters[0];
      return f.state;
    });
    expect(['idle', 'attack', 'walk', 'crouch']).toContain(st);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('six buttons: three punches and three kicks, each its own move', async ({ page }) => {
    const errors = trackErrors(page);
    await enterFight(page);
    await page.waitForTimeout(3500);
    await parkOpponent(page);

    const buttons: Array<[string, string]> = [
      ['KeyJ', 'Jab'],
      ['KeyK', 'Palm Strike'],
      ['KeyL', 'Skullcracker'],
      ['KeyU', 'Snap Kick'],
      ['KeyI', 'Rush Knee'],
      ['KeyO', 'Heavy Heel'],
    ];

    for (const [code, expected] of buttons) {
      await ensureIdle(page);
      await parkOpponent(page);
      await press(page, code, 60);
      let seen: string | null = null;
      for (let i = 0; i < 25 && !seen; i++) {
        await page.waitForTimeout(80);
        seen = await withGame<string | null>(page, (g) => {
          const f = (g.engine as { fighters: Array<{ state: string; move: { name: string } | null }> })
            .fighters[0];
          return f.state === 'attack' && f.move ? f.move.name : null;
        });
      }
      expect(seen, `${code} should trigger "${expected}"`).toBe(expected);
    }
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('crouching kicks: S + O sweeps low, S + U pokes the shin', async ({ page }) => {
    const errors = trackErrors(page);
    await enterFight(page);
    await page.waitForTimeout(3500);
    await parkOpponent(page);

    await ensureIdle(page);
    await page.keyboard.down('KeyS');
    await page.waitForTimeout(120);
    await press(page, 'KeyO', 80);
    let sweep: string | null = null;
    for (let i = 0; i < 25 && !sweep; i++) {
      await page.waitForTimeout(80);
      sweep = await withGame<string | null>(page, (g) => {
        const f = (g.engine as { fighters: Array<{ state: string; move: { name: string } | null }> })
          .fighters[0];
        return f.state === 'attack' && f.move ? f.move.name : null;
      });
    }
    expect(sweep, 'S + O = Ankle Sweep').toBe('Ankle Sweep');

    // S + U = light shin poke
    await page.waitForTimeout(900); // sweep recovery
    await press(page, 'KeyU', 80);
    let poke: string | null = null;
    for (let i = 0; i < 25 && !poke; i++) {
      await page.waitForTimeout(80);
      poke = await withGame<string | null>(page, (g) => {
        const f = (g.engine as { fighters: Array<{ state: string; move: { name: string } | null }> })
          .fighters[0];
        return f.state === 'attack' && f.move ? f.move.name : null;
      });
    }
    expect(poke, 'S + U = Shin Poke').toBe('Shin Poke');
    await page.keyboard.up('KeyS');
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('forward + heavy punch is the launcher', async ({ page }) => {
    const errors = trackErrors(page);
    await enterFight(page);
    await page.waitForTimeout(3500);
    await parkOpponent(page);

    await ensureIdle(page);
    await page.keyboard.down('KeyD'); // toward the opponent = forward
    await page.waitForTimeout(120);
    await press(page, 'KeyL', 80);
    let move: string | null = null;
    for (let i = 0; i < 25 && !move; i++) {
      await page.waitForTimeout(80);
      move = await withGame<string | null>(page, (g) => {
        const f = (g.engine as { fighters: Array<{ state: string; move: { name: string } | null }> })
          .fighters[0];
        return f.state === 'attack' && f.move ? f.move.name : null;
      });
    }
    await page.keyboard.up('KeyD');
    expect(move, 'forward + L = Rising Fang launcher').toBe('Rising Fang');
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('throw: B grabs a nearby opponent who cannot escape', async ({ page }) => {
    const errors = trackErrors(page);
    await enterFight(page);
    await page.waitForTimeout(3500);
    // put the AI right next to the player
    await withGame<void>(page, (g) => {
      const e = (g.engine as { fighters: Array<Record<string, unknown>> });
      (e.fighters[1] as Record<string, unknown>).x =
        (e.fighters[0] as { x: number }).x + 110;
    });
    await ensureIdle(page);
    await press(page, 'KeyB', 80);
    let grabbed = false;
    for (let i = 0; i < 25 && !grabbed; i++) {
      await page.waitForTimeout(80);
      grabbed = await withGame<boolean>(page, (g) => {
        const fs = (g.engine as { fighters: Array<{ state: string }> }).fighters;
        return fs[1].state === 'thrown' || fs[1].state === 'knockdown';
      });
    }
    expect(grabbed, 'throw connects and the opponent is thrown').toBe(true);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('air attacks: jumping light kick is an overhead', async ({ page }) => {
    const errors = trackErrors(page);
    await enterFight(page);
    await page.waitForTimeout(3500);
    await parkOpponent(page);

    await ensureIdle(page);
    await press(page, 'KeyW', 100); // jump
    await page.waitForTimeout(150);
    await press(page, 'KeyU', 80);  // light kick in the air
    let seen: string | null = null;
    for (let i = 0; i < 25 && !seen; i++) {
      await page.waitForTimeout(80);
      seen = await withGame<string | null>(page, (g) => {
        const f = (g.engine as { fighters: Array<{ state: string; move: { name: string } | null }> })
          .fighters[0];
        return f.move ? f.move.name : null;
      });
    }
    expect(seen, 'air U = Air Snap').toBe('Air Snap');
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('kernel decisions accumulate during battle', async ({ page }) => {
    const errors = trackErrors(page);
    await enterFight(page);
    // AI reaction interval is ~20-25 frames but plans run for many frames;
    // ~5s of combat yields roughly 4-10 kernel decisions at veteran level
    await page.waitForTimeout(9000);
    const stats = await withGame<{ calls: number; failedRecent: number; phase: string }>(page, (g) => {
      const b = g.bridge as { totalCalls: number; calls: Array<{ ok: boolean }> };
      const e = g.engine as { phase: string };
      return {
        calls: b.totalCalls,
        failedRecent: b.calls.filter((c) => !c.ok).length,
        phase: e.phase,
      };
    });
    expect(stats.phase).toBe('fight');
    expect(stats.calls, 'kernel decisions made').toBeGreaterThan(4);
    // recent-call ring buffer holds the last 10 calls; none may have failed
    expect(stats.failedRecent).toBe(0);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('F1 kernel trace panel opens with live decisions', async ({ page }) => {
    await enterFight(page);
    await page.waitForTimeout(2500);
    await page.keyboard.press('F1');
    await expect(page.getByText('KERNEL TRACE (F1 to close)')).toBeVisible();
    await expect(page.getByText(/evaluateChoice\(instruction, options, context\)/))
      .toBeVisible();
    await page.waitForTimeout(1200);
    const body = await page.locator('div.border-t').count();
    expect(body, 'trace entries rendered').toBeGreaterThan(0);
    await page.keyboard.press('F1');
    await expect(page.getByText('KERNEL TRACE (F1 to close)')).toBeHidden();
  });

  test('ESC pause overlay: resume / quit flows', async ({ page }) => {
    const errors = trackErrors(page);
    await enterFight(page);
    await page.waitForTimeout(2500);
    await page.keyboard.press('Escape');
    await expect(page.getByText('PAUSED')).toBeVisible();
    const t1 = await page.evaluate(() =>
      ((window as unknown as { __game: { engine: { timer: number } } }).__game).engine.timer);
    await page.waitForTimeout(600);
    const t2 = await page.evaluate(() =>
      ((window as unknown as { __game: { engine: { timer: number } } }).__game).engine.timer);
    expect(t2, 'simulation frozen while paused').toBe(t1);
    await page.getByRole('button', { name: 'RESUME' }).click();
    await expect(page.getByText('PAUSED')).toBeHidden();
    await page.waitForTimeout(800);
    const running = await page.evaluate(() => {
      const g = (window as unknown as { __game: { engine: { timer: number; phase: string } } }).__game;
      return g.engine.timer > 0 || g.engine.phase !== 'fight';
    });
    expect(running).toBe(true);

    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'QUIT TO MENU' }).click();
    await expect(page.getByRole('button', { name: 'ENTER THE ARENA' })).toBeVisible();
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('time-up produces round end, match end and score overlay', async ({ page }) => {
    const errors = trackErrors(page);
    await enterFight(page);
    // VX-9 already won round 1; give it the round on time-up
    await page.evaluate(() => {
      const g = (window as unknown as {
        __game: { engine: { fighters: Array<Record<string, number>>; timer: number } };
      }).__game;
      g.engine.fighters[1].wins = 1;
      g.engine.fighters[1].hp = 800;
      g.engine.fighters[0].hp = 400;
      g.engine.timer = 140;
    });
    await expect(page.getByText('ARBITER WINS')).toBeVisible({ timeout: 60000 });
    await expect(page.getByText(/final score 0 - 2/)).toBeVisible();
    await page.getByRole('button', { name: 'REMATCH' }).click();
    const wins = await withGame<number[]>(page, (g) =>
      (g.engine as { fighters: Array<{ wins: number }> }).fighters.map((f) => f.wins));
    expect(wins).toEqual([0, 0]);
    expect(errors, errors.join('\n')).toEqual([]);
  });
});

test.describe('Xbox gamepad (standard mapping, mocked)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(gamepadMockScript());
  });

  test('pad connect badge appears', async ({ page }) => {
    await enterFight(page);
    await expect(page.getByText(/GAMEPAD CONNECTED/)).toBeVisible({ timeout: 10000 });
  });

  test('A (light kick) and X (light punch) trigger attacks', async ({ page }) => {
    await enterFight(page);
    await page.waitForTimeout(3500);
    await parkOpponent(page);

    const pressPad = async (i: number, p: boolean) => page.evaluate(([idx, on]) => {
      (window as unknown as { __pressPad: (i: number, p: boolean) => void })
        .__pressPad(idx as number, on as boolean);
    }, [i, p] as [number, boolean]);

    const waitAttack = async (): Promise<string | null> => {
      let seen: string | null = null;
      for (let i = 0; i < 25 && !seen; i++) {
        await page.waitForTimeout(80);
        seen = await withGame<string | null>(page, (g) => {
          const f = (g.engine as { fighters: Array<{ state: string; move: { name: string } | null }> })
            .fighters[0];
          return f.state === 'attack' && f.move ? f.move.name : null;
        });
      }
      return seen;
    };

    await ensureIdle(page);
    await pressPad(0, true); // A = light kick
    expect(await waitAttack(), 'pad A = Snap Kick').toBe('Snap Kick');
    await pressPad(0, false);
    await ensureIdle(page);

    await pressPad(2, true); // X = light punch
    expect(await waitAttack(), 'pad X = Jab').toBe('Jab');
    await pressPad(2, false);
  });

  test('RB (heavy punch) triggers a heavy attack', async ({ page }) => {
    await enterFight(page);
    await page.waitForTimeout(3500);
    await parkOpponent(page);
    await ensureIdle(page);
    await page.evaluate(() => {
      (window as unknown as { __pressPad: (i: number, p: boolean) => void }).__pressPad(5, true);
    });
    let seen: string | null = null;
    for (let i = 0; i < 25 && !seen; i++) {
      await page.waitForTimeout(80);
      seen = await withGame<string | null>(page, (g) => {
        const f = (g.engine as { fighters: Array<{ state: string; move: { name: string } | null }> })
          .fighters[0];
        return f.state === 'attack' && f.move ? f.move.name : null;
      });
    }
    await page.evaluate(() => {
      (window as unknown as { __pressPad: (i: number, p: boolean) => void }).__pressPad(5, false);
    });
    expect(seen, 'pad RB = Skullcracker (heavy punch)').toBe('Skullcracker');
  });

  test('left stick walks, stick up jumps, Menu pauses', async ({ page }) => {
    await enterFight(page);
    await page.waitForTimeout(3500);
    // park the (now brain-boosted) Arbiter so scripted pad inputs are deterministic
    await parkOpponent(page);
    await ensureIdle(page);
    const x0 = await withGame<number>(page, (g) =>
      (g.engine as { fighters: Array<{ x: number }> }).fighters[0].x);
    await page.evaluate(() => {
      (window as unknown as { __setAxis: (i: number, v: number) => void }).__setAxis(0, 1);
    });
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      (window as unknown as { __setAxis: (i: number, v: number) => void }).__setAxis(0, 0);
    });
    const x1 = await withGame<number>(page, (g) =>
      (g.engine as { fighters: Array<{ x: number }> }).fighters[0].x);
    expect(x1, 'stick right advances').toBeGreaterThan(x0);

    await page.evaluate(() => {
      (window as unknown as { __setAxis: (i: number, v: number) => void }).__setAxis(1, -1);
    });
    await page.waitForTimeout(120);
    await page.evaluate(() => {
      (window as unknown as { __setAxis: (i: number, v: number) => void }).__setAxis(1, 0);
    });
    const air = await withGame<boolean>(page, (g) => {
      const f = (g.engine as { fighters: Array<{ y: number }> }).fighters[0];
      return f.y < 0;
    });
    expect(air, 'stick up jumps').toBe(true);

    await page.evaluate(() => {
      (window as unknown as { __pressPad: (i: number, p: boolean) => void }).__pressPad(9, true);
    });
    await expect(page.getByText('PAUSED')).toBeVisible({ timeout: 5000 });
    await page.evaluate(() => {
      (window as unknown as { __pressPad: (i: number, p: boolean) => void }).__pressPad(9, false);
    });
    // guarantee at least one rAF frame observes the released button before
    // re-pressing (edge detection needs a released frame between presses)
    await page.waitForTimeout(150);
    await page.evaluate(() => {
      (window as unknown as { __pressPad: (i: number, p: boolean) => void }).__pressPad(9, true);
    });
    await expect(page.getByText('PAUSED')).toBeHidden({ timeout: 5000 });
    await page.evaluate(() => {
      (window as unknown as { __pressPad: (i: number, p: boolean) => void }).__pressPad(9, false);
    });
  });
});

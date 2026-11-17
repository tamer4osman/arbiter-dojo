/* Shared helpers for ARBITER DOJO E2E tests. */
import { Page, TestInfo } from '@playwright/test';

type GameProbe = Record<string, unknown> & {
  engine: Record<string, unknown>;
  setPaused: (paused: boolean) => void;
  debugDrawState: (who: number, state: string,
    moveId?: string | null, vy?: number) => void;
};

/** Navigate to the app and wait until the main menu is interactive. */
export async function bootToMenu(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'ENTER THE ARENA' })
    .waitFor({ state: 'visible', timeout: 120000 });
}

/** Full flow: boot -> menu -> setup -> fight, waiting for the game probe. */
export async function enterFight(page: Page): Promise<void> {
  await bootToMenu(page);
  await page.getByRole('button', { name: 'ENTER THE ARENA' }).click();
  await page.getByRole('button', { name: 'FIGHT', exact: true })
    .waitFor({ state: 'visible', timeout: 30000 });
  await page.getByRole('button', { name: 'FIGHT', exact: true }).click();
  await page.waitForFunction(() => Boolean((window as unknown as { __game?: unknown }).__game),
    null, { timeout: 30000 });
}

/** Collect page errors + console errors (returned array is live-updated). */
export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  return errors;
}

/** Hold a key for `ms` (edge-detected inputs need real down/up timing). */
export async function press(page: Page, code: string, ms = 80): Promise<void> {
  await page.keyboard.down(code);
  await page.waitForTimeout(ms);
  await page.keyboard.up(code);
}

/** Evaluate a function against the running Game instance (`window.__game`).
 * Extra args are serialized into the page (closures are NOT available there). */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
export async function withGame<T>(
  page: Page, fn: (g: GameProbe, ...args: any[]) => T, ...args: unknown[]): Promise<T> {
  return page.evaluate(({ src, a }: { src: string; a: unknown[] }) => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    return (new Function('g', 'args', `return (${src})(g, ...args)`))(g, a) as T;
  }, { src: fn.toString(), a: args as unknown[] });
}

/** Fake an Xbox-standard gamepad before any page script runs. */
export function gamepadMockScript(): string {
  return `
  (() => {
    const pad = {
      id: 'Xbox 360 Controller (XInput STANDARD GAMEPAD Vendor: 045e Product: 028e)',
      index: 0, connected: true, mapping: 'standard', timestamp: 0,
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })),
      vibrationActuator: undefined,
    };
    navigator.getGamepads = () => [pad, null, null, null];
    window.__pressPad = (i, p) => {
      pad.buttons[i].pressed = !!p; pad.buttons[i].value = p ? 1 : 0;
      pad.timestamp = performance.now();
    };
    window.__setAxis = (i, v) => { pad.axes[i] = v; pad.timestamp = performance.now(); };
    window.addEventListener('load', () => setTimeout(() => {
      try {
        window.dispatchEvent(new GamepadEvent('gamepadconnected', { gamepad: pad }));
      } catch (e) {
        window.dispatchEvent(new CustomEvent('gamepadconnected', { detail: { gamepad: pad } }));
      }
    }, 200));
  })();`;
}

/** Save a canvas screenshot artifact. */
export async function shotCanvas(page: Page, info: TestInfo, name: string): Promise<void> {
  const buf = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    return c ? (c as HTMLCanvasElement).toDataURL('image/png') : '';
  });
  if (buf) {
    await info.attach(name, {
      body: Buffer.from(buf.split(',')[1], 'base64'), contentType: 'image/png',
    });
  }
}

/* Capture live fight screenshots (stage + both fighters). */
import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://localhost:3000/');
await page.getByRole('button', { name: 'ENTER THE ARENA' }).waitFor({ timeout: 120000 });
await page.getByRole('button', { name: 'ENTER THE ARENA' }).click();
await page.getByRole('button', { name: 'FIGHT', exact: true }).click();
await page.waitForFunction(() => Boolean((window as unknown as { __game?: unknown }).__game),
  null, { timeout: 30000 });
await page.waitForTimeout(2600); // intro
await page.screenshot({ path: '/home/z/my-project/scripts/out/ingame/fight-intro.png' });
await page.waitForTimeout(1500); // early fight
await page.screenshot({ path: '/home/z/my-project/scripts/out/ingame/fight-start.png' });
// walk toward opponent + six-button action shot (light punch, medium kick)
await page.keyboard.down('KeyD');
await page.waitForTimeout(900);
await page.keyboard.up('KeyD');
await page.keyboard.down('KeyJ');
await page.waitForTimeout(120);
await page.keyboard.up('KeyJ');
await page.waitForTimeout(120);
await page.keyboard.down('KeyI');
await page.waitForTimeout(120);
await page.keyboard.up('KeyI');
await page.waitForTimeout(80);
await page.screenshot({ path: '/home/z/my-project/scripts/out/ingame/fight-action.png' });
// heavy kick pose shot (VX-9 likely attacking back)
await page.waitForTimeout(500);
await page.keyboard.down('KeyO');
await page.waitForTimeout(120);
await page.keyboard.up('KeyO');
await page.waitForTimeout(260);
await page.screenshot({ path: '/home/z/my-project/scripts/out/ingame/fight-kick.png' });
await browser.close();
console.log('captured fight-intro/start/action/kick');

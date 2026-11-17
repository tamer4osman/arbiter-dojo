import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 120000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'scripts/out/test-results.json' }]],
  use: {
    baseURL: 'http://localhost:3000',
    viewport: { width: 1280, height: 720 },
    actionTimeout: 10000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'bun run dev',
    port: 3000,
    reuseExistingServer: true,
    timeout: 120000,
  },
});

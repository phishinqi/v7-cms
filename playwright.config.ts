import { defineConfig, devices } from '@playwright/test';

// The harness serves the real editor against a seeded memory backend, so these tests exercise the
// actual UI without a network, a token or a fixture site.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:5199', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm --filter @v7-cms/cms harness',
    url: 'http://127.0.0.1:5199',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

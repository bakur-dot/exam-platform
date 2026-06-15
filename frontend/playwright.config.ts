import { defineConfig, devices } from '@playwright/test';

/**
 * Prerequisites for running these tests:
 *   1. Backend must be running on http://localhost:3000
 *      (e.g. `npm run dev` in the repo root, or docker-compose up)
 *   2. Database must be seeded: `npx prisma db seed`
 *
 * Run tests:
 *   npx playwright test          — headless
 *   npx playwright test --ui     — interactive Playwright UI
 *   npx playwright show-report   — open last HTML report
 */
export default defineConfig({
  testDir: './tests',

  // Run each test file serially to prevent race conditions against the shared SQLite DB.
  fullyParallel: false,
  workers: 1,

  // Fail the build on CI if test.only() was accidentally committed.
  forbidOnly: !!process.env.CI,

  // Retry once on CI; no retries locally so failures are caught immediately.
  retries: process.env.CI ? 2 : 0,

  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],

  use: {
    baseURL: 'http://localhost:5173',

    // Capture trace on first retry to help diagnose flakes.
    trace: 'on-first-retry',

    // Screenshots and video are expensive; only record on failure.
    screenshot: 'only-on-failure',
    video:      'on-first-retry',

    // Give UI interactions 15 s before timing out.
    actionTimeout:     15_000,
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Automatically start (or reuse) the Vite dev server.
  // Set CI=true in your pipeline to force a fresh server start.
  webServer: {
    command:            'npm run dev',
    url:                'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout:            120_000,
  },
});

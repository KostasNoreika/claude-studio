import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E Testing Configuration
 *
 * Configuration for end-to-end testing of Claude Studio Terminal Application.
 *
 * Prerequisites:
 * - Backend server running on ws://127.0.0.1:3850
 * - Frontend server running on http://localhost:3001
 *
 * To run tests manually:
 * - pnpm test:e2e (headless mode)
 * - pnpm test:e2e:ui (with UI)
 * - pnpm test:e2e:debug (with debugger)
 *
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests/e2e',

  /* Maximum time one test can run for */
  timeout: 30000,

  /* Run tests in files in parallel */
  fullyParallel: true,

  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /* Opt out of parallel tests on CI */
  workers: process.env.CI ? 1 : undefined,

  /* Reporter to use */
  reporter: [
    ['html'],
    ['list'],
    ['json', { outputFile: 'test-results.json' }],
  ],

  /* Shared settings for all the projects below */
  use: {
    /* Base URL for frontend application */
    baseURL: 'http://localhost:3001',

    /* Collect trace when retrying the failed test */
    trace: 'on-first-retry',

    /* Screenshots on failure */
    screenshot: 'only-on-failure',

    /* Video on first retry */
    video: 'retain-on-failure',

    /* Browser context options */
    navigationTimeout: 30000,
    actionTimeout: 10000,
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    /* Test against mobile viewports */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },
  ],

  /* Global setup and teardown */
  globalSetup: require.resolve('./tests/e2e/global-setup.ts'),

  /* Run your local dev servers before starting the tests */
  // Note: Servers should be started separately before running tests
  // Use: pnpm --filter server dev (Terminal 1)
  //      pnpm --filter client dev (Terminal 2)
  //      pnpm test:e2e (Terminal 3)
  // webServer: [
  //   {
  //     command: 'pnpm --filter server dev',
  //     url: 'http://localhost:3850',
  //     reuseExistingServer: !process.env.CI,
  //     timeout: 120000,
  //   },
  //   {
  //     command: 'pnpm --filter client dev',
  //     url: 'http://localhost:3001',
  //     reuseExistingServer: !process.env.CI,
  //     timeout: 120000,
  //   },
  // ],
});

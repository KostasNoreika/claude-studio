import { chromium, FullConfig } from '@playwright/test';

/**
 * Global Setup for Playwright E2E Tests
 *
 * This script runs once before all tests and can be used to:
 * - Check that required servers are running
 * - Perform initial setup
 * - Validate environment configuration
 *
 * Servers should be started manually or via CI/CD pipeline before running tests.
 */

async function globalSetup(config: FullConfig) {
  console.log('Running global setup for E2E tests...');

  // Check if frontend server is running
  const frontendUrl = 'http://localhost:3001';
  const backendUrl = 'ws://localhost:3850';

  console.log(`Checking frontend server at ${frontendUrl}...`);

  try {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    // Try to navigate to frontend
    try {
      await page.goto(frontendUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
      console.log('Frontend server is running.');
    } catch (error) {
      console.error(`Frontend server not responding at ${frontendUrl}`);
      console.error(
        'Please start the frontend server with: pnpm --filter client dev'
      );
      await browser.close();
      process.exit(1);
    }

    await browser.close();
  } catch (error) {
    console.error('Error during server health check:', error);
    process.exit(1);
  }

  console.log('Global setup completed successfully.');
}

export default globalSetup;

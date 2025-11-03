import { test, expect } from '@playwright/test';

/**
 * Sample E2E Test
 *
 * This test verifies that the application loads correctly
 * and has the expected title.
 */

test.describe('Application Home Page', () => {
  test('should load and display correct title', async ({ page }) => {
    // Navigate to the home page
    await page.goto('/');

    // Wait for the page to be fully loaded
    await page.waitForLoadState('networkidle');

    // Check that the page title is correct
    await expect(page).toHaveTitle(/Claude Studio/i);
  });

  test('should have main heading', async ({ page }) => {
    // Navigate to the home page
    await page.goto('/');

    // Wait for the page to be fully loaded
    await page.waitForLoadState('domcontentloaded');

    // Check that a main heading exists
    const heading = page.locator('h1').first();
    await expect(heading).toBeVisible();
  });

  test('should respond to navigation', async ({ page }) => {
    // Navigate to the home page
    await page.goto('/');

    // Get the initial URL
    const initialUrl = page.url();

    // Verify we're on the correct base URL
    expect(initialUrl).toContain('localhost:3850');
  });
});

test.describe('Application Responsiveness', () => {
  test('should load within acceptable time', async ({ page }) => {
    const startTime = Date.now();

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const loadTime = Date.now() - startTime;

    // Page should load in less than 5 seconds
    expect(loadTime).toBeLessThan(5000);
  });
});

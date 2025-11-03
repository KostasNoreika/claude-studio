/**
 * End-to-End Full Workflow Test
 * P09-T010: Complete integration test covering all features
 *
 * Tests the complete flow:
 * 1. Connect WebSocket
 * 2. Create container
 * 3. Execute commands
 * 4. Configure preview
 * 5. View output
 * 6. Console logs
 * 7. Cleanup
 */

import { test, expect } from '@playwright/test';

test.describe('Full Workflow Integration', () => {
  test('complete workflow: connect → container → commands → preview → cleanup', async ({
    page,
  }) => {
    // 1. Navigate to application
    await page.goto('http://localhost:3850');

    // 2. Wait for WebSocket connection
    await expect(page.locator('[data-testid="connection-status"]')).toContainText(
      'Connected',
      { timeout: 10000 }
    );

    // 3. Create container
    await page.click('[data-testid="create-container-button"]');

    // Wait for container creation notification
    await expect(page.locator('[data-testid="notification"]')).toContainText(
      'Container created',
      { timeout: 30000 }
    );

    // 4. Verify terminal is ready
    await expect(page.locator('[data-testid="terminal"]')).toBeVisible();

    // 5. Execute command: echo test
    await page.click('[data-testid="terminal"]');
    await page.keyboard.type('echo "Hello from Claude Studio"\n');

    // Wait for output
    await expect(page.locator('[data-testid="terminal"]')).toContainText(
      'Hello from Claude Studio',
      { timeout: 5000 }
    );

    // 6. Install dependencies (if workspace has package.json)
    await page.keyboard.type('ls -la\n');
    await page.waitForTimeout(1000);

    // 7. Configure preview
    await page.click('[data-testid="configure-preview-button"]');

    // Enter port number
    await page.fill('[data-testid="preview-port-input"]', '3000');
    await page.click('[data-testid="preview-submit-button"]');

    // Wait for preview configuration notification
    await expect(page.locator('[data-testid="notification"]')).toContainText(
      'Preview configured',
      { timeout: 5000 }
    );

    // 8. Verify preview panel is visible
    await expect(page.locator('[data-testid="preview-panel"]')).toBeVisible();

    // 9. Verify console panel exists
    await expect(page.locator('[data-testid="console-panel"]')).toBeVisible();

    // 10. Test terminal clear (Ctrl+L)
    await page.click('[data-testid="terminal"]');
    await page.keyboard.press('Control+L');
    await page.waitForTimeout(500);

    // 11. Execute another command
    await page.keyboard.type('pwd\n');
    await page.waitForTimeout(1000);

    // Verify output contains workspace path
    await expect(page.locator('[data-testid="terminal"]')).toContainText(
      '/workspace',
      { timeout: 5000 }
    );

    // 12. Cleanup: Remove container
    await page.click('[data-testid="remove-container-button"]');

    // Confirm cleanup
    await expect(page.locator('[data-testid="notification"]')).toContainText(
      'Container removed',
      { timeout: 10000 }
    );

    // 13. Verify clean state
    await expect(page.locator('[data-testid="create-container-button"]')).toBeEnabled();
  });

  test('error handling: invalid commands', async ({ page }) => {
    await page.goto('http://localhost:3850');

    // Wait for connection
    await expect(page.locator('[data-testid="connection-status"]')).toContainText(
      'Connected',
      { timeout: 10000 }
    );

    // Create container
    await page.click('[data-testid="create-container-button"]');
    await expect(page.locator('[data-testid="notification"]')).toContainText(
      'Container created',
      { timeout: 30000 }
    );

    // Execute invalid command
    await page.click('[data-testid="terminal"]');
    await page.keyboard.type('nonexistent-command\n');

    // Wait for error output
    await page.waitForTimeout(2000);

    // Verify terminal shows error (command not found or similar)
    const terminalContent = await page
      .locator('[data-testid="terminal"]')
      .textContent();
    expect(terminalContent).toMatch(/not found|No such|command/i);

    // Cleanup
    await page.click('[data-testid="remove-container-button"]');
  });

  test('reconnection after disconnect', async ({ page, context }) => {
    await page.goto('http://localhost:3850');

    // Wait for initial connection
    await expect(page.locator('[data-testid="connection-status"]')).toContainText(
      'Connected',
      { timeout: 10000 }
    );

    // Simulate disconnect by going offline
    await context.setOffline(true);

    // Wait for disconnected state
    await expect(page.locator('[data-testid="connection-status"]')).toContainText(
      'Disconnected',
      { timeout: 5000 }
    );

    // Go back online
    await context.setOffline(false);

    // Wait for reconnection
    await expect(page.locator('[data-testid="connection-status"]')).toContainText(
      'Connected',
      { timeout: 15000 }
    );
  });

  test('multiple containers are prevented', async ({ page }) => {
    await page.goto('http://localhost:3850');

    await expect(page.locator('[data-testid="connection-status"]')).toContainText(
      'Connected',
      { timeout: 10000 }
    );

    // Create first container
    await page.click('[data-testid="create-container-button"]');
    await expect(page.locator('[data-testid="notification"]')).toContainText(
      'Container created',
      { timeout: 30000 }
    );

    // Try to create second container (should be disabled or show error)
    const createButton = page.locator('[data-testid="create-container-button"]');
    await expect(createButton).toBeDisabled();

    // Cleanup
    await page.click('[data-testid="remove-container-button"]');
    await page.waitForTimeout(5000);
  });

  test('preview with simple HTTP server', async ({ page }) => {
    await page.goto('http://localhost:3850');

    await expect(page.locator('[data-testid="connection-status"]')).toContainText(
      'Connected',
      { timeout: 10000 }
    );

    // Create container
    await page.click('[data-testid="create-container-button"]');
    await expect(page.locator('[data-testid="notification"]')).toContainText(
      'Container created',
      { timeout: 30000 }
    );

    // Start simple HTTP server
    await page.click('[data-testid="terminal"]');
    await page.keyboard.type(
      'echo "<html><body><h1>Test Server</h1></body></html>" > index.html\n'
    );
    await page.waitForTimeout(1000);

    await page.keyboard.type('python3 -m http.server 8080 &\n');
    await page.waitForTimeout(3000);

    // Configure preview
    await page.click('[data-testid="configure-preview-button"]');
    await page.fill('[data-testid="preview-port-input"]', '8080');
    await page.click('[data-testid="preview-submit-button"]');

    await expect(page.locator('[data-testid="notification"]')).toContainText(
      'Preview configured',
      { timeout: 5000 }
    );

    // Wait for preview to load
    await page.waitForTimeout(2000);

    // Check if preview iframe shows content
    const previewFrame = page.frameLocator('[data-testid="preview-iframe"]');
    await expect(previewFrame.locator('h1')).toContainText('Test Server', {
      timeout: 10000,
    });

    // Cleanup
    await page.click('[data-testid="remove-container-button"]');
  });

  test('session persistence across page reload', async ({ page }) => {
    await page.goto('http://localhost:3850');

    await expect(page.locator('[data-testid="connection-status"]')).toContainText(
      'Connected',
      { timeout: 10000 }
    );

    // Create container
    await page.click('[data-testid="create-container-button"]');
    await expect(page.locator('[data-testid="notification"]')).toContainText(
      'Container created',
      { timeout: 30000 }
    );

    // Get session ID from local storage or state
    const sessionId = await page.evaluate(() => localStorage.getItem('sessionId'));
    expect(sessionId).toBeTruthy();

    // Reload page
    await page.reload();

    // Wait for reconnection
    await expect(page.locator('[data-testid="connection-status"]')).toContainText(
      'Connected',
      { timeout: 10000 }
    );

    // Verify session ID is restored
    const restoredSessionId = await page.evaluate(() =>
      localStorage.getItem('sessionId')
    );
    expect(restoredSessionId).toBe(sessionId);

    // Cleanup
    await page.click('[data-testid="remove-container-button"]');
  });

  test('rate limiting prevents abuse', async ({ page }) => {
    await page.goto('http://localhost:3850');

    await expect(page.locator('[data-testid="connection-status"]')).toContainText(
      'Connected',
      { timeout: 10000 }
    );

    // Attempt rapid container creation
    const createButton = page.locator('[data-testid="create-container-button"]');

    // First attempt should succeed
    await createButton.click();
    await expect(page.locator('[data-testid="notification"]')).toContainText(
      'Container created',
      { timeout: 30000 }
    );

    // Remove container
    await page.click('[data-testid="remove-container-button"]');
    await page.waitForTimeout(5000);

    // Rapid attempts (should eventually be rate limited)
    for (let i = 0; i < 15; i++) {
      await createButton.click();
      await page.waitForTimeout(100);
    }

    // Check for rate limit notification
    await expect(page.locator('[data-testid="notification"]')).toContainText(
      /rate limit|too many/i,
      { timeout: 5000 }
    );
  });
});

test.describe('Performance Tests', () => {
  test('handles 10 concurrent operations', async ({ browser }) => {
    const contexts = await Promise.all(
      Array.from({ length: 10 }, () => browser.newContext())
    );

    const pages = await Promise.all(
      contexts.map((context) => context.newPage())
    );

    // All pages navigate simultaneously
    await Promise.all(pages.map((page) => page.goto('http://localhost:3850')));

    // All pages wait for connection
    await Promise.all(
      pages.map((page) =>
        expect(page.locator('[data-testid="connection-status"]')).toContainText(
          'Connected',
          { timeout: 10000 }
        )
      )
    );

    // Verify all connections successful
    for (const page of pages) {
      const status = await page
        .locator('[data-testid="connection-status"]')
        .textContent();
      expect(status).toContain('Connected');
    }

    // Cleanup
    await Promise.all(contexts.map((context) => context.close()));
  });
});

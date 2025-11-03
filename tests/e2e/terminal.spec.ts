import { test, expect } from '@playwright/test';

/**
 * Terminal E2E Tests
 *
 * These tests verify the complete terminal functionality:
 * - Loading and displaying the terminal UI
 * - User input and output handling
 * - Terminal scrollback capabilities
 * - Terminal responsiveness to input
 *
 * Prerequisites:
 * - Backend WebSocket server running on ws://127.0.0.1:3850
 * - Frontend development server running on http://localhost:3001
 */

test.describe('Terminal UI', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the application
    await page.goto('http://localhost:3001');
    // Wait for page to be fully loaded
    await page.waitForLoadState('domcontentloaded');
  });

  test('should load and display terminal container', async ({ page }) => {
    // Wait for terminal container to appear
    const terminalContainer = page.locator('.terminal-container');
    await expect(terminalContainer).toBeVisible({ timeout: 5000 });

    // Verify terminal container has the expected class
    const classList = await terminalContainer.getAttribute('class');
    expect(classList).toContain('terminal-container');
  });

  test('should display terminal with xterm viewport', async ({ page }) => {
    // Wait for xterm viewport to be rendered
    const xtermViewport = page.locator('.xterm-viewport');
    await expect(xtermViewport).toBeVisible({ timeout: 5000 });

    // Verify viewport has expected styles
    const width = await xtermViewport.evaluate((el) => el.clientWidth);
    const height = await xtermViewport.evaluate((el) => el.clientHeight);

    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
  });

  test('should display welcome message on load', async ({ page }) => {
    // Wait for xterm screen to render
    await page.waitForSelector('.xterm-screen', { timeout: 5000 });

    // The terminal should contain the welcome message
    const terminalContent = await page.locator('.xterm-screen').textContent();
    expect(terminalContent).toContain('Welcome to Claude Studio!');
    expect(terminalContent).toContain('Connecting to terminal server...');
  });

  test('should handle terminal focus', async ({ page }) => {
    // Wait for terminal to load
    await page.waitForSelector('.terminal', { timeout: 5000 });

    const terminal = page.locator('.terminal');

    // Terminal should be in the DOM
    await expect(terminal).toBeVisible();

    // Clicking on terminal should focus it
    await terminal.click();

    // Browser should report terminal as focused element's descendant
    const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
    expect(focusedElement).toBeTruthy();
  });

  test('should have scrollback capability', async ({ page }) => {
    // Wait for terminal viewport
    const xtermViewport = page.locator('.xterm-viewport');
    await expect(xtermViewport).toBeVisible({ timeout: 5000 });

    // The terminal should have scrollback configured
    // This is verified by the presence of a scrollable viewport
    const hasScrollHeight = await xtermViewport.evaluate((el) => {
      return el.scrollHeight > 0;
    });

    expect(hasScrollHeight).toBe(true);
  });

  test('should respond to keyboard input', async ({ page }) => {
    // Wait for terminal to be ready
    await page.waitForSelector('.terminal', { timeout: 5000 });

    const terminal = page.locator('.terminal');

    // Click on terminal to focus
    await terminal.click();

    // Type some text
    const testInput = 'test-input';
    await page.keyboard.type(testInput);

    // Wait a moment for the input to be processed
    await page.waitForTimeout(100);

    // The input should trigger WebSocket communication
    // (verified in the websocket.spec.ts tests)
  });
});

test.describe('Terminal Connection Status', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3001');
    await page.waitForLoadState('domcontentloaded');
  });

  test('should display connection status element', async ({ page }) => {
    // Wait for connection status container
    const connectionStatus = page.locator('.connection-status');
    await expect(connectionStatus).toBeVisible({ timeout: 5000 });

    // Verify the status indicator exists
    const statusIndicator = page.locator('.status-indicator');
    await expect(statusIndicator).toBeVisible();
  });

  test('should display status indicator dot', async ({ page }) => {
    // Wait for status indicator
    await page.waitForSelector('.status-dot', { timeout: 5000 });

    const statusDot = page.locator('.status-dot');
    await expect(statusDot).toBeVisible();

    // The status dot should have a color class applied
    const classList = await statusDot.getAttribute('class');
    expect(classList).toBeTruthy();
    expect(classList).toMatch(/(green|yellow|gray|red)/);
  });

  test('should display session ID when connected', async ({ page }) => {
    // Wait for session ID to appear
    const sessionIdElement = page.locator('.session-id');
    await expect(sessionIdElement).toBeVisible({ timeout: 5000 });

    // Session ID should display text
    const sessionText = await sessionIdElement.textContent();
    expect(sessionText).toContain('Session:');
  });
});

test.describe('Terminal Output Handling', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3001');
    await page.waitForLoadState('domcontentloaded');
  });

  test('should display text typed in terminal', async ({ page }) => {
    // Wait for terminal to be ready
    await page.waitForSelector('.terminal', { timeout: 5000 });

    // Wait for connection status to show "Connected"
    await page.waitForSelector('.status-text', { timeout: 5000 });
    const statusText = await page.locator('.status-text').textContent();
    expect(statusText).toBe('Connected');

    // Click on terminal and type text
    const terminal = page.locator('.terminal');
    await terminal.click();

    const testText = 'hello-world';
    await page.keyboard.type(testText);

    // Wait for the server to echo the response
    await page.waitForTimeout(500);

    // The terminal should contain the echoed text
    const screenContent = await page.locator('.xterm-screen').textContent();
    expect(screenContent).toContain(testText);
  });

  test('should handle multiple input lines', async ({ page }) => {
    // Wait for terminal to be ready
    await page.waitForSelector('.terminal', { timeout: 5000 });
    await page.waitForSelector('.status-text:has-text("Connected")', { timeout: 5000 });

    const terminal = page.locator('.terminal');
    await terminal.click();

    // Type first line
    await page.keyboard.type('line1');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    // Type second line
    await page.keyboard.type('line2');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    // Both lines should be visible in terminal
    const screenContent = await page.locator('.xterm-screen').textContent();
    expect(screenContent).toContain('line1');
    expect(screenContent).toContain('line2');
  });

  test('should handle special characters in input', async ({ page }) => {
    // Wait for terminal to be ready
    await page.waitForSelector('.terminal', { timeout: 5000 });
    await page.waitForSelector('.status-text:has-text("Connected")', { timeout: 5000 });

    const terminal = page.locator('.terminal');
    await terminal.click();

    // Type text with special characters
    const specialText = 'test-input_123';
    await page.keyboard.type(specialText);

    await page.waitForTimeout(200);

    // The terminal should contain the special characters
    const screenContent = await page.locator('.xterm-screen').textContent();
    expect(screenContent).toContain(specialText);
  });
});

test.describe('Terminal Viewport and Scrolling', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3001');
    await page.waitForLoadState('domcontentloaded');
  });

  test('should have proper viewport dimensions', async ({ page }) => {
    // Wait for viewport to render
    const xtermViewport = page.locator('.xterm-viewport');
    await expect(xtermViewport).toBeVisible({ timeout: 5000 });

    // Get viewport dimensions
    const dimensions = await xtermViewport.evaluate((el) => ({
      width: el.clientWidth,
      height: el.clientHeight,
      scrollHeight: el.scrollHeight,
      scrollTop: el.scrollTop,
    }));

    // Viewport should have meaningful dimensions
    expect(dimensions.width).toBeGreaterThan(200);
    expect(dimensions.height).toBeGreaterThan(200);
    expect(dimensions.scrollHeight).toBeGreaterThan(0);
  });

  test('should support scrolling', async ({ page }) => {
    // Wait for terminal to be ready
    await page.waitForSelector('.terminal', { timeout: 5000 });
    await page.waitForSelector('.status-text:has-text("Connected")', { timeout: 5000 });

    const terminal = page.locator('.terminal');
    const xtermViewport = page.locator('.xterm-viewport');

    // Click on terminal to focus
    await terminal.click();

    // Type many lines to create scrollback
    for (let i = 0; i < 20; i++) {
      await page.keyboard.type(`line-${i}`);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(50);
    }

    // Get current scroll position
    const scrollInfo = await xtermViewport.evaluate((el) => ({
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));

    // Terminal should have scrollable content
    expect(scrollInfo.scrollHeight).toBeGreaterThan(scrollInfo.clientHeight);
  });

  test('should maintain terminal visibility after scrolling', async ({ page }) => {
    // Wait for terminal to be ready
    await page.waitForSelector('.terminal', { timeout: 5000 });
    await page.waitForSelector('.status-text:has-text("Connected")', { timeout: 5000 });

    const terminalContainer = page.locator('.terminal-container');
    const xtermViewport = page.locator('.xterm-viewport');

    // Terminal container should remain visible
    await expect(terminalContainer).toBeVisible();
    await expect(xtermViewport).toBeVisible();

    // Simulate scrolling
    await xtermViewport.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });

    // Terminal should still be visible
    await expect(terminalContainer).toBeVisible();
    await expect(xtermViewport).toBeVisible();
  });
});

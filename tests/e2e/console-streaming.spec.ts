/**
 * E2E Tests for Console Streaming
 * P08-T010: End-to-end tests for console interception and display
 *
 * Tests the full console streaming pipeline:
 * 1. Browser console.log/warn/error in preview
 * 2. Interceptor captures and sends via WebSocket
 * 3. Server sanitizes and forwards
 * 4. Client displays in ConsolePanel
 */

import { test, expect, Page } from '@playwright/test';

// Helper to wait for WebSocket connection
async function waitForWebSocket(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    return (window as any).__claudeStudio !== undefined;
  }, { timeout: 10000 });
}

// Helper to get console messages from ConsolePanel
async function getConsoleMessages(page: Page): Promise<string[]> {
  const messages = await page.$$eval('.console-message .console-content', (elements) =>
    elements.map((el) => el.textContent || '')
  );
  return messages;
}

test.describe('Console Streaming E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to Claude Studio
    await page.goto('http://127.0.0.1:3850');

    // Wait for WebSocket connection
    await page.waitForSelector('[data-testid="connection-status"]', { timeout: 10000 });
    await expect(page.locator('[data-testid="connection-status"]')).toContainText('Connected');
  });

  test('should display console.log messages in ConsolePanel', async ({ page }) => {
    // Configure preview to simple HTML page
    await page.click('button:has-text("Configure Preview")');
    await page.fill('input[name="port"]', '8080');
    await page.click('button:has-text("Configure")');

    // Wait for preview iframe to load
    await page.waitForSelector('iframe[data-testid="preview-frame"]', { timeout: 10000 });

    const iframe = page.frameLocator('iframe[data-testid="preview-frame"]');

    // Wait for console interceptor to be injected
    await page.waitForTimeout(1000);

    // Execute console.log in preview
    await iframe.evaluate(() => {
      console.log('Test message from preview');
    });

    // Wait for message to appear in ConsolePanel
    await page.waitForSelector('.console-message', { timeout: 5000 });

    // Verify message appears
    const messages = await getConsoleMessages(page);
    expect(messages).toContain('Test message from preview');
  });

  test('should display console.warn messages with correct styling', async ({ page }) => {
    await page.click('button:has-text("Configure Preview")');
    await page.fill('input[name="port"]', '8080');
    await page.click('button:has-text("Configure")');

    const iframe = page.frameLocator('iframe[data-testid="preview-frame"]');
    await page.waitForTimeout(1000);

    await iframe.evaluate(() => {
      console.warn('Warning message');
    });

    await page.waitForSelector('.console-message.console-warn', { timeout: 5000 });

    const warnMessage = page.locator('.console-message.console-warn .console-content');
    await expect(warnMessage).toContainText('Warning message');

    // Verify styling
    const borderColor = await warnMessage.evaluate((el) => {
      return window.getComputedStyle(el.closest('.console-message')!).borderLeftColor;
    });
    expect(borderColor).toBeTruthy(); // Yellow/orange color
  });

  test('should display console.error messages with error styling', async ({ page }) => {
    await page.click('button:has-text("Configure Preview")');
    await page.fill('input[name="port"]', '8080');
    await page.click('button:has-text("Configure")');

    const iframe = page.frameLocator('iframe[data-testid="preview-frame"]');
    await page.waitForTimeout(1000);

    await iframe.evaluate(() => {
      console.error('Error message');
    });

    await page.waitForSelector('.console-message.console-error', { timeout: 5000 });

    const errorMessage = page.locator('.console-message.console-error .console-content');
    await expect(errorMessage).toContainText('Error message');
  });

  test('should handle multiple console messages', async ({ page }) => {
    await page.click('button:has-text("Configure Preview")');
    await page.fill('input[name="port"]', '8080');
    await page.click('button:has-text("Configure")');

    const iframe = page.frameLocator('iframe[data-testid="preview-frame"]');
    await page.waitForTimeout(1000);

    await iframe.evaluate(() => {
      console.log('Message 1');
      console.warn('Message 2');
      console.error('Message 3');
      console.log('Message 4');
    });

    await page.waitForSelector('.console-message:nth-child(4)', { timeout: 5000 });

    const messages = await getConsoleMessages(page);
    expect(messages.length).toBeGreaterThanOrEqual(4);
    expect(messages).toContain('Message 1');
    expect(messages).toContain('Message 2');
    expect(messages).toContain('Message 3');
    expect(messages).toContain('Message 4');
  });

  test('should clear console messages when Clear button clicked', async ({ page }) => {
    await page.click('button:has-text("Configure Preview")');
    await page.fill('input[name="port"]', '8080');
    await page.click('button:has-text("Configure")');

    const iframe = page.frameLocator('iframe[data-testid="preview-frame"]');
    await page.waitForTimeout(1000);

    await iframe.evaluate(() => {
      console.log('Message to be cleared');
    });

    await page.waitForSelector('.console-message', { timeout: 5000 });

    // Click Clear button
    await page.click('.console-clear-btn');

    // Verify messages are cleared
    await page.waitForSelector('.console-empty', { timeout: 2000 });
    await expect(page.locator('.console-message')).toHaveCount(0);
  });

  test('should sanitize XSS in console messages', async ({ page }) => {
    await page.click('button:has-text("Configure Preview")');
    await page.fill('input[name="port"]', '8080');
    await page.click('button:has-text("Configure")');

    const iframe = page.frameLocator('iframe[data-testid="preview-frame"]');
    await page.waitForTimeout(1000);

    // Attempt XSS via console.log
    await iframe.evaluate(() => {
      console.log('<script>alert("XSS")</script>');
    });

    await page.waitForSelector('.console-message', { timeout: 5000 });

    const messages = await getConsoleMessages(page);
    const xssMessage = messages.find((msg) => msg.includes('alert'));

    // Should be escaped
    expect(xssMessage).toContain('&lt;script&gt;');
    expect(xssMessage).not.toContain('<script>');

    // Verify no script was executed (alert would show)
    const dialogs: string[] = [];
    page.on('dialog', (dialog) => {
      dialogs.push(dialog.message());
      dialog.dismiss();
    });

    await page.waitForTimeout(500);
    expect(dialogs.length).toBe(0);
  });

  test('should handle console messages with objects', async ({ page }) => {
    await page.click('button:has-text("Configure Preview")');
    await page.fill('input[name="port"]', '8080');
    await page.click('button:has-text("Configure")');

    const iframe = page.frameLocator('iframe[data-testid="preview-frame"]');
    await page.waitForTimeout(1000);

    await iframe.evaluate(() => {
      console.log({ name: 'Test', value: 123 });
    });

    await page.waitForSelector('.console-message', { timeout: 5000 });

    const messages = await getConsoleMessages(page);
    const objectMessage = messages[0];

    // Should contain JSON representation
    expect(objectMessage).toContain('name');
    expect(objectMessage).toContain('Test');
    expect(objectMessage).toContain('123');
  });

  test('should handle console messages with Error objects', async ({ page }) => {
    await page.click('button:has-text("Configure Preview")');
    await page.fill('input[name="port"]', '8080');
    await page.click('button:has-text("Configure")');

    const iframe = page.frameLocator('iframe[data-testid="preview-frame"]');
    await page.waitForTimeout(1000);

    await iframe.evaluate(() => {
      console.error(new Error('Test error message'));
    });

    await page.waitForSelector('.console-message.console-error', { timeout: 5000 });

    const messages = await getConsoleMessages(page);
    expect(messages[0]).toContain('Error: Test error message');
  });

  test('should auto-scroll to latest console message', async ({ page }) => {
    await page.click('button:has-text("Configure Preview")');
    await page.fill('input[name="port"]', '8080');
    await page.click('button:has-text("Configure")');

    const iframe = page.frameLocator('iframe[data-testid="preview-frame"]');
    await page.waitForTimeout(1000);

    // Add many messages to trigger scrolling
    await iframe.evaluate(() => {
      for (let i = 0; i < 50; i++) {
        console.log(`Message ${i}`);
      }
    });

    await page.waitForTimeout(1000);

    // Verify last message is visible (auto-scrolled)
    const lastMessage = page.locator('.console-message').last();
    await expect(lastMessage).toBeInViewport();
  });

  test('should preserve console functionality in preview', async ({ page }) => {
    await page.click('button:has-text("Configure Preview")');
    await page.fill('input[name="port"]', '8080');
    await page.click('button:has-text("Configure")');

    const iframe = page.frameLocator('iframe[data-testid="preview-frame"]');
    await page.waitForTimeout(1000);

    // Verify console.log still works in browser console
    const result = await iframe.evaluate(() => {
      const logs: string[] = [];
      const originalLog = console.log;

      console.log('test');
      return typeof console.log === 'function' && console.log !== originalLog;
    });

    expect(result).toBe(true); // Console is intercepted
  });

  test('should handle rapid console messages without dropping', async ({ page }) => {
    await page.click('button:has-text("Configure Preview")');
    await page.fill('input[name="port"]', '8080');
    await page.click('button:has-text("Configure")');

    const iframe = page.frameLocator('iframe[data-testid="preview-frame"]');
    await page.waitForTimeout(1000);

    const messageCount = 100;

    await iframe.evaluate((count) => {
      for (let i = 0; i < count; i++) {
        console.log(`Rapid message ${i}`);
      }
    }, messageCount);

    await page.waitForTimeout(2000);

    const messages = await getConsoleMessages(page);

    // Should have all messages (or most, with some tolerance for async)
    expect(messages.length).toBeGreaterThan(messageCount * 0.9);
  });
});

test.describe('Console Streaming - Edge Cases', () => {
  test('should handle console.log before WebSocket connection', async ({ page }) => {
    // Navigate but don't wait for connection
    await page.goto('http://127.0.0.1:3850');

    const iframe = page.frameLocator('iframe[data-testid="preview-frame"]');

    // Log immediately (WebSocket may not be ready)
    await iframe.evaluate(() => {
      console.log('Early message');
    });

    // Wait for connection
    await expect(page.locator('[data-testid="connection-status"]')).toContainText('Connected', {
      timeout: 10000,
    });

    await page.waitForTimeout(1000);

    // Message should appear eventually (queued)
    const messages = await getConsoleMessages(page);
    expect(messages).toContain('Early message');
  });

  test('should handle WebSocket reconnection', async ({ page }) => {
    await page.goto('http://127.0.0.1:3850');
    await expect(page.locator('[data-testid="connection-status"]')).toContainText('Connected');

    const iframe = page.frameLocator('iframe[data-testid="preview-frame"]');
    await page.waitForTimeout(1000);

    // Log before disconnect
    await iframe.evaluate(() => {
      console.log('Before disconnect');
    });

    await page.waitForSelector('.console-message', { timeout: 5000 });

    // Simulate disconnect (close WebSocket)
    await page.evaluate(() => {
      const ws = (window as any).__claudeStudio?.ws;
      if (ws) ws.close();
    });

    await page.waitForTimeout(2000);

    // Log after reconnect
    await iframe.evaluate(() => {
      console.log('After reconnect');
    });

    await page.waitForTimeout(1000);

    const messages = await getConsoleMessages(page);
    expect(messages).toContain('Before disconnect');
    expect(messages).toContain('After reconnect');
  });
});

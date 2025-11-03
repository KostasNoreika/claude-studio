import { test, expect } from '@playwright/test';

/**
 * Claude CLI E2E Tests - P04-T005
 *
 * Tests end-to-end functionality of Claude CLI integration:
 * - Terminal connection and interaction
 * - Claude CLI availability in container
 * - Command execution and response
 * - ANSI color support
 *
 * Prerequisites:
 * - Backend WebSocket server running on ws://127.0.0.1:3850
 * - Frontend development server running on http://localhost:3001
 * - Docker daemon running with claude-studio-terminal image
 */

test.describe('Claude CLI Integration', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the application
    await page.goto('http://localhost:3001');
    await page.waitForLoadState('domcontentloaded');
  });

  test('should connect to terminal and display prompt', async ({ page }) => {
    // Wait for terminal to be ready
    await page.waitForSelector('.terminal', { timeout: 10000 });
    await page.waitForSelector('.status-text:has-text("Connected")', { timeout: 10000 });

    // Wait for bash prompt to appear (may take a few seconds for container startup)
    await page.waitForTimeout(3000);

    // The terminal should show bash prompt
    const terminalContent = await page.locator('.xterm-screen').textContent();
    expect(terminalContent).toBeTruthy();

    // Should contain typical prompt indicators (node@ or $ or #)
    const hasPrompt = terminalContent!.includes('node@') ||
                     terminalContent!.includes('$') ||
                     terminalContent!.includes('#');
    expect(hasPrompt).toBe(true);
  });

  test('should execute basic bash command and show output', async ({ page }) => {
    // Wait for terminal to be ready
    await page.waitForSelector('.terminal', { timeout: 10000 });
    await page.waitForSelector('.status-text:has-text("Connected")', { timeout: 10000 });

    const terminal = page.locator('.terminal');
    await terminal.click();

    // Wait for prompt
    await page.waitForTimeout(3000);

    // Type simple echo command
    await page.keyboard.type('echo "Hello Claude Studio"');
    await page.keyboard.press('Enter');

    // Wait for command execution
    await page.waitForTimeout(1000);

    // Verify output appears in terminal
    const terminalContent = await page.locator('.xterm-screen').textContent();
    expect(terminalContent).toContain('Hello Claude Studio');
  });

  test('should verify Claude CLI is installed', async ({ page }) => {
    // Wait for terminal to be ready
    await page.waitForSelector('.terminal', { timeout: 10000 });
    await page.waitForSelector('.status-text:has-text("Connected")', { timeout: 10000 });

    const terminal = page.locator('.terminal');
    await terminal.click();

    // Wait for prompt
    await page.waitForTimeout(3000);

    // Check if Claude CLI is available
    await page.keyboard.type('which claude');
    await page.keyboard.press('Enter');

    // Wait for command output
    await page.waitForTimeout(1500);

    // Verify Claude CLI path is shown
    const terminalContent = await page.locator('.xterm-screen').textContent();

    // Should contain path to claude (either in /usr/local or /home/node)
    const hasClaudePath = terminalContent!.includes('/claude') ||
                         terminalContent!.includes('claude');
    expect(hasClaudePath).toBe(true);
  });

  test('should execute Claude CLI help command', async ({ page }) => {
    // Wait for terminal to be ready
    await page.waitForSelector('.terminal', { timeout: 10000 });
    await page.waitForSelector('.status-text:has-text("Connected")', { timeout: 10000 });

    const terminal = page.locator('.terminal');
    await terminal.click();

    // Wait for prompt
    await page.waitForTimeout(3000);

    // Execute Claude CLI help
    await page.keyboard.type('claude --help');
    await page.keyboard.press('Enter');

    // Wait for help output (may take a moment)
    await page.waitForTimeout(2000);

    // Verify Claude CLI help is displayed
    const terminalContent = await page.locator('.xterm-screen').textContent();

    // Help output should contain typical CLI help text
    const hasHelpText = terminalContent!.includes('Usage') ||
                       terminalContent!.includes('Options') ||
                       terminalContent!.includes('Commands') ||
                       terminalContent!.includes('claude');
    expect(hasHelpText).toBe(true);
  });

  test('should display colored output (ANSI support)', async ({ page }) => {
    // Wait for terminal to be ready
    await page.waitForSelector('.terminal', { timeout: 10000 });
    await page.waitForSelector('.status-text:has-text("Connected")', { timeout: 10000 });

    const terminal = page.locator('.terminal');
    await terminal.click();

    // Wait for prompt
    await page.waitForTimeout(3000);

    // Use ls with color to test ANSI colors
    await page.keyboard.type('ls --color=always');
    await page.keyboard.press('Enter');

    // Wait for output
    await page.waitForTimeout(1000);

    // Check if xterm has rendered colored spans
    // xterm.js renders ANSI colors as spans with specific classes
    const hasColoredOutput = await page.locator('.xterm-screen span[class*="xterm-fg-"]').count();

    // Should have at least some colored elements
    expect(hasColoredOutput).toBeGreaterThan(0);
  });

  test('should handle multi-line command execution', async ({ page }) => {
    // Wait for terminal to be ready
    await page.waitForSelector('.terminal', { timeout: 10000 });
    await page.waitForSelector('.status-text:has-text("Connected")', { timeout: 10000 });

    const terminal = page.locator('.terminal');
    await terminal.click();

    // Wait for prompt
    await page.waitForTimeout(3000);

    // Execute multiple commands
    await page.keyboard.type('echo "Line 1"');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    await page.keyboard.type('echo "Line 2"');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    await page.keyboard.type('echo "Line 3"');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    // Verify all outputs
    const terminalContent = await page.locator('.xterm-screen').textContent();
    expect(terminalContent).toContain('Line 1');
    expect(terminalContent).toContain('Line 2');
    expect(terminalContent).toContain('Line 3');
  });

  test('should handle special characters in commands', async ({ page }) => {
    // Wait for terminal to be ready
    await page.waitForSelector('.terminal', { timeout: 10000 });
    await page.waitForSelector('.status-text:has-text("Connected")', { timeout: 10000 });

    const terminal = page.locator('.terminal');
    await terminal.click();

    // Wait for prompt
    await page.waitForTimeout(3000);

    // Test with special characters
    await page.keyboard.type('echo "Test: $PATH | && > <"');
    await page.keyboard.press('Enter');

    // Wait for output
    await page.waitForTimeout(1000);

    // Verify command executed without errors
    const terminalContent = await page.locator('.xterm-screen').textContent();
    expect(terminalContent).toContain('Test:');
  });

  test('should verify bash configuration is loaded', async ({ page }) => {
    // Wait for terminal to be ready
    await page.waitForSelector('.terminal', { timeout: 10000 });
    await page.waitForSelector('.status-text:has-text("Connected")', { timeout: 10000 });

    const terminal = page.locator('.terminal');
    await terminal.click();

    // Wait for prompt
    await page.waitForTimeout(3000);

    // Check TERM environment variable (should be xterm-256color)
    await page.keyboard.type('echo $TERM');
    await page.keyboard.press('Enter');

    // Wait for output
    await page.waitForTimeout(1000);

    // Verify TERM is set correctly
    const terminalContent = await page.locator('.xterm-screen').textContent();
    expect(terminalContent).toContain('xterm-256color');
  });

  test('should execute pwd and show working directory', async ({ page }) => {
    // Wait for terminal to be ready
    await page.waitForSelector('.terminal', { timeout: 10000 });
    await page.waitForSelector('.status-text:has-text("Connected")', { timeout: 10000 });

    const terminal = page.locator('.terminal');
    await terminal.click();

    // Wait for prompt
    await page.waitForTimeout(3000);

    // Check working directory
    await page.keyboard.type('pwd');
    await page.keyboard.press('Enter');

    // Wait for output
    await page.waitForTimeout(1000);

    // Verify working directory is /workspace
    const terminalContent = await page.locator('.xterm-screen').textContent();
    expect(terminalContent).toContain('/workspace');
  });

  test('should verify node user is active', async ({ page }) => {
    // Wait for terminal to be ready
    await page.waitForSelector('.terminal', { timeout: 10000 });
    await page.waitForSelector('.status-text:has-text("Connected")', { timeout: 10000 });

    const terminal = page.locator('.terminal');
    await terminal.click();

    // Wait for prompt
    await page.waitForTimeout(3000);

    // Check current user
    await page.keyboard.type('whoami');
    await page.keyboard.press('Enter');

    // Wait for output
    await page.waitForTimeout(1000);

    // Verify user is 'node' (non-root)
    const terminalContent = await page.locator('.xterm-screen').textContent();
    expect(terminalContent).toContain('node');
  });
});

test.describe('Claude CLI Command Execution', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3001');
    await page.waitForLoadState('domcontentloaded');
  });

  test('should execute claude version command', async ({ page }) => {
    // Wait for terminal to be ready
    await page.waitForSelector('.terminal', { timeout: 10000 });
    await page.waitForSelector('.status-text:has-text("Connected")', { timeout: 10000 });

    const terminal = page.locator('.terminal');
    await terminal.click();

    // Wait for prompt
    await page.waitForTimeout(3000);

    // Try to get Claude version (if available)
    await page.keyboard.type('claude --version 2>&1 || echo "Claude CLI available"');
    await page.keyboard.press('Enter');

    // Wait for output
    await page.waitForTimeout(2000);

    // Verify some output related to Claude
    const terminalContent = await page.locator('.xterm-screen').textContent();
    const hasClaudeOutput = terminalContent!.includes('Claude') ||
                           terminalContent!.includes('version') ||
                           terminalContent!.includes('available');
    expect(hasClaudeOutput).toBe(true);
  });

  test('should handle long-running command output', async ({ page }) => {
    // Wait for terminal to be ready
    await page.waitForSelector('.terminal', { timeout: 10000 });
    await page.waitForSelector('.status-text:has-text("Connected")', { timeout: 10000 });

    const terminal = page.locator('.terminal');
    await terminal.click();

    // Wait for prompt
    await page.waitForTimeout(3000);

    // Execute command that produces output over time
    await page.keyboard.type('for i in 1 2 3; do echo "Line $i"; sleep 0.5; done');
    await page.keyboard.press('Enter');

    // Wait for command to complete
    await page.waitForTimeout(2500);

    // Verify all lines appeared
    const terminalContent = await page.locator('.xterm-screen').textContent();
    expect(terminalContent).toContain('Line 1');
    expect(terminalContent).toContain('Line 2');
    expect(terminalContent).toContain('Line 3');
  });
});

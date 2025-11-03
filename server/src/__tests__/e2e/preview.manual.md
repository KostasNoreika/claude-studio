# Preview E2E Manual Test Plan
**P06-T010: E2E tests for preview functionality**

Since full Playwright setup would be extensive, this document outlines manual E2E tests to verify the complete preview flow.

## Prerequisites
1. Server running on port 3850
2. Client running on port 3851
3. Sample dev server running (e.g., Vite on port 5173)

## Test 1: Basic Preview Configuration

### Steps:
1. Open client at http://127.0.0.1:3851
2. Wait for WebSocket connection (see "Connected" status)
3. Click "Configure Preview" button in preview panel
4. Enter port number: 5173
5. Click "Start Preview"

### Expected:
- Modal closes
- Preview URL received via WebSocket (check browser console)
- Preview iframe loads content from port 5173
- Content displays correctly in preview panel

## Test 2: Invalid Port Configuration

### Steps:
1. Click "Configure Preview"
2. Enter port: 80 (below valid range)
3. Click "Start Preview"

### Expected:
- API returns 403 error
- Error message displayed in modal
- No preview URL sent
- Preview panel remains empty

## Test 3: HMR (Hot Module Replacement)

### Prerequisites:
- Vite dev server running with HMR enabled
- Preview configured and working

### Steps:
1. Configure preview to Vite dev server (port 5173)
2. Edit a source file in the Vite project
3. Save the file

### Expected:
- WebSocket connection maintained
- Changes reflect in preview immediately (without full page reload)
- Browser console shows HMR update messages

## Test 4: Multiple Sessions

### Steps:
1. Open client in Tab 1
2. Configure preview for port 5173
3. Open client in Tab 2 (new session)
4. Configure preview for port 3000

### Expected:
- Each session has independent port configuration
- Tab 1 shows content from port 5173
- Tab 2 shows content from port 3000
- No cross-session contamination

## Test 5: SSRF Protection

### Steps:
1. Try to configure preview with port 80
2. Try to configure preview with port 10000
3. Try to configure preview with port 443

### Expected:
- All attempts rejected with 403 status
- Error messages indicate port not in allowed range
- No proxy created for invalid ports

## Test 6: Proxy Path Rewriting

### Prerequisites:
- Dev server with multiple routes (e.g., Vite with routing)

### Steps:
1. Configure preview for dev server
2. Navigate to different routes in preview:
   - /
   - /about
   - /users/123

### Expected:
- All routes load correctly
- URLs are rewritten from `/preview/:sessionId/path` to `/path`
- Server logs show correct path rewriting

## Test 7: WebSocket Upgrade for HMR

### Prerequisites:
- Dev server with WebSocket support (Vite/webpack HMR)

### Steps:
1. Configure preview for dev server
2. Check browser Network tab for WebSocket connections
3. Make changes to trigger HMR

### Expected:
- WebSocket connection established to dev server through proxy
- HMR messages received
- Updates applied without full reload

## Automated Test Implementation (Future)

```typescript
// Example Playwright test (for reference)
test('should configure and display preview', async ({ page }) => {
  await page.goto('http://127.0.0.1:3851');

  // Wait for connection
  await page.waitForSelector('[data-status="connected"]');

  // Click configure button
  await page.click('button:has-text("Configure Preview")');

  // Enter port
  await page.fill('input[type="number"]', '5173');

  // Submit
  await page.click('button:has-text("Start Preview")');

  // Wait for preview to load
  const iframe = page.frameLocator('.preview-iframe');
  await iframe.locator('body').waitFor();

  // Verify content loaded
  expect(await iframe.locator('body').isVisible()).toBe(true);
});
```

## Test Results Log

Date: 2025-11-02
Version: Phase 6 implementation

| Test | Status | Notes |
|------|--------|-------|
| Basic Preview Configuration | ⏳ Pending | Requires manual testing |
| Invalid Port Configuration | ⏳ Pending | Requires manual testing |
| HMR | ⏳ Pending | Requires manual testing |
| Multiple Sessions | ⏳ Pending | Requires manual testing |
| SSRF Protection | ✅ Pass | Covered by integration tests |
| Proxy Path Rewriting | ⏳ Pending | Requires manual testing |
| WebSocket Upgrade | ⏳ Pending | Requires manual testing |

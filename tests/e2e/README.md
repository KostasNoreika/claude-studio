# E2E Tests for Claude Studio Terminal

End-to-end tests for the Claude Studio Terminal Application using Playwright.

## Test Files

- **terminal.spec.ts** - Tests for terminal UI functionality
  - Terminal loading and rendering
  - Terminal input/output handling
  - Scrollback capabilities
  - Viewport management

- **websocket.spec.ts** - Tests for WebSocket connection
  - Connection establishment
  - Session ID management
  - Message exchange
  - Connection lifecycle (reload, reconnection)
  - Error handling

## Prerequisites

Before running tests, ensure both backend and frontend servers are running:

### Terminal 1: Start Backend Server
```bash
cd /opt/dev/claude-studio
pnpm --filter server dev
```

Expected output:
```
[backend] Server listening on http://127.0.0.1:3850
```

### Terminal 2: Start Frontend Server
```bash
cd /opt/dev/claude-studio
pnpm --filter client dev
```

Expected output:
```
VITE v... ready in 123 ms

➜  Local:   http://127.0.0.1:3001/
```

### Terminal 3: Run Tests
```bash
cd /opt/dev/claude-studio
pnpm test:e2e
```

## Running Tests

### Run all tests in headless mode
```bash
pnpm test:e2e
```

### Run tests with UI (recommended for debugging)
```bash
pnpm test:e2e:ui
```

### Run tests with debugger
```bash
pnpm test:e2e:debug
```

### Run specific test file
```bash
pnpm test:e2e tests/e2e/terminal.spec.ts
pnpm test:e2e tests/e2e/websocket.spec.ts
```

### Run specific test
```bash
pnpm test:e2e -g "should load and display terminal"
```

### Run tests on specific browser
```bash
pnpm test:e2e --project=chromium
pnpm test:e2e --project=firefox
pnpm test:e2e --project=webkit
```

### View test report
```bash
pnpm test:e2e
# Then open the HTML report
npx playwright show-report
```

## Test Coverage

### Terminal UI Tests (terminal.spec.ts)

1. **Terminal Loading**
   - Terminal container displays correctly
   - XTerm viewport is rendered
   - Welcome message appears on load
   - Terminal can receive focus

2. **Terminal Input/Output**
   - User input is displayed in terminal
   - Multiple input lines work correctly
   - Special characters are handled properly

3. **Terminal Scrolling**
   - Terminal has proper scrollback buffer (500 lines)
   - Scrolling functionality works
   - Terminal remains visible after scrolling

4. **Connection Status**
   - Connection status indicator displays
   - Session ID is shown when connected
   - Status indicator color changes based on connection state

### WebSocket Tests (websocket.spec.ts)

1. **Connection Establishment**
   - WebSocket connects on page load
   - Connection status shows "Connected"
   - Connection state transitions work

2. **Session Management**
   - Session ID is received from server
   - Session ID format is valid (sess_<timestamp>_<random>)
   - Same session ID maintained while connected
   - New session ID after page reload

3. **Message Exchange**
   - Terminal input is sent via WebSocket
   - Server echo responses are displayed
   - Multiple consecutive messages are handled
   - Message order is preserved
   - Empty input is handled gracefully
   - Long messages are supported
   - Rapid input sequences work correctly

4. **Connection Lifecycle**
   - Page reload triggers new WebSocket connection
   - Terminal remains functional after reload
   - Rapid reconnections are handled

5. **Error Handling**
   - Connection drops are handled gracefully
   - Automatic reconnection works
   - Terminal recovers after connection failure

## Expected Test Results

All tests should pass when:
1. Backend server is running on `ws://127.0.0.1:3850`
2. Frontend server is running on `http://localhost:3001`
3. Both servers are properly configured

### Success Criteria
- All 30+ tests pass
- No flaky tests (consistent pass/fail)
- HTML report generates successfully
- Screenshots captured only on failure

## Troubleshooting

### Tests timeout waiting for connection
- Ensure backend server is running: `pnpm --filter server dev`
- Ensure frontend server is running: `pnpm --filter client dev`
- Check that ports 3001 and 3850 are not blocked

### Terminal not displaying
- Check browser console for JavaScript errors
- Verify XTerm library is loaded: Look for `.xterm-screen` element
- Inspect terminal styling: CSS from `xterm/css/xterm.css` should be loaded

### WebSocket connection fails
- Verify backend server is accepting WebSocket connections
- Check browser console for connection errors
- Ensure WebSocket URL is correct: `ws://127.0.0.1:3850`

### Tests fail on Firefox/WebKit
- Different browsers may have slight timing differences
- Increase timeout in playwright.config.ts if needed
- Use `--headed` flag to see browser interaction: `pnpm test:e2e --headed`

### Screenshots not being captured
- Ensure `screenshot: 'only-on-failure'` is set in config
- Check that test-results directory is writable
- Verify playwright-report folder exists

## CI/CD Integration

For CI/CD pipelines, tests can be run with:

```bash
# Install dependencies
pnpm install

# Build backend and frontend
pnpm build

# Start backend in background
PORT=3850 pnpm --filter server dev &
BACKEND_PID=$!

# Start frontend in background
PORT=3001 pnpm --filter client dev &
FRONTEND_PID=$!

# Wait for servers to start
sleep 5

# Run tests
pnpm test:e2e

# Capture exit code
TEST_RESULT=$?

# Cleanup
kill $BACKEND_PID $FRONTEND_PID

# Exit with test result
exit $TEST_RESULT
```

## Test Architecture

### Naming Convention
- Test files: `*.spec.ts`
- Global setup: `global-setup.ts`
- Utilities: `*.utils.ts` (if needed)

### Test Organization
- Tests are grouped by feature using `test.describe()`
- Common setup in `test.beforeEach()`
- Assertions use standard Playwright assertions

### Best Practices
- No hardcoded waits (use `waitForSelector` or conditions)
- Explicit timeouts (5000ms for initial loads)
- Meaningful test names describing behavior
- Multiple assertions per test where appropriate
- Clean test isolation (no test dependencies)

## Performance Notes

- Tests run in parallel by default (4 workers)
- CI/CD runs with 1 worker (avoid race conditions)
- Each test timeout: 30 seconds
- Global setup timeout: handled separately

## Resources

- [Playwright Documentation](https://playwright.dev)
- [Test Configuration](https://playwright.dev/docs/test-configuration)
- [Debugging Tests](https://playwright.dev/docs/debug)
- [Best Practices](https://playwright.dev/docs/best-practices)

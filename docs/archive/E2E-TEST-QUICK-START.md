# E2E Tests Quick Start Guide

## One-Liner Setup

```bash
# Terminal 1
pnpm --filter server dev

# Terminal 2
pnpm --filter client dev

# Terminal 3
pnpm test:e2e
```

## Commands Reference

| Command | Purpose |
|---------|---------|
| `pnpm test:e2e` | Run all tests (headless) |
| `pnpm test:e2e:ui` | Run with interactive UI |
| `pnpm test:e2e:debug` | Run with debugger |
| `npx playwright show-report` | View HTML report |

## Test Files

| File | Tests | Focus |
|------|-------|-------|
| `tests/e2e/terminal.spec.ts` | 15 | Terminal UI & rendering |
| `tests/e2e/websocket.spec.ts` | 22 | WebSocket connection |
| `tests/e2e/sample.spec.ts` | 4 | Basic sanity checks |

## What Gets Tested

### Terminal UI (terminal.spec.ts)
```
- Terminal loads and displays correctly
- Welcome message appears
- Terminal accepts keyboard input
- Terminal scrollback works (500 lines)
- Connection status indicator shows correct state
- Session ID is displayed
```

### WebSocket Connection (websocket.spec.ts)
```
- WebSocket connects on page load
- Server sends session ID
- User input is echoed by server
- Multiple messages are handled
- Page reload creates new session
- Connection recovers after network failure
- Rapid reconnections work correctly
```

## Expected Results

All tests should **PASS** when:
- Backend server is running: `pnpm --filter server dev`
- Frontend server is running: `pnpm --filter client dev`
- No other services using ports 3001 or 3850

## Debugging Failed Tests

### 1. Check if servers are running
```bash
curl http://localhost:3001    # Should respond
```

### 2. Run specific test
```bash
pnpm test:e2e -g "connection"  # Run tests matching "connection"
```

### 3. Use UI mode for visual debugging
```bash
pnpm test:e2e:ui
```

### 4. Check browser console logs
Enable logging in `playwright.config.ts`:
```typescript
use: {
  trace: 'on',  // Trace all actions
}
```

### 5. Look at screenshots
```bash
open playwright-report/index.html
```

## Test Statistics

- **Total Tests**: 111 (across 3 browsers)
- **Terminal Tests**: 15
- **WebSocket Tests**: 22
- **Basic Tests**: 4
- **Execution Time**: ~3-4 minutes (parallel) or ~10-15 minutes (CI with retries)

## Common Issues & Solutions

### Tests timeout
```bash
# Make sure servers are running
lsof -i :3001    # Check frontend
lsof -i :3850    # Check backend
```

### Terminal not rendering
```bash
# Check XTerm element exists in DOM
# Browser console: document.querySelector('.xterm-screen')
# Should not be null
```

### WebSocket fails to connect
```bash
# Verify backend accepts WebSocket
# Check CORS configuration in server
# Verify firewall allows localhost:3850
```

### Tests flaky on CI
- Increase timeout in `playwright.config.ts`
- Check for race conditions
- Ensure sequential execution (workers: 1)

## File Locations

```
/opt/dev/claude-studio/
├── tests/e2e/
│   ├── terminal.spec.ts        <- Terminal UI tests
│   ├── websocket.spec.ts       <- WebSocket tests
│   ├── global-setup.ts         <- Setup script
│   └── README.md               <- Full documentation
├── playwright.config.ts         <- Test configuration
├── .github/workflows/
│   └── e2e-tests.yml          <- CI/CD workflow
└── E2E-TEST-QUICK-START.md    <- This file
```

## CI/CD Integration

Tests run automatically on:
- Push to `main`, `master`, or `develop`
- Pull requests to those branches

View results in GitHub Actions tab.

## Next Steps

1. Run tests locally first
2. Review HTML report
3. Commit test files
4. Push to trigger CI/CD
5. Check GitHub Actions for results

---

**Need help?** See `tests/e2e/README.md` for comprehensive documentation.

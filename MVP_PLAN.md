# Claude Studio - MVP Implementation Plan

## 🎯 MVP Goal

Build a **minimal working prototype** that demonstrates the core value proposition:

- Split view (terminal + preview)
- Real-time console streaming
- Hot reload on file changes
- Claude CLI integration

**Critical Architecture Decision (Post-Debate MCP Review):**

- ✅ **Docker-first approach** - Container isolation from Phase 3
- ✅ **Security-first mindset** - Prevent container breakout, DoS, SSRF
- ✅ **Manual port config** - Auto-detection as optional enhancement
- ✅ **Testability from Phase 1** - Jest + Playwright per-phase

**Timeline**: Aim for functional MVP (not production-ready, but architecturally sound)

## 📋 Phase Breakdown

### Phase 1: Foundation (Basic Infrastructure)

**Goal**: Get basic server + terminal working

#### Backend Tasks:

- [ ] Initialize Node.js + TypeScript project
  - [ ] Setup `package.json` with dependencies
  - [ ] Configure `tsconfig.json`
  - [ ] Setup build scripts
- [ ] Basic Express server
  - [ ] HTTP server on port 3850
  - [ ] Static file serving for frontend
  - [ ] Health check endpoint `/api/health`
- [ ] WebSocket server setup
  - [ ] Install `ws` library
  - [ ] Accept connections
  - [ ] Basic message echo (test)
- [ ] Terminal bridge with node-pty
  - [ ] Spawn bash shell (test without Claude first)
  - [ ] Capture stdout/stderr
  - [ ] Send stdin
  - [ ] Forward to WebSocket

**Success Criteria**:
✅ Server starts without errors
✅ WebSocket accepts connections
✅ Can type in terminal and see output

---

### Phase 2: Frontend Terminal (Visual Interface)

**Goal**: Display working terminal in browser

#### Frontend Tasks:

- [ ] Initialize React + TypeScript project
  - [ ] Setup Vite
  - [ ] Configure `tsconfig.json`
  - [ ] Basic routing (if needed)
- [ ] Integrate xterm.js
  - [ ] Install `xterm` + `xterm-addon-fit`
  - [ ] Render terminal in browser
  - [ ] Handle resize
- [ ] WebSocket client
  - [ ] Connect to backend
  - [ ] Send terminal input
  - [ ] Receive and render output
- [ ] Basic UI structure
  - [ ] Full-screen terminal (no split yet)
  - [ ] Connection status indicator

**Success Criteria**:
✅ Can open browser and see terminal
✅ Typing works (echoes back)
✅ Ctrl+C, Ctrl+D work

---

### Phase 3: Docker Containerization (CRITICAL PIVOT)

**Goal**: Replace tmux with Docker containers for security & isolation

#### Backend Tasks:

- [ ] Install dockerode
  - [ ] `npm install dockerode @types/dockerode`
- [ ] Create Dockerfile for Claude environment
  - [ ] Base: node:20-alpine
  - [ ] Install Claude CLI
  - [ ] Install common dev tools (git, curl, etc.)
  - [ ] Set working directory `/workspace`
- [ ] Build Docker image
  - [ ] `docker build -t claude-studio-env:latest .`
- [ ] Container session manager
  - [ ] Create container per user session
  - [ ] Resource limits (1GB RAM, 0.5 CPU)
  - [ ] Volume mount for project files
  - [ ] Label containers with session ID
- [ ] Replace node-pty with dockerode
  - [ ] `container.attach()` for stdin/stdout/stderr
  - [ ] Bidirectional stream to WebSocket
- [ ] Container lifecycle
  - [ ] Start container on session create
  - [ ] Stop/remove on session end
  - [ ] Cleanup zombie containers
  - [ ] Re-attach to existing containers on reconnect

**Security Requirements**:
✅ No host file system access outside project dir
✅ CPU/memory limits enforced
✅ Network isolation (only expose necessary ports)
✅ User namespace remapping (rootless containers)

**Success Criteria**:
✅ Can spawn bash in container and get output
✅ Container survives Node.js server restart
✅ Can re-attach to same container after reconnect
✅ Container is destroyed on session timeout
✅ Resource limits prevent DoS

---

### Phase 4: Claude CLI in Container

**Goal**: Run Claude CLI inside Docker container

#### Backend Tasks:

- [ ] Update Dockerfile
  - [ ] Install Claude CLI via npm or binary
  - [ ] Verify `claude --version` works in container
- [ ] Container startup command
  - [ ] Start container with `/bin/bash` (not Claude directly)
  - [ ] Send `claude` command via stdin after attach
- [ ] Handle Claude's interactive prompts
  - [ ] ANSI colors work correctly
  - [ ] Special escape sequences handled
- [ ] Session state persistence
  - [ ] Claude CLI history persists in container
  - [ ] Project files synced via volume mount

**Success Criteria**:
✅ Can type `claude "help"` and get response
✅ Claude CLI responds normally
✅ Colors and formatting work
✅ Session survives browser refresh
✅ Changes Claude makes appear in host filesystem

---

### Phase 5: Split View + Preview Panel

**Goal**: Add live preview alongside terminal

#### Frontend Tasks:

- [ ] Install react-split-pane or similar
- [ ] Create split layout
  - [ ] Left: Terminal component
  - [ ] Right: Preview component
  - [ ] Resizable divider
- [ ] Preview component
  - [ ] iframe element
  - [ ] URL input (manual for now)
  - [ ] Loading indicator
  - [ ] Error handling (iframe load failed)

**Success Criteria**:
✅ Can resize panels
✅ Terminal and iframe both visible
✅ Can manually enter URL (e.g., http://localhost:5173)
✅ Preview loads correctly

---

### Phase 6: Dev Server Proxy (Manual Config First)

**Goal**: Proxy user's dev server with strict security

#### Backend Tasks:

- [ ] Manual port configuration
  - [ ] UI input field for port (default: 5173)
  - [ ] Store in session state
- [ ] Secure dev server proxy
  - [ ] Use `http-proxy-middleware`
  - [ ] **STRICT**: Only proxy `127.0.0.1` or `localhost`
  - [ ] Validate port range (3000-9999)
  - [ ] Prevent SSRF attacks
- [ ] Dynamic port mapping for containers
  - [ ] Expose container port to host
  - [ ] Map to unique host port per session
  - [ ] Track mapping in session registry
- [ ] Proxy endpoint
  - [ ] `GET /preview/*` → proxied to user's dev server
  - [ ] Preserve WebSocket connections (for HMR)
- [ ] Send preview URL to frontend
  - [ ] WebSocket message: `{type: 'server:ready', url: '/preview'}`

**Security Requirements**:
✅ Only localhost targets allowed
✅ Port validation prevents malicious input
✅ No open relay to internal network
✅ Rate limiting on proxy requests

**Success Criteria**:
✅ User enters port 5173 in UI
✅ Proxy works: `/preview` shows dev server
✅ Frontend iframe loads `/preview`
✅ HMR WebSocket connections work
✅ Malicious ports (e.g., 22, 3306) rejected

**Future Enhancement (Post-MVP)**:

- [ ] Auto-detection as optional feature
  - [ ] Parse `package.json` scripts
  - [ ] Detect running servers on common ports
  - [ ] Suggest port to user (not auto-connect)

---

### Phase 7: File Watcher + Hot Reload

**Goal**: Auto-reload preview when files change

#### Backend Tasks:

- [ ] Install chokidar
- [ ] Watch project files
  - [ ] `src/**/*`
  - [ ] `public/**/*`
  - [ ] `*.config.js`
- [ ] Debounce changes (300ms)
- [ ] Broadcast reload event via WebSocket

#### Frontend Tasks:

- [ ] Listen for reload events
- [ ] Reload iframe: `iframe.contentWindow.location.reload()`
- [ ] Show reload indicator (optional)

**Success Criteria**:
✅ Edit `src/App.tsx` → Preview reloads automatically
✅ No reload spam (debounced)
✅ Works with multiple file changes

---

### Phase 8: Console Streaming (Multi-Strategy)

**Goal**: Browser console logs → Claude sees them (safely)

#### Strategy 1: Script Injection (Primary for same-origin)

- [ ] Console interceptor script
  - [ ] Create JavaScript snippet
  - [ ] Hook `console.log`, `console.error`, `console.warn`, `console.info`
  - [ ] Rate limiting: max 100 messages/second
  - [ ] Batch messages (send every 100ms)
- [ ] Secure injection via proxy
  - [ ] Check response Content-Type is `text/html`
  - [ ] Check origin is `localhost` or `127.0.0.1`
  - [ ] Inject before `</body>` tag
  - [ ] Handle CSP headers (add `unsafe-inline` if missing)
  - [ ] Skip if gzip/brotli encoded (decompress first)

**Security Requirements**:
✅ Only inject into same-origin responses
✅ Sanitize console messages before displaying
✅ Rate limiting prevents DoS via console spam
✅ No eval() or dangerous code execution

#### Strategy 2: PostMessage Fallback (For controlled apps)

- [ ] User adds SDK to their app
  - [ ] `npm install @claude-studio/console-bridge`
  - [ ] `import '@claude-studio/console-bridge'` in app
- [ ] SDK sends logs via postMessage
  - [ ] `window.parent.postMessage({type: 'console', ...}, origin)`
- [ ] Parent window receives and forwards to backend

#### Strategy 3: Chrome DevTools Protocol (Future)

- [ ] Not for MVP (too complex)
- [ ] Consider for Phase 2+ for non-localhost apps

#### Frontend Tasks:

- [ ] Console panel component
  - [ ] Display console logs
  - [ ] Color-code by level (error=red, warn=yellow, log=gray)
  - [ ] XSS protection: escape HTML in log messages
- [ ] WebSocket handler
  - [ ] Receive console messages
  - [ ] Display in terminal view (pipe to Claude)
  - [ ] Format: `[Console] [ERROR] TypeError: ...`

**Success Criteria**:
✅ Browser: `console.error("test")` → Claude terminal shows it
✅ Claude sees: `[Browser Console] Error: test`
✅ CSP-protected apps show fallback message
✅ Console spam doesn't crash backend
✅ XSS in log messages is escaped

---

### Phase 9: Polish, Testing & Bug Fixes

**Goal**: Make it stable and secure

#### Error Handling:

- [ ] WebSocket reconnection
  - [ ] Exponential backoff (1s, 2s, 4s, ..., max 30s)
  - [ ] Show reconnection status to user
  - [ ] Re-attach to existing container on reconnect
- [ ] Container lifecycle errors
  - [ ] Container start failed → Show error + retry button
  - [ ] Container crashed → Auto-restart with warning
  - [ ] Zombie container cleanup on server startup
- [ ] Proxy errors
  - [ ] Dev server not running → Show clear instructions
  - [ ] Port validation errors → Suggest valid range
  - [ ] SSRF attempt → Block and log warning

#### Security Hardening:

- [ ] Input validation
  - [ ] Port numbers: 3000-9999 only
  - [ ] Container names: alphanumeric + hyphens only
  - [ ] File paths: prevent directory traversal
- [ ] Rate limiting
  - [ ] WebSocket messages: 1000/minute per session
  - [ ] Console messages: 100/second
  - [ ] Container creation: 5/hour per user
- [ ] Session cleanup
  - [ ] Auto-destroy containers after 4 hours inactivity
  - [ ] Heartbeat: disconnect if no ping for 5 minutes
  - [ ] Graceful shutdown: warn users before server restart

#### Testing Strategy (Per-Phase):

- [ ] Unit tests (Jest)
  - [ ] Container manager: create, attach, destroy
  - [ ] WebSocket message routing
  - [ ] Proxy validation logic
  - [ ] Console interceptor injection
- [ ] Integration tests (Supertest)
  - [ ] WebSocket connection flow
  - [ ] Container lifecycle end-to-end
  - [ ] File watcher → reload event
- [ ] E2E tests (Playwright)
  - [ ] Open browser → see split view
  - [ ] Type command → see output
  - [ ] Edit file → preview reloads
  - [ ] Console error → shows in terminal
- [ ] Security tests
  - [ ] SSRF prevention: malicious port rejected
  - [ ] Path traversal: ../../../etc/passwd blocked
  - [ ] DoS prevention: rate limits enforced
  - [ ] XSS in console logs: escaped correctly

#### UX improvements:

- [ ] Clear terminal button
- [ ] Manual reconnect button
- [ ] Manual reload button (backup for auto)
- [ ] Port configuration modal
- [ ] Connection status indicator

#### Documentation:

- [ ] Update README with usage instructions
- [ ] Add `.env.example`
- [ ] Add development setup steps
- [ ] Docker setup guide
- [ ] Security best practices
- [ ] Troubleshooting guide

**Success Criteria**:
✅ All tests passing (unit, integration, e2e, security)
✅ Can recover from common errors automatically
✅ Clear error messages for user
✅ Doesn't crash on edge cases
✅ Security tests pass: SSRF, XSS, DoS, path traversal

---

## 🛠️ Tech Stack (Revised - Docker-First)

### Backend:

```json
{
  "dependencies": {
    "express": "^4.18.2",
    "ws": "^8.14.2",
    "dockerode": "^4.0.0",
    "chokidar": "^3.5.3",
    "http-proxy-middleware": "^2.0.6",
    "dotenv": "^16.3.1",
    "jsonwebtoken": "^9.0.2",
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "@types/node": "^20.10.0",
    "@types/express": "^4.17.21",
    "@types/ws": "^8.5.10",
    "@types/dockerode": "^3.3.23",
    "tsx": "^4.7.0",
    "nodemon": "^3.0.2",
    "jest": "^29.7.0",
    "supertest": "^6.3.3",
    "@playwright/test": "^1.40.0"
  }
}
```

### Frontend:

```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "xterm": "^5.3.0",
    "xterm-addon-fit": "^0.8.0",
    "react-split-pane": "^0.1.92"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "@vitejs/plugin-react": "^4.2.0",
    "vite": "^5.0.0"
  }
}
```

## 📁 File Structure (MVP)

```
claude-studio/
├── README.md
├── ARCHITECTURE.md
├── MVP_PLAN.md (this file)
├── package.json (root workspace)
├── .env.example
│
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts                  # Express + WebSocket server
│   │   ├── websocket-manager.ts      # WebSocket handler
│   │   ├── terminal-bridge.ts        # node-pty wrapper
│   │   ├── file-watcher.ts           # chokidar watcher
│   │   ├── dev-server-proxy.ts       # http-proxy-middleware
│   │   ├── console-interceptor.ts    # Script to inject
│   │   └── utils/
│   │       ├── tmux.ts               # tmux helpers
│   │       └── project-detector.ts   # Detect Vite/Next/etc.
│   └── dist/                         # Compiled JS
│
├── client/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── index.html
│   ├── src/
│   │   ├── main.tsx                  # Entry point
│   │   ├── App.tsx                   # Root component
│   │   ├── components/
│   │   │   ├── SplitView.tsx         # Layout
│   │   │   ├── Terminal.tsx          # xterm.js wrapper
│   │   │   ├── Preview.tsx           # iframe + console
│   │   │   └── ConsolePanel.tsx      # Console log display
│   │   ├── hooks/
│   │   │   ├── useWebSocket.ts       # WebSocket connection
│   │   │   └── useTerminal.ts        # Terminal instance
│   │   └── services/
│   │       └── websocket.ts          # WebSocket client class
│   └── dist/                         # Built assets
│
└── shared/
    └── types.ts                      # Shared TypeScript types
```

## 🧪 Testing Strategy (MVP)

### Manual Testing (Priority)

1. Start server → Terminal appears
2. Type command → See output
3. Edit file → Preview reloads
4. Console.error in browser → Shows in terminal
5. Close browser → Reopen → Session restored

### Automated Testing (Post-MVP)

- Unit tests for core logic
- E2E tests with Playwright

## 🚀 Development Workflow

### Setup:

```bash
cd /opt/dev/claude-studio

# Install all dependencies
pnpm install

# Setup environment
cp .env.example .env
```

### Development:

```bash
# Terminal 1: Backend server
cd server
pnpm dev

# Terminal 2: Frontend dev server
cd client
pnpm dev
```

### Build:

```bash
# Build both
pnpm build

# Server output: server/dist/
# Client output: client/dist/
```

### Production:

```bash
# Run built version
cd server
node dist/index.js
# Serves frontend from client/dist/
```

## 📊 Progress Tracking (Revised)

| Phase                              | Status         | Completion |
| ---------------------------------- | -------------- | ---------- |
| Phase 1: Foundation                | ⬜ Not Started | 0%         |
| Phase 2: Frontend Terminal         | ⬜ Not Started | 0%         |
| Phase 3: Docker Containers         | ⬜ Not Started | 0%         |
| Phase 4: Claude CLI in Container   | ⬜ Not Started | 0%         |
| Phase 5: Split View                | ⬜ Not Started | 0%         |
| Phase 6: Dev Server Proxy          | ⬜ Not Started | 0%         |
| Phase 7: File Watcher & Hot Reload | ⬜ Not Started | 0%         |
| Phase 8: Console Streaming         | ⬜ Not Started | 0%         |
| Phase 9: Testing & Polish          | ⬜ Not Started | 0%         |

**Overall Progress**: 0%

**Critical Changes from Original Plan**:

- ✅ Phase 3: **Docker containerization** (was: tmux)
- ✅ Phase 6: **Manual port config** (was: auto-detection)
- ✅ Phase 8: **Multi-strategy console** (was: simple injection)
- ✅ Phase 9: **Comprehensive testing** (was: basic polish)

## 🎬 Demo Scenario (Target)

1. User opens `http://localhost:3850`
2. Sees split view: terminal (left) + empty preview (right)
3. Types: `claude "create a React counter app"`
4. Claude creates files: `src/Counter.tsx`, updates `App.tsx`
5. File watcher detects changes
6. Preview auto-reloads
7. User sees working counter in preview
8. Clicks counter button
9. Browser: `console.log("Count: 1")`
10. Terminal shows: `[Console] Count: 1`
11. User types: `claude "add reset button"`
12. Claude adds button
13. Preview reloads automatically
14. ✅ Working app with reset button

**Total Time**: ~2-3 minutes (no manual intervention)

## 🔧 Next Steps

1. **Start with Phase 1**: Get basic server + WebSocket working
2. **Test incrementally**: Don't move to next phase until current works
3. **Keep it simple**: No fancy UI, focus on functionality
4. **Document issues**: Track bugs/blockers in GitHub issues

## ❓ Open Questions

- [ ] Should we use tmux from the start, or add later?
  - **Decision**: Add in Phase 3 (simplifies Phase 1/2)
- [ ] Monorepo or separate repos?
  - **Decision**: Monorepo with pnpm workspaces
- [ ] Should console panel be separate or embedded in preview?
  - **Decision**: Start embedded, make optional overlay
- [ ] How to handle Claude API costs?
  - **Decision**: User brings their own API key (BYOK)

## 📚 Resources

- [xterm.js Docs](https://xtermjs.org/)
- [node-pty GitHub](https://github.com/microsoft/node-pty)
- [chokidar GitHub](https://github.com/paulmillr/chokidar)
- [WebSocket (ws) Docs](https://github.com/websockets/ws)
- [tmux Cheatsheet](https://tmuxcheatsheet.com/)

---

**Ready to start coding? Begin with Phase 1!** 🚀

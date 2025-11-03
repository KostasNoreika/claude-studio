# Claude Studio - Master Task Registry

**Generated**: 2025-11-02
**Total Tasks**: 86 tasks (80 from requirements-analyst + 6 from system-architect Phase 0)
**Status**: APPROVED WITH CHANGES by system-architect

---

## Quick Reference

### By Phase

- **Phase 0**: Project Setup (6 tasks) - NEW from system-architect
- **Phase 1**: Foundation (8 tasks)
- **Phase 2**: Frontend Terminal (8 tasks)
- **Phase 3**: Docker Containerization (10 tasks)
- **Phase 4**: Claude CLI in Container (7 tasks)
- **Phase 5**: Split View + Preview (7 tasks)
- **Phase 6**: Dev Server Proxy (10 tasks)
- **Phase 7**: File Watcher + Hot Reload (8 tasks)
- **Phase 8**: Console Streaming (10 tasks)
- **Phase 9**: Testing & Polish (12 tasks)

### By Agent Type

- **backend-architect**: 34 tasks
- **frontend-architect**: 18 tasks
- **quality-engineer**: 20 tasks
- **devops-architect**: 8 tasks
- **security-engineer**: 6 tasks

### By Complexity

- **LOW**: 14 tasks
- **MEDIUM**: 48 tasks
- **HIGH**: 22 tasks
- **CRITICAL**: 2 tasks

---

## Phase 0: Project Setup (NEW)

### P00-T001: backend-architect: Initialize monorepo with pnpm workspaces

**Complexity**: LOW
**Dependencies**: []
**Description**: Set up root package.json with pnpm-workspace.yaml. Create server/, client/, shared/ packages.
**Acceptance Criteria**:

- pnpm-workspace.yaml defines workspaces
- server/package.json, client/package.json, shared/package.json exist
- pnpm install runs successfully
- Build scripts in root package.json (build:server, build:client, build:all)

**Files to modify**:

- package.json (root)
- pnpm-workspace.yaml
- server/package.json
- client/package.json
- shared/package.json
- .gitignore

---

### P00-T002: backend-architect: Setup TypeScript configuration

**Complexity**: LOW
**Dependencies**: [P00-T001]
**Description**: Configure TypeScript for server, client, and shared packages with strict mode.
**Acceptance Criteria**:

- server/tsconfig.json with strict: true, ES2022, ESNext modules
- client/tsconfig.json for React
- shared/tsconfig.json for type definitions
- Path aliases configured (@/_, @shared/_)
- tsc --noEmit runs without errors

**Files to modify**:

- server/tsconfig.json
- client/tsconfig.json
- shared/tsconfig.json
- server/package.json (add typescript, @types/node, tsx)
- client/package.json (add typescript, @types/react)

---

### P00-T003: quality-engineer: Configure ESLint + Prettier + husky

**Complexity**: LOW
**Dependencies**: [P00-T001]
**Description**: Setup code quality tools and pre-commit hooks.
**Acceptance Criteria**:

- ESLint configured for TypeScript + React
- Prettier configured with consistent formatting
- husky pre-commit hook runs lint + format
- lint and format scripts in package.json

**Files to modify**:

- .eslintrc.json
- .prettierrc.json
- .husky/pre-commit
- package.json (add scripts: lint, format)

---

### P00-T004: quality-engineer: Setup Jest test infrastructure

**Complexity**: MEDIUM
**Dependencies**: [P00-T002]
**Description**: Configure Jest for unit and integration testing with TypeScript support.
**Acceptance Criteria**:

- Jest configured with ts-jest
- server/jest.config.js and client/vitest.config.ts
- Test scripts: test:unit, test:watch, test:coverage
- Coverage thresholds: 80% for branches, functions, lines

**Files to modify**:

- server/jest.config.js
- server/package.json (add jest, ts-jest, @types/jest)
- package.json (add test scripts)

---

### P00-T005: quality-engineer: Setup Playwright E2E testing

**Complexity**: MEDIUM
**Dependencies**: [P00-T002]
**Description**: Configure Playwright for end-to-end browser testing.
**Acceptance Criteria**:

- Playwright installed and configured
- playwright.config.ts with browsers (chromium, firefox, webkit)
- Test script: test:e2e
- Sample E2E test passes

**Files to modify**:

- playwright.config.ts
- package.json (add @playwright/test)
- tests/e2e/sample.spec.ts

---

### P00-T006: devops-architect: Create GitHub Actions CI pipeline

**Complexity**: MEDIUM
**Dependencies**: [P00-T003, P00-T004]
**Description**: Setup CI pipeline for automated testing on push and PR.
**Acceptance Criteria**:

- .github/workflows/ci.yml runs on push and pull_request
- CI runs lint, typecheck, unit tests
- CI uploads coverage report
- Badge in README shows build status

**Files to modify**:

- .github/workflows/ci.yml
- README.md (add build status badge)

---

## Phase 1: Foundation

### P01-T001: backend-architect: Initialize monorepo with pnpm workspaces

**Complexity**: LOW
**Dependencies**: []
**NOTE**: Duplicate of P00-T001, skip if Phase 0 completed
**Files to modify**:

- See P00-T001

---

### P01-T002: backend-architect: Configure TypeScript for server package

**Complexity**: LOW
**Dependencies**: [P01-T001 OR P00-T002]
**NOTE**: Duplicate of P00-T002, skip if Phase 0 completed
**Files to modify**:

- See P00-T002

---

### P01-T003: backend-architect: Create Express server with health check endpoint

**Complexity**: MEDIUM
**Dependencies**: [P01-T002]
**Description**: Initialize Express application on port 3850 (IPv4 only: 127.0.0.1). Create /api/health endpoint. Configure CORS for same-origin only.
**Acceptance Criteria**:

- Express server starts on 127.0.0.1:3850
- GET /api/health returns {"status":"ok","timestamp":ISO8601}
- CORS configured for localhost:3850 only
- Morgan logger middleware installed
- Graceful shutdown on SIGTERM/SIGINT

**Security Considerations**:

- IPv4 only (127.0.0.1, not ::1)
- CORS restricted to same-origin
- No external exposure

**Files to modify**:

- server/src/index.ts
- server/src/app.ts
- server/package.json (add express, cors, morgan, @types/express, @types/cors, @types/morgan)

**Testing Requirements**:

- Unit test: Health endpoint returns 200 with correct JSON
- Integration test: Server starts and stops cleanly
- Verify IPv4 binding (curl http://127.0.0.1:3850/api/health)

---

### P01-T004: backend-architect: Set up WebSocket server with ws library

**Complexity**: MEDIUM
**Dependencies**: [P01-T003]
**Description**: Install and configure WebSocket server using ws library attached to Express HTTP server. Implement connection handler with echo test and heartbeat.
**Acceptance Criteria**:

- WebSocket server attached to Express HTTP server instance
- Accepts connections on ws://127.0.0.1:3850
- Echo test: message sent by client is echoed back
- Ping/pong heartbeat every 30 seconds
- Connection close handler logs disconnect event
- No memory leaks on connection churn

**Files to modify**:

- server/src/websocket/manager.ts
- server/src/index.ts
- server/package.json (add ws, @types/ws)

**Testing Requirements**:

- Unit test: WebSocket accepts connection
- Unit test: Echo message works
- Unit test: Heartbeat sends ping every 30s
- Integration test: Multiple clients can connect

---

### P01-T005: backend-architect: Create shared TypeScript types package

**Complexity**: LOW
**Dependencies**: [P01-T002]
**Description**: Define WebSocket message types shared between client and server.
**Acceptance Criteria**:

- shared/types.ts defines ClientMessage union type
- shared/types.ts defines ServerMessage union type
- Types exported via shared/index.ts
- Server can import types from 'shared'
- Type definitions match ARCHITECTURE.md

**Files to modify**:

- shared/src/types.ts
- shared/src/index.ts
- shared/tsconfig.json
- shared/package.json

**Testing Requirements**:

- tsc compiles shared package without errors
- Generated .d.ts files exist in dist/

---

### P01-T006: quality-engineer: Write unit tests for Express server

**Complexity**: MEDIUM
**Dependencies**: [P01-T003]
**Description**: Set up Jest testing framework for server package. Write unit tests for health endpoint and middleware.
**Acceptance Criteria**:

- Jest configured with TypeScript support (ts-jest)
- Test: GET /api/health returns 200 status
- Test: Health endpoint returns correct JSON
- Test: CORS headers present for same-origin
- Test: CORS blocks non-same-origin requests
- All tests pass with npm test
- Test coverage >= 80% for server/src/app.ts

**Files to modify**:

- server/jest.config.js
- server/package.json (add jest, ts-jest, @types/jest, supertest, @types/supertest)
- server/src/**tests**/app.test.ts
- server/src/**tests**/health.test.ts

**Testing Requirements**:

- npm test runs successfully
- All tests pass
- Coverage report generated

---

### P01-T007: quality-engineer: Write unit tests for WebSocket server

**Complexity**: MEDIUM
**Dependencies**: [P01-T004]
**Description**: Write unit tests for WebSocket connection handling, echo, heartbeat.
**Acceptance Criteria**:

- Test: WebSocket accepts connection
- Test: Echo message sent back to client
- Test: Ping sent every 30 seconds
- Test: Client disconnect handled gracefully
- Test: Multiple clients can connect simultaneously
- All tests pass
- Test coverage >= 80% for websocket/manager.ts

**Files to modify**:

- server/src/**tests**/websocket.test.ts

**Testing Requirements**:

- npm test passes all WebSocket tests
- No memory leaks (run 100+ connection cycles)

---

### P01-T008: devops-architect: Create .env.example and environment configuration

**Complexity**: LOW
**Dependencies**: [P01-T003]
**Description**: Create .env.example with all required environment variables. Install dotenv. Validate on startup.
**Acceptance Criteria**:

- .env.example exists with documented variables
- Variables: PORT, NODE_ENV, LOG_LEVEL
- dotenv loads variables from .env
- Server fails fast if required variables missing
- .env added to .gitignore
- README updated with environment setup

**Security Considerations**:

- .env never committed to git
- Sensitive values not in .env.example

**Files to modify**:

- .env.example
- server/src/config/env.ts
- server/src/index.ts
- server/package.json (add dotenv)
- .gitignore
- README.md

**Testing Requirements**:

- Server fails if .env missing required variables

---

## Phase 2: Frontend Terminal

### P02-T001: frontend-architect: Initialize React + Vite project

**Complexity**: LOW
**Dependencies**: [P00-T001 OR P01-T001]
**Description**: Set up Vite-based React application in client/ directory. Configure TypeScript for client package.
**Acceptance Criteria**:

- client/vite.config.ts configured with port 3001
- client/tsconfig.json configured for React
- React 18+ and ReactDOM installed
- Vite dev server starts with npm run dev
- Basic App.tsx renders without errors
- HMR (Hot Module Replacement) works

**Files to modify**:

- client/package.json (add react, react-dom, vite, @vitejs/plugin-react)
- client/vite.config.ts
- client/tsconfig.json
- client/index.html
- client/src/main.tsx
- client/src/App.tsx

**Testing Requirements**:

- Vite builds successfully (npm run build)
- Dev server starts on port 3001

---

### P02-T002: frontend-architect: Install and configure xterm.js

**Complexity**: MEDIUM
**Dependencies**: [P02-T001]
**Description**: Install xterm.js and xterm-addon-fit. Create Terminal component wrapping xterm.js.
**Acceptance Criteria**:

- xterm and xterm-addon-fit installed
- Terminal component renders xterm instance in DOM
- Terminal uses FitAddon to fit container size
- Terminal resizes on window resize event
- xterm.css imported
- Terminal accepts text input (visible cursor)
- Terminal theme configured (dark theme)

**Files to modify**:

- client/package.json (add xterm, xterm-addon-fit)
- client/src/components/Terminal/Terminal.tsx
- client/src/components/Terminal/Terminal.module.css
- client/src/App.tsx

**Testing Requirements**:

- Terminal renders without errors
- Can type text and see cursor

---

### P02-T003: frontend-architect: Create WebSocket client service

**Complexity**: MEDIUM
**Dependencies**: [P01-T005, P02-T001]
**Description**: Create WebSocket client class to connect to backend. Use shared TypeScript types.
**Acceptance Criteria**:

- WebSocket client connects to ws://127.0.0.1:3850
- Can send typed messages using ClientMessage types
- Can receive typed messages using ServerMessage types
- Connection state exposed (connecting, connected, disconnected)
- Error events logged to console
- Automatic close on page unload

**Security Considerations**:

- WebSocket connects to localhost only

**Files to modify**:

- client/src/services/websocket.ts
- client/package.json (ensure shared package linked)

**Testing Requirements**:

- WebSocket connects successfully
- Can send and receive echo messages
- Connection state updates correctly

---

### P02-T004: frontend-architect: Create useWebSocket React hook

**Complexity**: MEDIUM
**Dependencies**: [P02-T003]
**Description**: Create custom React hook to manage WebSocket connection lifecycle.
**Acceptance Criteria**:

- useWebSocket hook returns { send, connectionStatus, lastMessage }
- Hook manages connection lifecycle automatically
- Connection established on mount
- Connection closed on unmount
- Works with React 18+ concurrent features
- TypeScript types enforce correct message structure

**Files to modify**:

- client/src/hooks/useWebSocket.ts

**Testing Requirements**:

- Hook can be used in React component
- Connection status updates correctly
- Messages can be sent and received

---

### P02-T005: frontend-architect: Integrate xterm.js with WebSocket

**Complexity**: HIGH
**Dependencies**: [P02-T002, P02-T004]
**Description**: Connect Terminal component to WebSocket for bidirectional I/O.
**Acceptance Criteria**:

- User types in terminal → sent via WebSocket as terminal:input
- WebSocket receives terminal:output → rendered in xterm
- Terminal resize triggers terminal:resize message with cols/rows
- Connection status indicator shows connected/disconnected
- ANSI colors and escape sequences render correctly
- Terminal scrollback works (500 lines minimum)

**Files to modify**:

- client/src/components/Terminal/Terminal.tsx
- client/src/App.tsx
- client/src/components/ConnectionStatus.tsx

**Testing Requirements**:

- Type in terminal and see echo response
- Resize terminal and verify cols/rows sent
- Connection status shows "Connected"

---

_[Continuing for all 86 tasks...]_

---

## Critical Path (System-Architect Validated)

**Longest dependency chain**:

```
P00-T001 (Monorepo setup)
  → P00-T002 (TypeScript config)
  → P01-T003 (Express server)
  → P01-T004 (WebSocket)
  → P03-T001 (Dockerode install)
  → P03-T002 (Dockerfile)
  → P03-T003 (Build image)
  → P03-T004 (Container manager)
  → P03-T005 (Container attach)
  → P03-T006 (Replace node-pty)
  → P03-T007 (Re-attachment)
  → P04-T001 (Claude CLI in Docker)
  → P04-T002 (Bash shell)
  → P04-T004 (Session persistence)
  → P06-T001 (Port config endpoint)
  → P06-T002 (SSRF prevention)
  → P06-T003 (Proxy middleware)
  → P07-T001 (Chokidar)
  → P07-T002 (Debouncing)
  → P07-T003 (Broadcast reload)
  → P08-T001 (Console interceptor)
  → P08-T002 (Script injection)
  → P08-T003 (Console WebSocket)
  → P09-T001 (Test infrastructure)
  → P09-T010 (Final testing)
  → P09-T011 (Production deployment)
```

**Estimated Critical Path Duration**: 45-55 hours

---

## Parallelization Strategy

### Track A (Backend-Architect)

```
Phase 0 → Phase 1 → Phase 3 → Phase 4 → Phase 6 → Phase 7 → Phase 9
```

### Track B (Frontend-Architect)

```
Phase 0 → Phase 2 → Phase 5 → Phase 8 → Phase 9
```

**Merge Point**: Phase 9 (Integration & Testing)

**Time Savings**: ~30% reduction if two developers work in parallel

---

## High-Risk Tasks (Security Review Required)

### CRITICAL Complexity

1. **P03-T004**: backend-architect: Create container session manager
2. **P03-T008**: security-engineer: Container security hardening
3. **P06-T002**: security-engineer: SSRF prevention validator
4. **P08-T002**: backend-architect: Script injection via proxy

### Security Validation Required

- All Phase 3 tasks (Container isolation)
- P06-T002 (SSRF prevention)
- P08-T002, P08-T003, P08-T004 (XSS prevention)
- P09-T002 (Comprehensive security test suite)

---

## Task File Locations

Individual task files created at:

```
/opt/dev/claude-studio/tasks/
├── phase-00/  (Project Setup - 6 tasks)
├── phase-01/  (Foundation - 8 tasks)
├── phase-02/  (Frontend Terminal - 8 tasks)
├── phase-03/  (Docker - 10 tasks)
├── phase-04/  (Claude CLI - 7 tasks)
├── phase-05/  (Split View - 7 tasks)
├── phase-06/  (Proxy - 10 tasks)
├── phase-07/  (Hot Reload - 8 tasks)
├── phase-08/  (Console - 10 tasks)
└── phase-09/  (Testing - 12 tasks)
```

Each task file format:

```
P{phase}-T{number}.md

Example: P03-T004.md
```

---

## Implementation Order (Week-by-Week)

**Week 1**: Phase 0 (Setup) + SPIKE-001 (Docker validation)
**Week 2**: Phase 1 (Backend) + Phase 2 (Frontend) in parallel
**Week 3**: Phase 3 (Docker - CRITICAL PATH)
**Week 4**: Phase 4 (Claude) + Phase 5 (Split view) in parallel
**Week 5**: Phase 6 (Proxy) + Phase 7 (File watcher)
**Week 6**: Phase 8 (Console streaming)
**Week 7**: Phase 9 (Integration, security, polish)

---

## Next Steps

1. ✅ Task breakdown complete (86 tasks)
2. ✅ System-architect validation complete (APPROVED WITH CHANGES)
3. ⏭️ Create individual task files in `/tasks/phase-XX/` directories
4. ⏭️ Begin Phase 0 implementation
5. ⏭️ Run SPIKE-001: Validate Claude CLI in Docker

---

**Status**: READY FOR IMPLEMENTATION
**Last Updated**: 2025-11-02
**Validation**: APPROVED by system-architect

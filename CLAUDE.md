# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Claude Studio** is a real-time web-based IDE that integrates Claude CLI with live browser preview. It solves the problem of Claude CLI not being able to see browser output by providing a split-panel UI with terminal and live preview, real-time console streaming, and Docker-based isolation.

### Core Architecture

- **Monorepo structure** using pnpm workspaces (server, client, shared)
- **Backend**: Node.js + Express + WebSocket server with Docker-based terminal isolation
- **Frontend**: React + TypeScript + xterm.js for terminal emulation + Vite
- **Communication**: WebSocket for bidirectional real-time communication
- **Isolation**: Docker containers instead of tmux for security and resource limits

## Common Development Commands

### Setup and Installation
```bash
# Install all dependencies (root and workspaces)
pnpm install
```

### Development
```bash
# Run both client and server in development mode (use two terminals)
pnpm --filter server dev    # Terminal 1: Backend on ws://127.0.0.1:3850
pnpm --filter client dev     # Terminal 2: Frontend on http://localhost:3001

# Or run individual workspaces
pnpm dev:server
pnpm dev:client
```

### Building
```bash
# Build everything
pnpm build

# Build individual workspaces
pnpm build:server
pnpm build:client
```

### Testing
```bash
# Run all tests (unit + integration)
pnpm test

# Run tests for specific workspace
pnpm test:server         # Jest tests for backend
pnpm test:client         # Vitest tests for frontend
pnpm test:e2e           # Playwright E2E tests (requires servers running)

# Watch mode for development
pnpm test:watch:server
pnpm test:watch:client

# Coverage reports
pnpm test:coverage
pnpm test:coverage:server
pnpm test:coverage:client

# E2E test variants
pnpm test:e2e:ui        # With Playwright UI
pnpm test:e2e:debug     # With debugger
```

### Linting and Formatting
```bash
pnpm lint               # Check for linting errors
pnpm lint:fix          # Auto-fix linting errors
pnpm format            # Format all files with Prettier
pnpm format:check      # Check formatting without changes
```

### Type Checking
```bash
# Type check without building
pnpm --filter server type-check
pnpm --filter client type-check
```

### Running Tests for a Single File
```bash
# Server (Jest)
cd server && pnpm test <test-file-pattern>
cd server && pnpm test ContainerManager

# Client (Vitest)
cd client && pnpm test <test-file-pattern>

# E2E (Playwright)
pnpm test:e2e tests/e2e/<test-file>.spec.ts
```

## Architecture Patterns

### WebSocket Communication Flow

The system uses a bidirectional WebSocket protocol for all real-time communication:

1. **Client → Server Messages**: Terminal input, console logs from preview iframe, authentication
2. **Server → Client Messages**: Terminal output, reload triggers, server status, container events

Key message types:
- `terminal:input` / `terminal:output` - Terminal I/O
- `console` - Browser console logs streamed to backend
- `reload` - Trigger preview iframe reload after file changes
- `container:*` - Docker container lifecycle events

Implementation files:
- Server: `server/src/websocket/handler.ts`
- Client: `client/src/hooks/useWebSocket.ts`

### Docker Isolation Architecture

**Critical Security Decision**: Uses Docker containers instead of tmux for terminal isolation.

Why Docker over tmux:
- **Security**: Process isolation, resource limits, read-only filesystem
- **Resource Control**: CPU/memory limits via cgroups
- **No Host Access**: Cannot escape to host system
- **Reproducible**: Consistent environment regardless of host

Key components:
- `server/src/docker/ContainerManager.ts` - Container lifecycle management
- `server/src/docker/session-cleanup.ts` - Automatic cleanup of inactive sessions
- `server/src/docker/circuitBreaker.ts` - Fault tolerance for Docker daemon
- `server/src/docker/retry.ts` - Retry logic with exponential backoff

Container configuration:
- Read-only root filesystem (`ReadonlyRootfs: true`)
- Only `/workspace` is writable (bind-mounted project directory)
- Non-root user (`User: '1000:1000'`)
- Resource limits (1GB memory, CPU shares)
- Capabilities dropped (`CapDrop: ['ALL']`)

### File Watching and Hot Reload

The system uses chokidar for file watching:
- Monitors project files for changes
- Triggers WebSocket `reload` message to all connected clients
- Debounced to avoid reload spam
- Implementation: `server/src/watcher/`

### Proxy and Console Injection

Dev server proxy architecture:
- `server/src/proxy/middleware.ts` - HTTP proxy to user's dev server
- `server/src/proxy/html-injection-middleware.ts` - Injects console interceptor script into HTML responses
- `server/src/proxy/PortConfigManager.ts` - Validates and manages port configurations

Security validations:
- Only `127.0.0.1` and `localhost` allowed (SSRF prevention)
- Port range: 3000-9999
- Blocked ports: 22 (SSH), 3306 (MySQL), 5432 (Postgres), etc.
- No HTTP redirects allowed

### State Management

- **Server State**: In-memory Map of active sessions with Docker containers and WebSocket connections
- **Client State**: React hooks (`useState`, `useEffect`) for terminal and preview state
- **No persistence layer** in MVP - sessions are ephemeral

## Important Security Considerations

**Read `SECURITY.md` before making changes to:**
- Docker container configuration
- WebSocket authentication
- Proxy middleware
- Path validation
- Console log rendering

Key security rules:
1. **Never** use `--privileged` mode for Docker containers
2. **Always** validate proxy target hosts and ports against whitelist
3. **Always** HTML-escape console log output (XSS prevention)
4. **Always** validate file paths to prevent directory traversal
5. **Always** enforce resource limits on containers (DoS prevention)

## Critical Infrastructure Rules

### Network Binding
- **ALWAYS** bind to `127.0.0.1` (IPv4 only)
- **NEVER** use `::1` or IPv6 addresses (IPv6 disabled on host system)
- Backend server: `ws://127.0.0.1:3850`
- Frontend dev server: `http://localhost:3001`

### Port Allocation
- Backend: 3850 (registered in `/opt/registry/projects.json`)
- Frontend: 3001 (Vite dev server)
- User dev servers: Auto-detected or configured via PortConfigManager

## Project Structure Notes

### Monorepo Workspaces
```
/server         - Backend Express + WebSocket + Docker manager
/client         - Frontend React + xterm.js + Vite
/shared         - Shared TypeScript types and utilities
```

### Key Backend Modules
```
server/src/
  ├── docker/              - Container isolation and management
  │   ├── ContainerManager.ts
  │   ├── session-cleanup.ts
  │   ├── circuitBreaker.ts
  │   └── retry.ts
  ├── websocket/           - WebSocket server and message handling
  │   ├── handler.ts
  │   └── index.ts
  ├── proxy/               - Dev server proxy with console injection
  ├── watcher/             - File watching for hot reload
  ├── middleware/          - Express middleware (CORS, rate limiting)
  └── security/            - Security utilities and validation
```

### Key Frontend Modules
```
client/src/
  ├── components/          - React components
  │   ├── Terminal/        - xterm.js wrapper
  │   ├── Preview/         - iframe preview panel
  │   └── SplitView/       - Resizable split panel layout
  ├── hooks/               - React hooks
  │   ├── useWebSocket.ts  - WebSocket connection management
  │   ├── useTerminal.ts   - Terminal initialization
  │   └── usePreview.ts    - Preview management
  └── services/            - API clients and utilities
```

## Testing Strategy

### Unit Tests
- **Server**: Jest for Docker manager, WebSocket handlers, security validators
- **Client**: Vitest for React components and hooks
- Mock Docker API calls to avoid real container creation in tests

### Integration Tests
- Full WebSocket flow (client ↔ server)
- Container lifecycle (create, attach, cleanup)
- Proxy middleware with console injection

### E2E Tests (Playwright)
- Prerequisites: Both servers must be running
- Tests terminal input/output, preview reload, console streaming
- Configuration: `playwright.config.ts`
- Global setup: `tests/e2e/global-setup.ts`

## Common Development Patterns

### Adding a New WebSocket Message Type

1. Add type to `shared/src/types.ts`:
```typescript
export type ClientMessage =
  | ExistingTypes
  | { type: 'new-message'; data: string };
```

2. Handle in `server/src/websocket/handler.ts`:
```typescript
case 'new-message':
  // Handle message
  break;
```

3. Send from client in appropriate hook/component

### Adding a New Security Validation

1. Add validator to `server/src/security/` or appropriate module
2. Add unit tests for validation logic
3. Add integration test for attack prevention
4. Document in `SECURITY.md`

### Modifying Docker Container Configuration

1. **CRITICAL**: Review security implications
2. Test resource limits don't break functionality
3. Verify containers are cleaned up properly
4. Update documentation in `ARCHITECTURE.md`

## Environment Configuration

### Server Environment Variables
- `PORT` - Server port (default: 3850)
- `NODE_ENV` - Environment (development/production)
- `LOG_LEVEL` - Logging verbosity
- See `server/.env.example` for full list

### Client Environment Variables
- `VITE_WS_URL` - WebSocket server URL (default: ws://127.0.0.1:3850)

## Build and Deployment

### Development Build
```bash
pnpm build  # Builds both server and client
```

### Production Build
```bash
pnpm build:all  # Full production build
```

### Docker Production Deployment
- Configuration: `docker-compose.prod.yml`
- Dockerfile: `Dockerfile.prod`
- Deployment target: Coolify with Traefik reverse proxy
- Production URL: `https://claude-studio.paysera.tech`

## Troubleshooting Common Issues

### Docker Daemon Connection Issues
- Check Docker Desktop is running
- Run `docker ps` to verify daemon is accessible
- Check `server/src/docker/ContainerManager.ts` health check logic

### WebSocket Connection Failures
- Verify backend is running on correct IPv4 address (127.0.0.1)
- Check browser console for connection errors
- Verify no IPv6 usage (::1)

### Tests Failing
- E2E tests require both servers running
- Unit tests should not require Docker daemon (use mocks)
- Check test-specific environment configuration

### Hot Reload Not Working
- Verify file watcher is initialized (check server logs)
- Check WebSocket connection is active
- Verify file changes are within watched directories

## Code Quality Standards

### TypeScript
- Strict mode enabled in all workspaces
- No `any` types without explicit justification
- Prefer interfaces over types for object shapes

### Error Handling
- Always use try-catch for async operations
- Log errors with context
- Return meaningful error messages to client
- Use circuit breaker pattern for Docker operations

### Security
- Validate all external input
- Escape all output rendered to HTML
- Use parameterized queries (future DB integration)
- Follow principle of least privilege
- See `SECURITY.md` for detailed guidelines

## Documentation

### Key Documentation Files
- `README.md` - Project overview and quick start
- `ARCHITECTURE.md` - Detailed architecture and design
- `SECURITY.md` - Security architecture and threat model
- `MVP_PLAN.md` - Development roadmap
- Phase completion reports - Implementation summaries

### When to Update Documentation
- New security features → Update `SECURITY.md`
- Architecture changes → Update `ARCHITECTURE.md`
- New features → Update `README.md`
- Breaking changes → Update this file and relevant docs

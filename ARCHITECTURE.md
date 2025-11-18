# Claude Studio - Architecture Deep Dive

## Design Goals

1. **Real-time Feedback Loop**: Minimize delay between Claude's actions and visible results
2. **Zero Manual Intervention**: Claude should see everything without user help
3. **Secure Isolation**: Docker containers provide process isolation and resource limits
4. **Lightweight**: Fast startup, minimal overhead
5. **Project-Agnostic**: Works with any web framework (React, Vue, Next.js, etc.)

## System Architecture

### High-Level Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         User's Browser                          │
│  ┌───────────────────────────┬──────────────────────────────┐  │
│  │  Terminal Component       │  Preview Component           │  │
│  │  (xterm.js)               │  (iframe + Console Viewer)   │  │
│  │                           │                              │  │
│  │  WebSocket Client         │  WebSocket Client            │  │
│  └───────────┬───────────────┴──────────┬───────────────────┘  │
└──────────────┼────────────────────────────┼──────────────────────┘
               │                            │
               │ WS: terminal I/O           │ WS: console logs, reload
               │                            │
┌──────────────┼────────────────────────────┼──────────────────────┐
│              ↓                            ↓                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              WebSocket Manager                           │  │
│  │  • Connection pooling                                    │  │
│  │  • Message routing                                       │  │
│  │  • Heartbeat/reconnection                                │  │
│  └────┬─────────────────────────────────────┬───────────────┘  │
│       │                                     │                  │
│  ┌────┴─────────────────┐            ┌─────┴────────────────┐ │
│  │  Container Manager   │            │  Console Interceptor │ │
│  │  (Docker exec)       │            │  • Script injector   │ │
│  │                      │            │  • Log aggregator    │ │
│  │  ┌────────────────┐  │            └──────────────────────┘ │
│  │  │ Docker         │  │                                      │
│  │  │ Container      │  │            ┌──────────────────────┐ │
│  │  │ ┌────────────┐ │  │            │  Dev Server Proxy    │ │
│  │  │ │ Claude CLI │ │  │            │  (http-proxy)        │ │
│  │  │ │ /bin/bash  │ │  │            │  localhost:5173 →    │ │
│  │  │ └────────────┘ │  │            │  /preview/*          │ │
│  │  └────────────────┘  │            └──────────────────────┘ │
│  └──────────────────────┘                                      │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              File Watcher (chokidar)                     │  │
│  │  Monitors: src/, public/, *.config.js                   │  │
│  └────┬─────────────────────────────────────────────────────┘  │
│       │ triggers                                               │
│       ↓                                                        │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Session Manager                             │  │
│  │  • Create/stop Docker containers                         │  │
│  │  • Stream attachment (stdin/stdout/stderr)               │  │
│  │  • Health monitoring                                     │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│                    Node.js Backend Server                      │
│                    (Express + WebSocket)                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ↓
                    ┌──────────────────┐
                    │  File System     │
                    │  User's Project  │
                    │  src/, dist/     │
                    └──────────────────┘
```

## Core Components

### Docker Container Isolation

**Why Docker over tmux?**
- **Security**: Process isolation, resource limits, read-only filesystem
- **Resource Control**: CPU/memory limits via cgroups
- **No Host Access**: Cannot escape to host system
- **Reproducible**: Consistent environment regardless of host

**ContainerManager Singleton** (`server/src/docker/ContainerManager.ts`)

Manages the lifecycle of Docker containers for terminal sessions:

1. **Session Creation**:
   - Creates Docker container with security defaults
   - Mounts workspace directory (read-write)
   - Mounts credentials directories (read-only)
   - Configures tmpfs for writable system directories
   - Starts `/bin/bash -l` (login shell)

2. **Stream Attachment**:
   - Uses `docker exec` to attach to container
   - Returns stdin/stdout/stderr streams
   - Enables TTY mode for interactive terminal

3. **Health Monitoring**:
   - Periodically checks container status (30s interval)
   - Detects crashed containers
   - Updates session status automatically

4. **Cleanup**:
   - Removes zombie containers on startup
   - Auto-removes containers on stop (AutoRemove: true)
   - Stops file watchers on session termination

**Container Security Defaults** (`server/src/docker/types.ts`):

```typescript
{
  // Read-only root filesystem
  ReadonlyRootfs: true,

  // Non-root user
  User: '1000:1000',

  // Resource limits
  Memory: 1073741824, // 1GB
  CpuShares: 512,

  // Drop all capabilities
  CapDrop: ['ALL'],
  CapAdd: [], // No capabilities added

  // Network isolation
  NetworkMode: 'bridge',

  // Security options
  SecurityOpt: ['no-new-privileges'],

  // No privileged mode
  Privileged: false
}
```

**Bind Mounts**:
- `/workspace` (rw) - Project directory for file editing
- `~/.claude-acc4` (ro) - Claude CLI account credentials
- `~/.claude.json` (ro) - OAuth token file
- `~/.claude` (ro) - Claude CLI configuration
- `/opt/mcp` (ro) - MCP server configurations
- `~/.claude-manager` (rw) - Scripts and cache for 'c' alias

**Tmpfs Mounts** (for ReadonlyRootfs):
- `/tmp` (500MB) - System temporary files
- `~/.config` (100MB) - Claude CLI config writes
- `~/.cache` (200MB) - npm and tool caching
- `~/.npm` (100MB) - npm global packages

**Circuit Breaker Pattern** (`server/src/docker/circuitBreaker.ts`):
- Protects against Docker daemon failures
- Opens circuit after 5 consecutive failures
- Half-open retry after 30 seconds
- Prevents cascade failures

**Retry Logic** (`server/src/docker/retry.ts`):
- Exponential backoff for transient failures
- Configurable max retries (default: 3)
- Initial delay: 1000ms, max delay: 10000ms

### WebSocket Server

**Connection Flow**:

```
[Client connects]
         ↓
Server: WebSocket handshake
         ↓
Client: Send session:create or session:reconnect
         ↓
Server: Create/restore Docker container session
         ↓
Server: Attach to container streams
         ↓
Server: Send connected message
         ↓
Client: Initialize terminal + preview
         ↓
Server: Start heartbeat (ping every 30s)
         ↓
[Bidirectional communication]
         ↓
[Client disconnects]
         ↓
Server: Keep container running (allow reconnection)
         ↓
[Client reconnects within timeout]
         ↓
Server: Reattach to existing container
         ↓
Client: Resume session
```

**Message Types** (defined in `shared/src/types.ts`):

#### Client → Server

```typescript
type ClientMessage =
  | { type: 'terminal:input'; data: string; timestamp: string }
  | { type: 'heartbeat'; timestamp: string }
  | { type: 'session:reconnect'; sessionId: string; timestamp: string }
  | { type: 'session:create'; workspacePath: string; projectName?: string; timestamp: string };
```

#### Server → Client

```typescript
type ServerMessage =
  | { type: 'terminal:output'; data: string; timestamp: string }
  | { type: 'connected'; sessionId: string; timestamp: string }
  | { type: 'error'; message: string; code?: string; retryable?: boolean; timestamp: string }
  | { type: 'preview:url'; sessionId: string; url: string; port: number; timestamp: string }
  | { type: 'preview:reload'; sessionId: string; changedFiles: string[]; timestamp: string }
  | { type: 'console:log'; level: 'log'; args: unknown[]; timestamp: string; url?: string }
  | { type: 'console:warn'; level: 'warn'; args: unknown[]; timestamp: string; url?: string }
  | { type: 'console:error'; level: 'error'; args: unknown[]; timestamp: string; url?: string; stack?: string };
```

**WebSocket Handler** (`server/src/websocket/handler.ts`):

Handles all WebSocket message routing:
- `terminal:input` → Write to container stdin
- `heartbeat` → Update session activity timestamp
- `session:create` → Create new Docker container
- `session:reconnect` → Reattach to existing container

**Stream Management**:
- Attach stdout/stderr listeners on session creation
- Forward container output to WebSocket clients
- Handle stream errors and reconnection
- Clean up listeners on session termination

### File Watching

**FileWatcher** (`server/src/watcher/FileWatcher.ts`):

Uses chokidar to monitor project files for changes:

```typescript
const fileWatcher = new FileWatcher({
  watchPath: '/opt/dev/my-project',
  debounceDelay: 500, // 500ms debounce
});

fileWatcher.on('change', (changedFiles) => {
  // Broadcast reload message to all clients
  wsManager.broadcast({
    type: 'preview:reload',
    sessionId,
    changedFiles,
  });
});

fileWatcher.start();
```

**Watched Patterns**:
- Source files: `**/*.{js,jsx,ts,tsx,css,html}`
- Configuration: `*.config.{js,ts}`
- Public assets: `public/**/*`

**Ignored Patterns**:
- `node_modules/**`
- `.git/**`
- `dist/**`, `build/**`
- `*.log`, `.env`

**Debouncing**:
- Prevents reload spam during rapid file changes
- 500ms delay (configurable)
- Batches multiple file changes into single reload event

### Proxy Middleware

**Dev Server Proxy** (`server/src/proxy/middleware.ts`):

Proxies requests from browser to user's development server:

```
Browser: GET /preview/sess_abc123/
         ↓
Backend: Lookup session port (e.g., 5173)
         ↓
Backend: Proxy to http://localhost:5173/
         ↓
Backend: Inject console interceptor script (HTML only)
         ↓
Browser: Receive modified HTML
```

**SSRF Prevention** (`server/src/proxy/PortConfigManager.ts`):

- **Allowed hosts**: Only `127.0.0.1` and `localhost`
- **Port range**: 3000-9999
- **Blocked ports**: 22 (SSH), 3306 (MySQL), 5432 (Postgres), etc.
- **No redirects**: HTTP redirects are blocked

**Console Injection** (`server/src/proxy/html-injection-middleware.ts`):

Injects JavaScript into HTML responses to capture console output:

```javascript
// Injected script (simplified)
const originalConsole = {
  log: console.log,
  warn: console.warn,
  error: console.error,
};

console.log = function(...args) {
  ws.send(JSON.stringify({
    type: 'console:log',
    level: 'log',
    args: args,
    timestamp: new Date().toISOString(),
  }));
  originalConsole.log.apply(console, args);
};

// Similar for warn and error
```

**Script Injector** (`server/src/console/script-injector.ts`):

- Parses HTML using cheerio
- Injects script tag before closing `</body>`
- Preserves HTML structure and attributes
- Only injects into HTML content (checks Content-Type)

## Communication Flow

### 1. User Input → Docker Container

```
User types "ls -la"
         ↓
[Browser Terminal Component (xterm.js)]
         ↓ (WebSocket message: terminal:input)
[Backend WebSocket Handler]
         ↓ (write to stdin stream)
[Docker Container /bin/bash]
         ↓ (stdout/stderr)
[Container stdout listener]
         ↓ (WebSocket message: terminal:output)
[Browser Terminal Component]
         ↓ (xterm.js renders ANSI)
User sees: "total 48\ndrwxr-xr-x  6 user  staff  192 Nov  2 12:00 .\n"
```

### 2. File Change → Hot Reload

```
Claude writes: src/Button.tsx
         ↓
[File System]
         ↓ (fs.watch event)
[chokidar File Watcher]
         ↓ (debounce 500ms)
[FileWatcher emits 'change' event]
         ↓
[WebSocket Handler]
         ↓ (broadcast: preview:reload)
[All Connected Browsers]
         ↓ (iframe.contentWindow.location.reload())
[Browser Reloads Preview]
         ↓
User sees updated UI
```

### 3. Browser Console → Terminal

```
Browser: console.error("TypeError")
         ↓ (injected hook)
[Console Interceptor Script in iframe]
         ↓ (WebSocket message: console:error)
[Backend WebSocket Handler]
         ↓ (format with ANSI colors)
[Write to container stdout stream]
         ↓
[Terminal displays colored output]
         ↓
Claude sees error in terminal context
```

## Data Flow Diagrams

### Terminal Data Flow

```
┌─────────┐ Keypress  ┌──────────┐  WS   ┌────────┐  stdin  ┌────────┐
│ Browser ├──────────→│ Terminal ├──────→│ Backend├────────→│ Docker │
│ xterm.js│           │   WS     │       │ WS Mgr │         │Container│
└─────────┘           └──────────┘       └────────┘         └────┬───┘
     ↑                                         ↑                  │stdout
     │                                         │                  │
     │    Render       WS          stdout      │                  │
     └────────────────────────────────────────┴──────────────────┘
```

### File Watch & Reload Flow

```
┌─────────┐ write  ┌──────────┐ fs.watch ┌──────────┐ emit  ┌──────────┐
│ Claude  ├───────→│   File   ├─────────→│ chokidar ├──────→│ Event    │
│  CLI    │        │  System  │          │  Watcher │       │ Emitter  │
└─────────┘        └──────────┘          └──────────┘       └────┬─────┘
                                                                   │
                                                                   ↓
┌─────────┐ reload ┌──────────┐  WS      ┌──────────┐  broadcast│
│ Browser │←───────┤ Preview  │←─────────┤ WebSocket│←───────────┘
│  iframe │        │Component │          │  Manager │
└─────────┘        └──────────┘          └──────────┘
```

### Console Streaming Flow

```
┌──────────┐ console.error ┌───────────┐ intercept ┌──────────┐
│ Browser  ├──────────────→│  Injected ├──────────→│  Hook    │
│ App Code │               │  Console  │           │  Script  │
└──────────┘               └───────────┘           └────┬─────┘
                                                         │WS
                                                         ↓
┌──────────┐ display ┌───────────┐ forward  ┌──────────────────┐
│ Terminal │←────────┤  WS       │←─────────┤  Console Handler │
│ (Claude  │         │  Handler  │          │                  │
│  sees)   │         │           │          └──────────────────┘
└──────────┘         └───────────┘
```

## Security Architecture

### Docker Isolation

**Process Isolation**:
- Containers run in separate namespaces
- Cannot access other containers or host processes
- PID namespace prevents process enumeration

**Filesystem Isolation**:
- Read-only root filesystem (ReadonlyRootfs: true)
- Only workspace and tmpfs mounts are writable
- Credential directories mounted read-only

**Resource Limits**:
- Memory: 1GB (prevents DoS via memory exhaustion)
- CPU shares: 512 (fair CPU allocation)
- No swap (prevents memory-based attacks)

**Capability Dropping**:
- All capabilities dropped (CapDrop: ['ALL'])
- No privileged operations allowed
- No new privileges (SecurityOpt: ['no-new-privileges'])

**Network Isolation**:
- Bridge network (NetworkMode: 'bridge')
- No host network access
- Outbound traffic allowed (for npm install, etc.)

### WebSocket Security

**Authentication** (Future):
- JWT token validation on connection
- Session-scoped tokens
- Token expiration and refresh

**Rate Limiting** (`server/src/middleware/rate-limit.ts`):
- Max 100 messages per minute per connection
- Prevents message flooding
- Automatic connection termination on abuse

**Input Validation**:
- All messages validated against TypeScript types
- Unknown message types rejected
- Malformed JSON rejected

### Proxy Security

**SSRF Prevention**:
- Only localhost/127.0.0.1 allowed as proxy targets
- Port whitelist (3000-9999, excluding sensitive ports)
- No HTTP redirects followed
- URL parsing validation

**XSS Prevention**:
- Console output HTML-escaped before rendering
- Script injection only for same-origin iframes
- Content-Security-Policy headers

**Path Traversal Prevention**:
- Workspace paths must be absolute
- Path normalization checks
- Allowed directory whitelist (/opt/dev, /opt/prod)

## Session Lifecycle

### Creating a Session

```
1. Client connects to WebSocket
2. Client sends session:create message
   {
     type: 'session:create',
     workspacePath: '/opt/dev/my-project',
     projectName: 'my-project'
   }
3. Server validates workspace path
4. Server creates Docker container
   - Image: claude-studio-sandbox:latest
   - Mounts: workspace (rw), credentials (ro)
   - User: 1000:1000
   - Cmd: ['/bin/bash', '-l']
5. Server starts container
6. Server attaches to container streams (docker exec)
7. Server creates FileWatcher for workspace
8. Server sends connected message
   {
     type: 'connected',
     sessionId: 'sess_abc123'
   }
9. Client initializes terminal and preview
10. Session is active
```

### Reconnecting to a Session

```
1. Client connects to WebSocket
2. Client sends session:reconnect message
   {
     type: 'session:reconnect',
     sessionId: 'sess_abc123'
   }
3. Server looks up session
4. Server checks if container is still running
   - If running: Reattach to streams
   - If stopped: Send error message
5. Server sends connected message
6. Client resumes session
```

### Stopping a Session

```
1. Client closes connection or sends stop request
2. Server detects disconnect
3. Server keeps container running (allow reconnection)
4. After timeout (e.g., 5 minutes of inactivity):
   - Server stops FileWatcher
   - Server stops container (docker stop)
   - Container auto-removes (AutoRemove: true)
   - Server deletes session from memory
```

### Health Monitoring

```
Every 30 seconds:
1. Server iterates active sessions
2. For each session:
   - Check if container is running (docker inspect)
   - If not running:
     - Update session status to 'error'
     - Set error message
     - Keep session in memory (allow reconnection attempt)
3. Log any status changes
```

## Module Architecture

### Backend Modules

```
server/
├── index.ts                    # Express app entry point
├── app.ts                      # Express app configuration
├── websocket/
│   ├── index.ts               # WebSocket server setup
│   └── handler.ts             # Message routing and session management
├── docker/
│   ├── ContainerManager.ts   # Docker container lifecycle
│   ├── types.ts              # Security defaults and types
│   ├── errors.ts             # Typed error classes
│   ├── circuitBreaker.ts     # Circuit breaker for Docker API
│   ├── retry.ts              # Retry logic with backoff
│   └── session-cleanup.ts    # Zombie container cleanup
├── watcher/
│   └── FileWatcher.ts        # chokidar file watching
├── proxy/
│   ├── middleware.ts         # HTTP proxy to dev server
│   ├── html-injection-middleware.ts # Console script injection
│   └── PortConfigManager.ts  # Port validation and SSRF prevention
├── console/
│   ├── interceptor.js        # Browser console hook script
│   └── script-injector.ts    # HTML parser and injector
├── middleware/
│   ├── rate-limit.ts         # WebSocket rate limiting
│   └── ws-auth.ts            # WebSocket authentication (future)
└── utils/
    └── logger.ts             # Structured logging
```

### Frontend Modules

```
client/
├── App.tsx                     # Root component
├── components/
│   ├── Terminal.tsx           # xterm.js terminal component
│   ├── Preview.tsx            # iframe preview panel
│   ├── ConnectionStatus.tsx   # WebSocket status indicator
│   ├── ProjectSelector.tsx    # Project workspace selector
│   ├── MCPStatus.tsx          # MCP integration status
│   └── MCPInfoPanel.tsx       # MCP usage information
├── hooks/
│   ├── useWebSocket.ts        # WebSocket connection + reconnect
│   └── useMCP.ts              # MCP status polling
├── services/
│   └── websocket.ts           # WebSocket client class
└── utils/
    └── storage.ts             # LocalStorage helpers
```

## State Management

### Backend State (In-Memory)

```typescript
interface ServerState {
  sessions: Map<
    string,
    {
      sessionId: string;
      containerId: string;
      status: 'creating' | 'running' | 'stopping' | 'stopped' | 'error';
      projectName: string;
      workspacePath: string;
      createdAt: Date;
      lastActivity: Date;
      fileWatcher?: FileWatcher;
      error?: string;
    }
  >;
}
```

**Note**: No session persistence in MVP. Sessions are ephemeral and lost on server restart.

### Frontend State (React Hooks)

```typescript
interface AppState {
  terminal: {
    connected: boolean;
    sessionId: string | null;
  };

  preview: {
    url: string | null;
    loading: boolean;
  };

  connection: {
    status: 'connecting' | 'connected' | 'disconnected' | 'error';
    error?: string;
  };
}
```

## Performance Considerations

### 1. Debouncing File Changes

```typescript
// Avoid reload spam
const debouncedReload = debounce((files: string[]) => {
  wsManager.broadcast({
    type: 'preview:reload',
    sessionId,
    changedFiles: files,
  });
}, 500); // 500ms delay
```

### 2. Stream Buffering

Docker streams are forwarded immediately without batching to maintain terminal responsiveness. The native Node.js stream backpressure handling prevents buffer overflow.

### 3. Terminal Output Handling

xterm.js has built-in buffering and virtual scrollback, so no additional throttling is needed. Output is rendered at ~60fps automatically.

## Error Handling

### Connection Loss

```typescript
// Auto-reconnect with exponential backoff
let reconnectAttempt = 0;
const reconnect = () => {
  const delay = Math.min(1000 * Math.pow(2, reconnectAttempt), 30000);
  setTimeout(() => {
    connectWebSocket();
    reconnectAttempt++;
  }, delay);
};

ws.on('close', reconnect);
ws.on('error', reconnect);
```

### Container Crash

```typescript
// Health monitoring detects crashed containers
if (!isRunning) {
  session.status = 'error';
  session.error = 'Container crashed or stopped unexpectedly';

  // Send error to connected clients
  wsManager.send(sessionId, {
    type: 'error',
    message: 'Container crashed',
    code: 'CONTAINER_CRASHED',
    retryable: true,
  });
}
```

### Docker Daemon Failure

```typescript
// Circuit breaker prevents cascade failures
try {
  await dockerCircuitBreaker.execute(async () => {
    return await docker.createContainer(config);
  });
} catch (error) {
  if (error.message === 'Circuit breaker is OPEN') {
    // Docker daemon is down or unresponsive
    throw new DockerDaemonError('Docker daemon unavailable');
  }
}
```

## Testing Strategy

### Unit Tests

**Backend**:
- Docker container creation (mocked Docker API)
- WebSocket message routing
- File watcher debouncing
- Proxy middleware (SSRF validation)
- Console script injection

**Frontend**:
- React component rendering
- WebSocket connection logic
- Terminal initialization
- Preview iframe management

### Integration Tests

- Full WebSocket flow (client ↔ server)
- Container lifecycle (create, attach, cleanup)
- File watching → reload trigger
- Console streaming → terminal output

### E2E Tests (Playwright)

- Terminal input/output
- Preview reload on file change
- Console error streaming
- Session reconnection

**Prerequisites**: Both servers running (backend: 3850, frontend: 3001)

## Deployment Architecture

### Development

```
Frontend: http://localhost:3001 (Vite dev server)
Backend:  ws://127.0.0.1:3850 (WebSocket + HTTP)
Docker:   /var/run/docker.sock (Unix socket)
```

### Production (Docker Compose + Traefik)

```yaml
# docker-compose.prod.yml
services:
  claude-studio:
    build:
      context: .
      dockerfile: Dockerfile.prod
    ports:
      - "3850:3850"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - /opt/dev:/opt/dev
      - /opt/prod:/opt/prod
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.claude-studio.rule=Host(`claude-studio.paysera.tech`)"
      - "traefik.http.routers.claude-studio.tls=true"
```

**Production URL**: https://claude-studio.paysera.tech

## MCP Integration

### Chrome DevTools MCP Server

Claude Studio integrates with the Chrome DevTools MCP server to provide browser inspection capabilities to Claude CLI.

**Configuration**:
- Chrome debug port: 9223
- MCP configs: `/opt/mcp/`
- Mounted read-only into containers

**Status Endpoint**: `GET /api/mcp/status`

```json
{
  "enabled": true,
  "chromeDebugPort": 9223,
  "chromeAvailable": true
}
```

**UI Components**:
- `MCPStatus.tsx` - Shows MCP availability indicator
- `MCPInfoPanel.tsx` - Displays MCP usage instructions

**Usage**: Claude CLI can use Chrome DevTools MCP to inspect DOM, execute JavaScript, and debug web applications directly from the terminal.

---

**Next Steps**: See [MVP_PLAN.md](./MVP_PLAN.md) for development roadmap.

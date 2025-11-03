# Claude Studio - Architecture Deep Dive

## 🎯 Design Goals

1. **Real-time Feedback Loop**: Minimize delay between Claude's actions and visible results
2. **Zero Manual Intervention**: Claude should see everything without user help
3. **Persistent Sessions**: Work continues even after browser disconnect
4. **Lightweight**: Fast startup, minimal overhead
5. **Project-Agnostic**: Works with any web framework (React, Vue, Next.js, etc.)

## 🏛️ System Architecture

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
│  │  Terminal Bridge     │            │  Console Interceptor │ │
│  │  (node-pty)          │            │  • Script injector   │ │
│  │                      │            │  • Log aggregator    │ │
│  │  ┌────────────────┐  │            └──────────────────────┘ │
│  │  │ tmux session   │  │                                      │
│  │  │ ┌────────────┐ │  │            ┌──────────────────────┐ │
│  │  │ │ Claude CLI │ │  │            │  Dev Server Proxy    │ │
│  │  │ │  Process   │ │  │            │  (http-proxy)        │ │
│  │  │ └────────────┘ │  │            │  localhost:5173 →    │ │
│  │  └────────────────┘  │            │  /preview/*          │ │
│  └──────────────────────┘            └──────────────────────┘ │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              File Watcher (chokidar)                     │  │
│  │  Monitors: src/, public/, *.config.js                   │  │
│  └────┬─────────────────────────────────────────────────────┘  │
│       │ triggers                                               │
│       ↓                                                        │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Session Manager                             │  │
│  │  • Create/restore tmux sessions                          │  │
│  │  • Project state persistence                             │  │
│  │  • Background task tracking                              │  │
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

## 📡 Communication Flow

### 1. User Input → Claude CLI

```
User types "add button"
         ↓
[Browser Terminal Component]
         ↓ (WebSocket message: terminal:input)
[Backend WebSocket Manager]
         ↓ (write to stdin)
[node-pty → tmux → Claude CLI]
         ↓ (stdout/stderr)
[node-pty captures output]
         ↓ (WebSocket message: terminal:output)
[Browser Terminal Component]
         ↓ (xterm.js renders ANSI)
User sees: "✓ Adding button to App.tsx"
```

### 2. File Change → Hot Reload

```
Claude writes: src/Button.tsx
         ↓
[File System]
         ↓ (fs.watch event)
[chokidar File Watcher]
         ↓ (triggers reload)
[WebSocket Manager]
         ↓ (broadcast: {type: 'reload'})
[All Connected Browsers]
         ↓ (iframe.contentWindow.location.reload())
[Browser Reloads Preview]
         ↓
User sees updated UI
```

### 3. Browser Console → Claude CLI

```
Browser: console.error("TypeError")
         ↓ (injected hook)
[Console Interceptor Script in iframe]
         ↓ (WebSocket message: console)
[Backend WebSocket Manager]
         ↓ (format as CLI output)
[Terminal Bridge]
         ↓ (write to Claude's view)
[Claude CLI sees in terminal]
         ↓
Claude: "I see the error, fixing..."
```

## 🔌 WebSocket Protocol

### Message Types

#### Client → Server

```typescript
type ClientMessage =
  | { type: 'terminal:input'; data: string }
  | { type: 'terminal:resize'; cols: number; rows: number }
  | {
      type: 'console';
      level: 'log' | 'error' | 'warn' | 'info';
      message: any[];
      stack?: string;
      timestamp: number;
    }
  | { type: 'preview:ready'; url: string }
  | { type: 'preview:error'; error: string }
  | { type: 'ping' };
```

#### Server → Client

```typescript
type ServerMessage =
  | { type: 'terminal:output'; data: string }
  | { type: 'reload'; reason: string; file?: string }
  | { type: 'server:status'; devServer: DevServerStatus }
  | { type: 'session:restored'; sessionId: string }
  | { type: 'pong' };
```

### Connection Lifecycle

```
[Client connects]
         ↓
Server: authenticate token
         ↓
Server: restore or create session
         ↓
Server: send session:restored
         ↓
Client: render terminal + preview
         ↓
Server: start heartbeat (ping every 30s)
         ↓
[Bidirectional communication]
         ↓
[Client disconnects]
         ↓
Server: keep tmux session alive
         ↓
[Client reconnects]
         ↓
Server: reattach to same tmux session
         ↓
Client: sees full history
```

## 🗂️ Data Flow Diagrams

### Terminal Data Flow

```
┌─────────┐ Keypress  ┌──────────┐  WS   ┌────────┐  stdin  ┌────────┐
│ Browser ├──────────→│ Terminal ├──────→│ Backend├────────→│ Claude │
│ xterm.js│           │   WS     │       │node-pty│         │  CLI   │
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
┌──────────┐ display ┌───────────┐ pipe    ┌──────────────────┐
│ Terminal │←────────┤  Backend  │←────────┤  Console Logger  │
│ (Claude  │         │  Terminal │         │                  │
│  sees)   │         │  Bridge   │         └──────────────────┘
└──────────┘         └───────────┘
```

## 🔐 Security Architecture

### 1. Session Isolation

- Each project gets unique tmux session
- Sessions are user-scoped (not shared)
- File system access limited to project directory

### 2. Authentication

```typescript
// JWT token with project scope
interface SessionToken {
  userId: string;
  sessionId: string;
  projectPath: string;
  expiresAt: number;
}
```

### 3. WebSocket Authentication

```typescript
// First message after connect must be auth
ws.on('message', (msg) => {
  if (!ws.authenticated) {
    const { token } = JSON.parse(msg);
    if (verifyToken(token)) {
      ws.authenticated = true;
    } else {
      ws.close(1008, 'Unauthorized');
    }
  }
});
```

### 4. Console Script Injection Safety

```javascript
// Only inject into same-origin iframes
if (iframe.contentWindow.origin === window.location.origin) {
  injectConsoleInterceptor(iframe);
}
```

## 🏗️ Module Architecture

### Backend Modules

```
server/
├── index.ts                    # Express app entry point
├── websocket/
│   ├── manager.ts             # Connection pooling, routing
│   ├── handlers/
│   │   ├── terminal.ts        # Handle terminal messages
│   │   ├── console.ts         # Handle console messages
│   │   └── preview.ts         # Handle preview messages
│   └── middleware/
│       ├── auth.ts            # Token verification
│       └── rate-limit.ts      # Prevent abuse
├── terminal/
│   ├── bridge.ts              # node-pty wrapper
│   ├── tmux-manager.ts        # tmux session lifecycle
│   └── output-parser.ts       # Parse Claude CLI ANSI output
├── watcher/
│   ├── file-watcher.ts        # chokidar setup
│   └── reload-manager.ts      # Debounce, smart reload
├── proxy/
│   ├── dev-server.ts          # Detect and proxy dev server
│   └── script-injector.ts     # Inject console hook
└── session/
    ├── manager.ts             # Session CRUD
    └── persistence.ts         # Save/restore state
```

### Frontend Modules

```
client/
├── App.tsx                     # Root component
├── components/
│   ├── SplitView.tsx          # Layout with resizable panels
│   ├── Terminal/
│   │   ├── Terminal.tsx       # xterm.js wrapper
│   │   └── TerminalContext.tsx # Share terminal instance
│   ├── Preview/
│   │   ├── Preview.tsx        # iframe manager
│   │   ├── ConsolePanel.tsx   # Display console logs
│   │   └── ReloadButton.tsx   # Manual reload button
│   └── Toolbar/
│       ├── Toolbar.tsx        # Top bar
│       ├── SessionInfo.tsx    # Display session ID, status
│       └── SettingsMenu.tsx   # Configuration
├── hooks/
│   ├── useWebSocket.ts        # WebSocket connection + reconnect
│   ├── useTerminal.ts         # Terminal initialization
│   ├── usePreview.ts          # Preview management
│   └── useHotReload.ts        # Listen for reload events
├── services/
│   ├── websocket.ts           # WebSocket client class
│   └── api.ts                 # REST API calls (if needed)
└── utils/
    ├── console-interceptor.ts # Script to inject in iframe
    └── storage.ts             # LocalStorage helpers
```

## 🔄 State Management

### Backend State (In-Memory)

```typescript
interface ServerState {
  sessions: Map<
    string,
    {
      sessionId: string;
      tmuxSession: string;
      ptyProcess: IPty;
      projectPath: string;
      devServer: { port: number; url: string } | null;
      connections: Set<WebSocket>;
    }
  >;

  fileWatchers: Map<string, FSWatcher>;
}
```

### Frontend State (React Context + Hooks)

```typescript
interface AppState {
  terminal: {
    instance: Terminal | null;
    connected: boolean;
  };

  preview: {
    url: string | null;
    loading: boolean;
    consoleMessages: ConsoleMessage[];
  };

  session: {
    id: string | null;
    status: 'connecting' | 'connected' | 'disconnected';
  };

  ui: {
    splitPosition: number; // percentage
    showConsole: boolean;
  };
}
```

## 📊 Performance Considerations

### 1. Debouncing File Changes

```typescript
// Avoid reload spam
const debouncedReload = debounce((file: string) => {
  wsManager.broadcast({ type: 'reload', file });
}, 300);
```

### 2. Console Message Batching

```typescript
// Send console logs in batches
const consoleBatch: ConsoleMessage[] = [];
setInterval(() => {
  if (consoleBatch.length > 0) {
    ws.send(
      JSON.stringify({
        type: 'console:batch',
        messages: consoleBatch,
      })
    );
    consoleBatch.length = 0;
  }
}, 100); // Every 100ms
```

### 3. Terminal Output Throttling

```typescript
// Prevent terminal flood
const outputBuffer: string[] = [];
pty.onData((data) => {
  outputBuffer.push(data);
});

setInterval(() => {
  if (outputBuffer.length > 0) {
    ws.send(
      JSON.stringify({
        type: 'terminal:output',
        data: outputBuffer.join(''),
      })
    );
    outputBuffer.length = 0;
  }
}, 16); // ~60fps
```

## 🚀 Scalability

### Single User (MVP)

- 1 backend server
- N sessions per user
- 1 WebSocket per browser tab

### Multi-User (Future)

- Horizontal scaling: N backend servers
- Redis for session state
- WebSocket sticky sessions (load balancer)
- Database for persistence

```
[Load Balancer]
      ↓
[Server 1] [Server 2] [Server 3]
      ↓         ↓         ↓
    [Redis Pub/Sub]
      ↓
 [Shared State]
```

## 🐛 Error Handling

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

### Terminal Crash

```typescript
// Restart Claude CLI if it crashes
pty.on('exit', (code) => {
  console.error(`Claude CLI exited with code ${code}`);
  // Notify user
  wsManager.broadcast({
    type: 'terminal:crashed',
    code: code,
  });
  // Auto-restart
  setTimeout(() => restartTerminal(), 1000);
});
```

### Dev Server Detection Failure

```typescript
// Fallback to manual URL input
if (!detectedDevServer) {
  wsManager.send({
    type: 'server:manual-input',
    message: 'Could not detect dev server. Please enter URL manually.',
  });
}
```

## 🧪 Testing Strategy

### Unit Tests

- Terminal bridge logic
- WebSocket message routing
- File watcher debouncing
- Console interceptor injection

### Integration Tests

- Full WebSocket flow (client ↔ server)
- Terminal I/O with mock pty
- File changes trigger reload
- Console streaming end-to-end

### E2E Tests (Playwright)

- Open browser → See split view
- Type command → Claude responds
- File change → Preview reloads
- Console error → Shows in terminal

## 📦 Deployment Architecture

### Development

```
localhost:3850 (frontend dev server)
localhost:3851 (backend server)
```

### Production (Coolify)

```
docker-compose.yml:
  - Node.js backend (port 3850)
  - Traefik labels for HTTPS
  - Persistent volume for tmux sessions
  - Auto-restart on crash
```

---

**Next Steps**: See [MVP_PLAN.md](./MVP_PLAN.md) for implementation roadmap.

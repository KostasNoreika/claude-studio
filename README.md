# Claude Studio

[![CI](https://github.com/YOUR_USERNAME/claude-studio/workflows/CI/badge.svg)](https://github.com/YOUR_USERNAME/claude-studio/actions)

**Real-time Web Development Environment with Claude CLI Integration**

## 🎯 Problem Statement

Current workflow issues when using Claude CLI in VS Code Server terminal:

- ❌ Claude CLI **cannot see the browser** (no visual feedback)
- ❌ Must **manually refresh** browser to see changes
- ❌ Chrome DevTools MCP is **slow and poll-based** (not real-time)
- ❌ **No live preview** alongside terminal output
- ❌ Poor **feedback loop** for rapid development

## 💡 Solution

Claude Studio is a web-based IDE that combines:

1. **Split Panel UI**: Terminal (left) + Live Preview (right)
2. **Real-time Console Streaming**: Browser errors → Claude CLI instantly
3. **Hot Reload**: File changes trigger automatic browser refresh
4. **Persistent Sessions**: Claude continues working after browser close
5. **Full Autonomy**: Claude sees everything and controls browser

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Web Browser UI                       │
├──────────────────────────┬──────────────────────────────┤
│   Terminal Panel         │   Live Preview Panel         │
│   (xterm.js)             │   (iframe + console viewer)  │
│                          │                              │
│   > claude "add button"  │   ┌──────────────────────┐  │
│   ✓ Writing Button.tsx   │   │  Your App Preview    │  │
│   ✓ Updating App.tsx     │   │  [Button rendered]   │  │
│   ⚡ Auto-reloading...   │   │                      │  │
│                          │   └──────────────────────┘  │
│                          │                              │
│                          │   Console:                   │
│                          │   ✅ No errors               │
│                          │   🔄 Hot reloaded at 14:32   │
└──────────────────────────┴──────────────────────────────┘
              ↕                          ↕
        WebSocket                  WebSocket
              ↕                          ↕
┌─────────────────────────────────────────────────────────┐
│                   Node.js Backend Server                │
├─────────────────────────────────────────────────────────┤
│  • WebSocket Manager (bidirectional)                    │
│  • Terminal Bridge (node-pty → Claude CLI)              │
│  • File Watcher (chokidar)                              │
│  • Dev Server Proxy (http-proxy-middleware)             │
│  • Console Stream Interceptor                           │
│  • Session Manager (tmux persistence)                   │
└─────────────────────────────────────────────────────────┘
              ↕                          ↕
        node-pty                   File System
              ↕                          ↕
┌─────────────────────────────────────────────────────────┐
│              tmux Session (persistent)                  │
│  ┌───────────────────────────────────────────────────┐ │
│  │  Claude CLI Process                               │ │
│  │  $ claude "add a login form"                      │ │
│  │                                                   │ │
│  │  Reads: project files                            │ │
│  │  Writes: Button.tsx, App.tsx, ...                │ │
│  │  Executes: npm install, git commit, etc.         │ │
│  └───────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
              ↕
┌─────────────────────────────────────────────────────────┐
│                   Your Project Files                    │
│   src/App.tsx, package.json, etc.                      │
└─────────────────────────────────────────────────────────┘
```

## 🔥 Key Features

### 1. Real-Time Console Streaming

```javascript
// Browser-side console hook
const originalConsole = window.console;
['log', 'error', 'warn', 'info'].forEach((level) => {
  window.console[level] = (...args) => {
    originalConsole[level](...args);
    ws.send(
      JSON.stringify({
        type: 'console',
        level: level,
        message: args,
        timestamp: Date.now(),
      })
    );
  };
});

// Claude CLI sees immediately:
// "Error: Cannot read property 'foo' of undefined at App.tsx:42"
// Claude: "I see the error, fixing it now..."
```

### 2. Hot Reload

```javascript
// File watcher triggers reload
chokidar.watch('./src').on('change', (path) => {
  console.log(`File changed: ${path}`);
  // Notify all connected browsers
  wsManager.broadcast({
    type: 'reload',
    file: path,
  });
});
```

### 3. Split Panel UI

- Left: xterm.js terminal (full Claude CLI interaction)
- Right: iframe with live preview + console viewer
- Resizable divider
- Synchronized scrolling for errors

### 4. Persistent Sessions (tmux)

```bash
# Claude continues working even after browser closes
tmux new-session -d -s claude-studio-session-123
tmux send-keys -t claude-studio-session-123 "claude" Enter

# Reconnect anytime
tmux attach -t claude-studio-session-123
```

### 5. Dev Server Auto-Start

```javascript
// Detect project type and start appropriate server
const detectedServer = detectProjectType(); // vite, next, create-react-app, etc.
startDevServer(detectedServer); // npm run dev, npm start, etc.
```

## 🛠️ Tech Stack

| Layer          | Technology                 | Purpose                               |
| -------------- | -------------------------- | ------------------------------------- |
| **Frontend**   | React + TypeScript         | UI framework                          |
| **Terminal**   | xterm.js + xterm-addon-fit | Browser terminal emulator             |
| **Split View** | react-split-pane           | Resizable panels                      |
| **Backend**    | Node.js + Express          | HTTP server                           |
| **WebSocket**  | ws (WebSocket library)     | Real-time bidirectional communication |
| **PTY**        | node-pty                   | Pseudo-terminal (spawns Claude CLI)   |
| **Session**    | tmux                       | Persistent sessions                   |
| **File Watch** | chokidar                   | Hot reload trigger                    |
| **Proxy**      | http-proxy-middleware      | Dev server proxy                      |
| **Auth**       | JWT tokens                 | Session authentication                |

## 📦 Project Structure

```
claude-studio/
├── server/
│   ├── index.ts              # Express server entry
│   ├── websocket-manager.ts  # WebSocket handler
│   ├── terminal-bridge.ts    # node-pty wrapper for Claude CLI
│   ├── file-watcher.ts       # chokidar setup
│   ├── session-manager.ts    # tmux session handling
│   ├── dev-server-proxy.ts   # Proxy to user's dev server
│   └── console-interceptor.ts # Inject console hooks
├── client/
│   ├── components/
│   │   ├── SplitView.tsx     # Main split panel layout
│   │   ├── Terminal.tsx      # xterm.js wrapper
│   │   ├── Preview.tsx       # iframe + console viewer
│   │   └── ConsolePanel.tsx  # Console logs display
│   ├── hooks/
│   │   ├── useWebSocket.ts   # WebSocket connection
│   │   ├── useTerminal.ts    # Terminal management
│   │   └── useHotReload.ts   # Auto-reload logic
│   ├── App.tsx               # Main app
│   └── main.tsx              # Entry point
├── shared/
│   └── types.ts              # Shared TypeScript types
├── package.json
├── tsconfig.json
└── README.md                 # This file
```

## 🚀 How It Works

### Startup Flow:

1. User opens `http://localhost:3850`
2. Backend creates tmux session
3. Backend spawns Claude CLI in tmux via node-pty
4. Frontend connects via WebSocket
5. Backend detects project type and starts dev server
6. Backend proxies dev server to `http://localhost:3850/preview`
7. Backend injects console streaming script into HTML
8. User sees split view: terminal + live preview

### Development Flow:

1. User types in terminal: `"add a login button"`
2. Claude CLI receives command (via node-pty)
3. Claude writes files: `Button.tsx`, updates `App.tsx`
4. File watcher detects changes
5. Backend broadcasts reload event via WebSocket
6. Frontend iframe reloads automatically
7. Browser console logs stream to backend via WebSocket
8. Backend pipes console logs to Claude CLI stdin
9. Claude sees: `"Console: Button rendered successfully"`
10. Claude confirms: `"✅ Login button added and working"`

### Error Handling Flow:

1. Browser: `console.error("TypeError: Cannot read 'user' of undefined")`
2. WebSocket sends error to backend
3. Backend displays in terminal (Claude sees it)
4. Claude: "I see the error in App.tsx:42"
5. Claude fixes the error
6. File watcher triggers reload
7. Browser: `console.log("✅ No errors")`
8. Claude: "Fixed! The error is resolved."

## 🎨 UI Design

### Split Panel Layout:

```
┌─────────────────────────────────────────────────┐
│  Claude Studio                    [⚙️ Settings] │
├─────────────────────┬───────────────────────────┤
│  Terminal           │ │  Live Preview           │
│                     │ │                         │
│  $ claude "help"    │ │  ┌─────────────────┐   │
│                     │ │  │                 │   │
│  I'm Claude Code.   │ │  │  Your App Here  │   │
│  How can I help?    │ │  │                 │   │
│                     │ │  │  [Login Button] │   │
│  >                  │ │  │                 │   │
│                     │ │  └─────────────────┘   │
│                     │ │                         │
│                     │ │  📋 Console:            │
│                     │ │  ✅ App mounted         │
│                     │ │  🔄 Reloaded at 14:32   │
├─────────────────────┴─┴─────────────────────────┤
│  Session: claude-123  |  Port: 3850  |  ✅ Live│
└─────────────────────────────────────────────────┘
```

## 🔌 API Design

### WebSocket Messages

**Client → Server:**

```typescript
// Terminal input
{
  type: 'terminal:input',
  data: 'claude "add button"\n'
}

// Console from browser
{
  type: 'console',
  level: 'error',
  message: ['TypeError: foo is undefined'],
  stack: 'at App.tsx:42',
  timestamp: 1699564800000
}

// Heartbeat
{
  type: 'ping'
}
```

**Server → Client:**

```typescript
// Terminal output
{
  type: 'terminal:output',
  data: '\x1b[32m✓\x1b[0m Button added'
}

// Reload trigger
{
  type: 'reload',
  reason: 'file:changed',
  file: 'src/App.tsx'
}

// Server status
{
  type: 'server:status',
  devServer: { running: true, port: 5173, url: 'http://localhost:5173' }
}

// Pong
{
  type: 'pong'
}
```

## 🎯 MVP Features (Phase 1)

- [x] Project structure
- [ ] Basic Express server
- [ ] WebSocket server setup
- [ ] xterm.js frontend terminal
- [ ] node-pty wrapper for Claude CLI
- [ ] Split panel UI (React)
- [ ] iframe preview panel
- [ ] Console streaming (browser → server)
- [ ] File watcher + hot reload
- [ ] tmux session persistence
- [ ] Dev server auto-detection

## 🚧 Future Features (Phase 2+)

- [ ] Multi-project support
- [ ] Project templates
- [ ] Git integration UI
- [ ] Network requests viewer (like Chrome DevTools Network tab)
- [ ] Performance metrics
- [ ] Screenshot on error
- [ ] Recording/replay session
- [ ] Collaborative mode (multiple users)
- [ ] Cloud deployment integration
- [ ] Browser DevTools integration (Elements, Network, etc.)

## 📚 Inspiration & References

### Projects We Learned From:

1. **claude-code-web** (vultuk/claude-code-web)
   - ✅ WebSocket + node-pty architecture
   - ✅ Session persistence
   - ❌ No preview panel

2. **visual-claude** (thetronjohnson/visual-claude)
   - ✅ Hot reload mechanism
   - ✅ File watcher
   - ❌ No split view

3. **bolt.diy** (stackblitz-labs/bolt.diy)
   - ✅ Split panel UI concept
   - ✅ Integrated terminal + preview
   - ❌ WebContainers (browser-based, not server-side)

4. **OpenHands** (All-Hands-AI/OpenHands)
   - ✅ Full autonomous agent platform
   - ❌ Too heavy for simple wrapper

### Our Unique Value:

✅ **Server-side** (not WebContainers)
✅ **Real-time console streaming** (not poll-based)
✅ **Claude CLI integration** (not built-in LLM)
✅ **Split view** (terminal + preview)
✅ **Lightweight** (not a full platform)

## 🔧 Development Setup

```bash
# Clone or create project
cd /opt/dev/claude-studio

# Install dependencies
pnpm install

# Development mode (both frontend and backend)
pnpm dev

# Backend only
pnpm dev:server

# Frontend only
pnpm dev:client

# Build for production
pnpm build

# Start production
pnpm start
```

## 🌐 Deployment

### Local Development:

```
http://localhost:3850
```

### Production (via Coolify):

```
https://claude-studio.paysera.tech
```

**Traefik labels:**

```yaml
labels:
  - 'traefik.enable=true'
  - 'traefik.http.routers.claude-studio.rule=Host(`claude-studio.paysera.tech`)'
  - 'traefik.http.services.claude-studio.loadbalancer.server.port=3850'
```

## 📄 License

MIT

## 🤝 Contributing

This is a personal research project. Contributions welcome!

## 🎬 Demo

(Coming soon after MVP)

---

**Built with ❤️ to solve real developer pain points**

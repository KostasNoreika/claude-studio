# WebSocket Message Examples

This document provides example JSON messages for WebSocket communication.

## Connection Flow

### 1. Client Connects

**Action:** Client opens WebSocket connection to `ws://127.0.0.1:3850`

**Server Response:**
```json
{
  "type": "connected",
  "sessionId": "sess_1762090756828_dpzumslcu",
  "timestamp": "2025-11-02T13:39:16.828Z"
}
```

## Terminal Input/Output

### 2. Client Sends Command

**Client → Server:**
```json
{
  "type": "terminal:input",
  "data": "ls -la",
  "timestamp": "2025-11-02T13:39:16.830Z"
}
```

**Server → Client:**
```json
{
  "type": "terminal:output",
  "data": "ls -la",
  "timestamp": "2025-11-02T13:39:16.832Z"
}
```

*Note: In Phase 1, the server echoes the input. Phase 3 will replace this with actual terminal output from Docker container.*

### 3. Multi-line Command

**Client → Server:**
```json
{
  "type": "terminal:input",
  "data": "echo 'Hello\\nWorld'",
  "timestamp": "2025-11-02T13:39:17.000Z"
}
```

**Server → Client:**
```json
{
  "type": "terminal:output",
  "data": "echo 'Hello\\nWorld'",
  "timestamp": "2025-11-02T13:39:17.001Z"
}
```

## Heartbeat

### 4. Keep Connection Alive

**Client → Server:**
```json
{
  "type": "heartbeat",
  "timestamp": "2025-11-02T13:39:18.000Z"
}
```

**Server Response:** None (logged on server side only)

**Server Console Log:**
```
💓 [sess_1762090756828_dpzumslcu] heartbeat received
```

## Error Handling

### 5. Invalid JSON

**Client → Server:**
```
not valid json{malformed
```

**Server → Client:**
```json
{
  "type": "error",
  "message": "Failed to parse message",
  "timestamp": "2025-11-02T13:39:19.000Z"
}
```

### 6. Invalid Message Type

**Client → Server:**
```json
{
  "type": "unknown-type",
  "data": "test"
}
```

**Server → Client:**
```json
{
  "type": "error",
  "message": "Invalid message format",
  "timestamp": "2025-11-02T13:39:20.000Z"
}
```

### 7. Missing Required Fields

**Client → Server:**
```json
{
  "type": "terminal:input"
}
```

**Server → Client:**
```json
{
  "type": "error",
  "message": "Invalid message format",
  "timestamp": "2025-11-02T13:39:21.000Z"
}
```

## Complete Session Example

```
# 1. Client connects
→ WebSocket connection established

# 2. Server sends connection confirmation
← {"type":"connected","sessionId":"sess_1762090756828_dpzumslcu","timestamp":"2025-11-02T13:39:16.828Z"}

# 3. Client sends command
→ {"type":"terminal:input","data":"pwd","timestamp":"2025-11-02T13:39:16.830Z"}

# 4. Server echoes output
← {"type":"terminal:output","data":"pwd","timestamp":"2025-11-02T13:39:16.832Z"}

# 5. Client sends another command
→ {"type":"terminal:input","data":"echo 'test'","timestamp":"2025-11-02T13:39:17.000Z"}

# 6. Server echoes output
← {"type":"terminal:output","data":"echo 'test'","timestamp":"2025-11-02T13:39:17.001Z"}

# 7. Client sends heartbeat
→ {"type":"heartbeat","timestamp":"2025-11-02T13:39:18.000Z"}
# (No response - logged on server)

# 8. Client sends invalid message
→ {"type":"invalid"}

# 9. Server responds with error
← {"type":"error","message":"Invalid message format","timestamp":"2025-11-02T13:39:19.000Z"}

# 10. Client closes connection
→ WebSocket connection closed

# Server logs: ❌ Session sess_1762090756828_dpzumslcu disconnected
```

## Server Console Logs

During the above session, the server console shows:

```
🔌 New connection: sess_1762090756828_dpzumslcu
📥 [sess_1762090756828_dpzumslcu] terminal:input: "pwd"
📤 [sess_1762090756828_dpzumslcu] terminal:output: "pwd"
📥 [sess_1762090756828_dpzumslcu] terminal:input: "echo 'test'"
📤 [sess_1762090756828_dpzumslcu] terminal:output: "echo 'test'"
💓 [sess_1762090756828_dpzumslcu] heartbeat received
❌ Session sess_1762090756828_dpzumslcu disconnected
```

## TypeScript Type Definitions

All messages are type-safe using shared TypeScript definitions from `@claude-studio/shared`:

```typescript
// Client Messages
type ClientMessage = TerminalInputMessage | HeartbeatMessage;

interface TerminalInputMessage {
  type: 'terminal:input';
  data: string;
  timestamp: string;
}

interface HeartbeatMessage {
  type: 'heartbeat';
  timestamp: string;
}

// Server Messages
type ServerMessage = TerminalOutputMessage | ConnectedMessage | ErrorMessage;

interface TerminalOutputMessage {
  type: 'terminal:output';
  data: string;
  timestamp: string;
}

interface ConnectedMessage {
  type: 'connected';
  sessionId: string;
  timestamp: string;
}

interface ErrorMessage {
  type: 'error';
  message: string;
  timestamp: string;
}
```

## Helper Functions

The `@claude-studio/shared` package provides factory functions for creating messages:

```typescript
import {
  createTerminalInputMessage,
  createTerminalOutputMessage,
  createConnectedMessage,
  createErrorMessage,
  createHeartbeatMessage,
} from '@claude-studio/shared';

// Client-side
const inputMsg = createTerminalInputMessage('ls -la');
const heartbeatMsg = createHeartbeatMessage();

// Server-side
const outputMsg = createTerminalOutputMessage('file1.txt\nfile2.txt');
const connectedMsg = createConnectedMessage('sess_123');
const errorMsg = createErrorMessage('Command failed');
```

## Type Guards

Use type guards for runtime type checking:

```typescript
import { isClientMessage, isServerMessage } from '@claude-studio/shared';

ws.on('message', (data: Buffer) => {
  const message = JSON.parse(data.toString());

  if (isClientMessage(message)) {
    // TypeScript knows message is ClientMessage
    switch (message.type) {
      case 'terminal:input':
        // Handle input
        break;
      case 'heartbeat':
        // Handle heartbeat
        break;
    }
  }
});
```

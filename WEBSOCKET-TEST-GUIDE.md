# WebSocket Server Test Guide

This guide provides instructions for manually testing the WebSocket server implementation.

## Prerequisites

```bash
# Install wscat globally (if not already installed)
npm install -g wscat
```

## Start the Server

```bash
# From project root
pnpm --filter server dev
```

You should see output like:
```
🚀 Server running on http://127.0.0.1:3850
📊 Health check: http://127.0.0.1:3850/api/health
🔌 WebSocket: ws://127.0.0.1:3850
✅ WebSocket server ready
```

## Automated Test

Run the provided test script:

```bash
# From project root
node test-ws.mjs
```

Expected output:
```
✅ Test 1/3: Received connection message
✅ Test 2/3: Received correct echo response
✅ Test 3/3: Heartbeat sent
============================================================
WebSocket Tests: 3/3 passed
============================================================
✅ All WebSocket tests passed!
```

## Manual Test with wscat

### 1. Connect to WebSocket Server

```bash
wscat -c ws://127.0.0.1:3850
```

**Expected Response:**
```json
{
  "type": "connected",
  "sessionId": "sess_1762090756828_dpzumslcu",
  "timestamp": "2025-11-02T13:39:16.828Z"
}
```

### 2. Send Terminal Input

In the wscat prompt, send:
```json
{"type":"terminal:input","data":"hello world","timestamp":"2025-11-02T10:00:00.000Z"}
```

**Expected Response:**
```json
{
  "type": "terminal:output",
  "data": "hello world",
  "timestamp": "2025-11-02T13:39:16.832Z"
}
```

### 3. Send Heartbeat

```json
{"type":"heartbeat","timestamp":"2025-11-02T10:00:00.000Z"}
```

**Expected Response:**
- No response message (heartbeat is logged on server side only)
- Check server console for: `💓 [sess_xxx] heartbeat received`

### 4. Test Error Handling

Send invalid JSON:
```
not valid json
```

**Expected Response:**
```json
{
  "type": "error",
  "message": "Failed to parse message",
  "timestamp": "2025-11-02T13:39:17.000Z"
}
```

Send invalid message type:
```json
{"type":"invalid-type","data":"test"}
```

**Expected Response:**
```json
{
  "type": "error",
  "message": "Invalid message format",
  "timestamp": "2025-11-02T13:39:18.000Z"
}
```

## Server Console Output

While testing, observe the server console for these logs:

### Connection Events
```
🔌 New connection: sess_1762090756828_dpzumslcu
```

### Message Processing
```
📥 [sess_xxx] terminal:input: "hello world"
📤 [sess_xxx] terminal:output: "hello world"
💓 [sess_xxx] heartbeat received
```

### Disconnection
```
❌ Session sess_xxx disconnected
```

## Health Check

Verify the HTTP server is also working:

```bash
curl http://127.0.0.1:3850/api/health
```

**Expected Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-11-02T13:39:01.208Z"
}
```

## Troubleshooting

### Connection Refused
- Ensure server is running: `lsof -i :3850`
- Check for port conflicts
- Verify IPv4 address (127.0.0.1, not ::1)

### No Response to Messages
- Check message format is valid JSON
- Ensure `type` field matches expected values
- Check server console for error logs

### Type Errors
- Run type check: `pnpm --filter server type-check`
- Ensure @claude-studio/shared package is built

## Message Protocol Reference

### Client → Server Messages

#### Terminal Input
```typescript
{
  type: 'terminal:input',
  data: string,        // The command or input
  timestamp: string    // ISO8601 timestamp
}
```

#### Heartbeat
```typescript
{
  type: 'heartbeat',
  timestamp: string    // ISO8601 timestamp
}
```

### Server → Client Messages

#### Connected
```typescript
{
  type: 'connected',
  sessionId: string,   // Unique session identifier
  timestamp: string    // ISO8601 timestamp
}
```

#### Terminal Output
```typescript
{
  type: 'terminal:output',
  data: string,        // Output from terminal
  timestamp: string    // ISO8601 timestamp
}
```

#### Error
```typescript
{
  type: 'error',
  message: string,     // Error description
  timestamp: string    // ISO8601 timestamp
}
```

## Notes

- **Echo Behavior**: In Phase 1, terminal input is echoed back as terminal output. Phase 3 will replace this with actual Docker container I/O.
- **Heartbeat**: Currently only logged on server side. May be enhanced in future phases.
- **Session IDs**: Format is `sess_<timestamp>_<random>` for tracking individual connections.

# WebSocket Client Service

Type-safe WebSocket client for Claude Studio terminal communication.

## Features

- **Type-Safe Messaging**: Uses shared TypeScript types for client/server communication
- **Automatic Reconnection**: Exponential backoff with configurable max attempts
- **Heartbeat Management**: Keeps connection alive with periodic pings
- **Event-Based API**: Clean EventEmitter pattern for message handling
- **Connection State Tracking**: Monitor connection state changes
- **Error Handling**: Comprehensive error handling and reporting

## Basic Usage

```typescript
import { WebSocketClient } from './services/websocket';

// Create client instance
const ws = new WebSocketClient('ws://127.0.0.1:3850');

// Listen for connection
ws.on('connected', (sessionId) => {
  console.log('Connected with session:', sessionId);
});

// Listen for terminal output
ws.on('terminal:output', (data) => {
  terminal.write(data);
});

// Listen for errors
ws.on('error', (error) => {
  console.error('WebSocket error:', error);
});

// Listen for state changes
ws.on('stateChange', (state) => {
  console.log('Connection state:', state);
  // state can be: 'connecting' | 'connected' | 'disconnected' | 'error'
});

// Connect
ws.connect();

// Send terminal input
ws.sendTerminalInput('ls -la\n');

// Check current state
console.log('Current state:', ws.getState());

// Get session ID
console.log('Session ID:', ws.getSessionId());

// Disconnect
ws.disconnect();
```

## Event Types

### `connected`
Fired when WebSocket connection is established.
- **Payload**: `sessionId: string`

### `message`
Fired for any server message.
- **Payload**: `message: ServerMessage`

### `terminal:output`
Fired specifically for terminal output.
- **Payload**: `data: string`

### `error`
Fired when an error occurs.
- **Payload**: `error: Error`

### `close`
Fired when connection closes.
- **Payload**: None

### `stateChange`
Fired when connection state changes.
- **Payload**: `state: ConnectionState`

## Connection States

- `connecting` - Connection attempt in progress
- `connected` - Successfully connected
- `disconnected` - Not connected
- `error` - Connection error occurred

## Automatic Reconnection

The client automatically attempts to reconnect on connection loss:
- **Max attempts**: 5
- **Strategy**: Exponential backoff (1s, 2s, 4s, 8s, 16s)
- **Reset**: Reconnection counter resets on successful connection

## Heartbeat

Automatic heartbeat is sent every 30 seconds to keep the connection alive.
The heartbeat starts automatically on connection and stops on disconnect.

## Type Safety

All messages use shared types from `@shared`:

```typescript
// Outgoing messages (Client → Server)
import {
  ClientMessage,
  createTerminalInputMessage,
  createHeartbeatMessage,
} from '@shared';

// Incoming messages (Server → Client)
import {
  ServerMessage,
  isServerMessage,
} from '@shared';
```

## Advanced Usage

### Unsubscribing from Events

```typescript
const handler = (data: string) => {
  console.log('Output:', data);
};

// Subscribe
ws.on('terminal:output', handler);

// Unsubscribe
ws.off('terminal:output', handler);
```

### Handling All Messages

```typescript
ws.on('message', (message) => {
  switch (message.type) {
    case 'connected':
      console.log('Session:', message.sessionId);
      break;
    case 'terminal:output':
      console.log('Output:', message.data);
      break;
    case 'error':
      console.error('Error:', message.message);
      break;
  }
});
```

### Custom Reconnection Handling

```typescript
ws.on('close', () => {
  // Connection closed, automatic reconnection will attempt
  console.log('Connection closed, reconnecting...');
});

ws.on('stateChange', (state) => {
  if (state === 'error') {
    // Handle error state
    console.error('Connection error');
  }
});
```

## Testing

```bash
# Run tests
pnpm --filter client test

# Type check
pnpm --filter client type-check

# Build
pnpm --filter client build
```

## Integration

This service will be integrated into the main App component in P02-T004.
Terminal component integration will happen in P02-T005.

## Next Steps

- **P02-T004**: Integrate WebSocket into App.tsx
- **P02-T005**: Connect Terminal component to WebSocket
- **P02-T007**: Add comprehensive integration tests

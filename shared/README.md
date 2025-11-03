# @claude-studio/shared

Shared TypeScript types and utilities for Claude Studio WebSocket communication.

## Overview

This package provides type-safe definitions for WebSocket message protocols between the terminal client and server. All message types use discriminated unions for runtime type safety and TypeScript type narrowing.

## Installation

This is a private package within the Claude Studio monorepo. It's automatically available to other packages via workspace references:

```json
{
  "dependencies": {
    "@claude-studio/shared": "workspace:*"
  }
}
```

## Message Types

### Client Messages (Client → Server)

Messages that can be sent from the terminal client to the server:

#### TerminalInputMessage
User input from the terminal.

```typescript
{
  type: 'terminal:input';
  data: string;        // The command or input data
  timestamp: string;   // ISO8601 timestamp
}
```

#### HeartbeatMessage
Periodic message to keep the WebSocket connection alive.

```typescript
{
  type: 'heartbeat';
  timestamp: string;   // ISO8601 timestamp
}
```

### Server Messages (Server → Client)

Messages that can be sent from the server to the terminal client:

#### TerminalOutputMessage
Terminal output to display to the user.

```typescript
{
  type: 'terminal:output';
  data: string;        // The output data (stdout/stderr)
  timestamp: string;   // ISO8601 timestamp
}
```

#### ConnectedMessage
Sent when WebSocket connection is successfully established.

```typescript
{
  type: 'connected';
  sessionId: string;   // Unique session identifier
  timestamp: string;   // ISO8601 timestamp
}
```

#### ErrorMessage
Error notification from the server.

```typescript
{
  type: 'error';
  message: string;     // Human-readable error message
  timestamp: string;   // ISO8601 timestamp
}
```

## Usage Examples

### Server-Side (Sending Messages)

```typescript
import {
  createTerminalOutputMessage,
  createConnectedMessage,
  createErrorMessage,
  ServerMessage,
} from '@claude-studio/shared';

// Send connection confirmation
const connectedMsg = createConnectedMessage('sess_abc123');
ws.send(JSON.stringify(connectedMsg));

// Send terminal output
const outputMsg = createTerminalOutputMessage('$ ls -la\ntotal 48\n...');
ws.send(JSON.stringify(outputMsg));

// Send error
const errorMsg = createErrorMessage('Terminal process crashed');
ws.send(JSON.stringify(errorMsg));
```

### Server-Side (Receiving Messages)

```typescript
import {
  ClientMessage,
  isClientMessage,
} from '@claude-studio/shared';

ws.on('message', (data: string) => {
  const msg = JSON.parse(data);

  if (!isClientMessage(msg)) {
    console.error('Invalid message format');
    return;
  }

  // TypeScript knows msg is ClientMessage here
  switch (msg.type) {
    case 'terminal:input':
      // Handle user input
      console.log('User input:', msg.data);
      terminal.write(msg.data);
      break;

    case 'heartbeat':
      // Handle heartbeat
      console.log('Heartbeat received at:', msg.timestamp);
      break;
  }
});
```

### Client-Side (Sending Messages)

```typescript
import {
  createTerminalInputMessage,
  createHeartbeatMessage,
  ClientMessage,
} from '@claude-studio/shared';

// Send terminal input
const inputMsg = createTerminalInputMessage('ls -la\n');
ws.send(JSON.stringify(inputMsg));

// Send heartbeat
const heartbeat = createHeartbeatMessage();
ws.send(JSON.stringify(heartbeat));
```

### Client-Side (Receiving Messages)

```typescript
import {
  ServerMessage,
  isServerMessage,
} from '@claude-studio/shared';

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);

  if (!isServerMessage(msg)) {
    console.error('Invalid message format');
    return;
  }

  // TypeScript knows msg is ServerMessage here
  switch (msg.type) {
    case 'terminal:output':
      // Display output in terminal
      terminal.write(msg.data);
      break;

    case 'connected':
      // Handle connection confirmation
      console.log('Connected with session:', msg.sessionId);
      break;

    case 'error':
      // Handle error
      console.error('Server error:', msg.message);
      break;
  }
};
```

## Type Guards

The package provides type guard functions for runtime type checking:

```typescript
import { isClientMessage, isServerMessage } from '@claude-studio/shared';

// Check if unknown data is a valid ClientMessage
if (isClientMessage(data)) {
  // TypeScript knows data is ClientMessage
}

// Check if unknown data is a valid ServerMessage
if (isServerMessage(data)) {
  // TypeScript knows data is ServerMessage
}
```

## Message Factory Functions

Helper functions to create properly typed messages:

- `createTerminalInputMessage(data: string): TerminalInputMessage`
- `createHeartbeatMessage(): HeartbeatMessage`
- `createTerminalOutputMessage(data: string): TerminalOutputMessage`
- `createConnectedMessage(sessionId: string): ConnectedMessage`
- `createErrorMessage(message: string): ErrorMessage`

All factory functions automatically set the `timestamp` field to the current ISO8601 time.

## Type Safety Benefits

### Discriminated Unions

All message types use discriminated unions with the `type` field, enabling:

1. **Exhaustive pattern matching** - TypeScript ensures all cases are handled
2. **Type narrowing** - TypeScript infers the specific type in each branch
3. **Runtime type checking** - The `type` field can be checked at runtime

```typescript
function handleMessage(msg: ClientMessage) {
  switch (msg.type) {
    case 'terminal:input':
      // TypeScript knows msg.data exists here
      break;
    case 'heartbeat':
      // TypeScript knows only msg.timestamp exists here
      break;
    // TypeScript will error if you forget a case
  }
}
```

### Strict Mode

All types are designed to work with TypeScript strict mode:

- No `any` types
- All properties are required
- Proper null/undefined handling

## Development

### Build

```bash
pnpm --filter shared build
```

### Type Check

```bash
pnpm --filter shared type-check
```

## File Structure

```
shared/
├── package.json          # Package configuration
├── tsconfig.json         # TypeScript configuration
├── README.md            # This file
├── src/
│   ├── types.ts         # Message type definitions
│   └── index.ts         # Re-exports
└── dist/                # Built files (generated)
    ├── types.js
    ├── types.d.ts
    ├── index.js
    └── index.d.ts
```

## License

Private package for Claude Studio project.

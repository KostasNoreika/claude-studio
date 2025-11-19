# Logging Migration Examples

Quick reference for migrating to the new logging standards.

## Server-Side Logging

### Before (console.log)

```typescript
console.log('[PortConfig] Session configured', sessionId, port);
console.error('Container creation failed:', error);
```

### After (Structured Logging)

```typescript
import { logger } from '../utils/logger';
import {
  createLogContext,
  OPERATIONS,
  formatDuration,
  sanitizeForLogging,
} from '../utils/logger-standards';

// Simple logging
const context = createLogContext('port:configured', sessionId, { port });
logger.info('Port configured for session', context);

// Error logging
logger.error('Container creation failed', {
  operation: OPERATIONS.CONTAINER_CREATE,
  sessionId,
  error: error.message,
  stack: error.stack,
});

// Performance logging
const start = Date.now();
// ... operation ...
const duration = formatDuration(Date.now() - start);
logger.info('Operation completed', {
  operation: OPERATIONS.CONTAINER_CREATE,
  sessionId,
  ...duration,
});

// Sanitize sensitive data
const safeData = sanitizeForLogging({ password: 'secret', username: 'admin' });
logger.info('User data', safeData);
// Logs: { password: '[REDACTED]', username: 'admin' }
```

## Client-Side Logging

### Before (console.log)

```typescript
console.log('[WebSocket] Connected with session:', sessionId);
console.warn('[WebSocket] Reconnecting...');
console.error('[WebSocket] Connection failed:', error);
```

### After (Logger Utility)

```typescript
import { logger } from './utils/logger';

// Create child logger with prefix
const wsLogger = logger.child('[WebSocket]');

// Basic logging
wsLogger.info('Connected with session', { sessionId });
wsLogger.warn('Reconnecting...');
wsLogger.error('Connection failed', { error: error.message });

// Different log levels
wsLogger.debug('Debug message', { data: 'debug' }); // Only in dev
wsLogger.info('Info message', { data: 'info' });
wsLogger.warn('Warning message', { data: 'warning' });
wsLogger.error('Error message', new Error('error')); // Auto-extracts stack
```

## Using Shared Constants

### Before (Magic Numbers)

```typescript
setInterval(healthCheck, 30000); // What is 30000?
setTimeout(retry, 1000); // What is 1000?
ws.send(heartbeat); // Every 30 seconds?
```

### After (Named Constants)

```typescript
import { CONTAINER_CONSTANTS, WEBSOCKET_CONSTANTS, RATE_LIMIT_CONSTANTS } from '@shared';

setInterval(healthCheck, CONTAINER_CONSTANTS.HEALTH_CHECK_INTERVAL_MS);

setTimeout(retry, WEBSOCKET_CONSTANTS.RECONNECT_BASE_DELAY_MS);

// Clear intent with named constants
if (messageCount > RATE_LIMIT_CONSTANTS.MAX_MESSAGES) {
  // Rate limit exceeded
}
```

## Standard Operation Names

### Before (Inconsistent)

```typescript
logger.info('Creating container', { sessionId });
logger.info('container_create', { sessionId });
logger.info('create-container', { sessionId });
```

### After (Standard Operations)

```typescript
import { OPERATIONS } from '../utils/logger-standards';

logger.info('Creating container', {
  operation: OPERATIONS.CONTAINER_CREATE,
  sessionId,
});

logger.info('Session created', {
  operation: OPERATIONS.SESSION_CREATE,
  sessionId,
});

logger.warn('Rate limit exceeded', {
  operation: OPERATIONS.RATE_LIMIT_EXCEEDED,
  sessionId,
});
```

## Correlation IDs for Request Tracing

```typescript
import { correlationIds, createLogContext } from '../utils/logger-standards';

// Automatically creates and manages correlation IDs per session
const context1 = createLogContext('operation1', sessionId, { step: 1 });
const context2 = createLogContext('operation2', sessionId, { step: 2 });

// Both will have the same operationId for the session
logger.info('Step 1', context1); // { operation: 'operation1', sessionId, operationId: 'uuid-abc', step: 1 }
logger.info('Step 2', context2); // { operation: 'operation2', sessionId, operationId: 'uuid-abc', step: 2 }

// Clean up when session ends
correlationIds.delete(sessionId);
```

## Environment Configuration

### Client Logger Configuration

Set log level via environment variable:

```bash
# .env.local
VITE_LOG_LEVEL=DEBUG  # Show all logs in development
VITE_LOG_LEVEL=ERROR  # Only errors in production
```

In code:

```typescript
import { logger, LogLevel } from './utils/logger';

// Dynamic configuration
logger.setLevel(LogLevel.DEBUG);
logger.setLevel(LogLevel.INFO);
logger.setLevel(LogLevel.WARN);
logger.setLevel(LogLevel.ERROR);
logger.setLevel(LogLevel.SILENT);
```

### Server Logger Configuration

```bash
# .env
LOG_LEVEL=debug  # For development
LOG_LEVEL=info   # For production
LOG_LEVEL=error  # For minimal logging
```

## Quick Reference

### Server Logging

```typescript
import { logger } from '../utils/logger';
import { createLogContext, OPERATIONS } from '../utils/logger-standards';

// Standard pattern
const context = createLogContext(OPERATIONS.CONTAINER_CREATE, sessionId, {
  containerId,
  projectName,
});
logger.info('Container created successfully', context);
```

### Client Logging

```typescript
import { logger } from './utils/logger';

const componentLogger = logger.child('[Component]');
componentLogger.info('Event occurred', { eventType: 'click' });
```

### Constants

```typescript
import { WEBSOCKET_CONSTANTS, CONTAINER_CONSTANTS } from '@shared';

const heartbeatInterval = WEBSOCKET_CONSTANTS.HEARTBEAT_INTERVAL_MS;
const healthCheckInterval = CONTAINER_CONSTANTS.HEALTH_CHECK_INTERVAL_MS;
```

# Error Handling Developer Guide

## Overview

Claude Studio Server implements comprehensive error handling for all container lifecycle operations using typed errors, retry logic, and circuit breaker pattern.

## Error Classes

### Available Error Types

```typescript
import {
  ContainerCreationError,
  ContainerNotFoundError,
  DockerDaemonError,
  StreamAttachmentError,
  ContainerExecutionError,
  ContainerStateError,
  SessionNotFoundError,
  SessionValidationError,
} from './docker/errors';
```

### Error Properties

All errors extend `ContainerError` with:

```typescript
class ContainerError extends Error {
  code: string;              // Unique error code (e.g., 'CONTAINER_NOT_FOUND')
  retryable: boolean;        // Whether operation should be retried
  context: Record<string, unknown>; // Additional context data

  toUserMessage(): string;   // User-friendly error message
  toLogData(): object;       // Structured data for logging
}
```

## Usage Examples

### Throwing Errors

```typescript
// Throw typed error with context
throw new ContainerNotFoundError(containerId, {
  sessionId: 'sess-123'
});

// Throw error with custom message
throw new ContainerCreationError('Insufficient memory', {
  requestedMemory: 2048,
  availableMemory: 1024,
});
```

### Catching and Handling Errors

```typescript
try {
  await containerManager.createSession(config);
} catch (error) {
  if (error instanceof ContainerCreationError) {
    // Handle creation error
    console.error('Failed to create container:', error.toLogData());

    // Send user-friendly message
    return { error: error.toUserMessage() };
  } else if (error instanceof DockerDaemonError) {
    // Docker daemon unreachable - can retry
    if (error.retryable) {
      // Queue for retry
    }
  }

  // Generic fallback
  throw error;
}
```

### Converting Unknown Errors

```typescript
import { toContainerError } from './docker/errors';

try {
  await docker.createContainer(config);
} catch (error) {
  // Convert to typed error
  const containerError = toContainerError(error);

  console.error('Container error:', containerError.toLogData());
  throw containerError;
}
```

## Retry Logic

### Using Retry with Backoff

```typescript
import { retryWithBackoff } from './docker/retry';

// Simple retry
const result = await retryWithBackoff(
  async () => await container.start()
);

// Custom retry configuration
const result = await retryWithBackoff(
  async () => await container.start(),
  {
    maxRetries: 5,
    initialDelay: 2000,    // 2 seconds
    maxDelay: 30000,       // 30 seconds
    backoffMultiplier: 2,  // Double delay each retry
  }
);
```

### Custom Retryable Logic

```typescript
import { retry, isRetryableError } from './docker/retry';

const result = await retry(
  async () => await someOperation(),
  {
    maxRetries: 3,
    isRetryable: (error) => {
      // Custom logic
      return error instanceof NetworkError && error.transient;
    },
    onRetry: (error, attempt, delay) => {
      console.log(`Retry ${attempt} after ${delay}ms due to: ${error.message}`);
    },
  }
);
```

## Circuit Breaker

### Using Circuit Breaker

```typescript
import { dockerCircuitBreaker } from './docker/circuitBreaker';

// Wrap Docker API calls
const result = await dockerCircuitBreaker.execute(async () => {
  return await docker.ping();
});

// Check circuit state
const state = dockerCircuitBreaker.getState();
// CLOSED | OPEN | HALF_OPEN

// Get metrics
const metrics = dockerCircuitBreaker.getMetrics();
console.log(`Circuit: ${metrics.state}, Failures: ${metrics.failureCount}`);
```

### Custom Circuit Breaker

```typescript
import { CircuitBreaker } from './docker/circuitBreaker';

const breaker = new CircuitBreaker({
  failureThreshold: 3,      // Open after 3 failures
  resetTimeout: 60000,      // Wait 60s before retry
  successThreshold: 2,      // Close after 2 successes
  onStateChange: (oldState, newState) => {
    console.log(`Circuit: ${oldState} → ${newState}`);
    metrics.recordCircuitState(newState);
  },
});

await breaker.execute(async () => {
  return await riskyOperation();
});
```

## WebSocket Error Handling

### Sending Errors to Clients

```typescript
import { createErrorMessage } from '@shared';
import { ContainerError } from '../docker/errors';

function handleError(ws: WebSocket, error: unknown) {
  let errorMsg;

  if (error instanceof ContainerError) {
    errorMsg = createErrorMessage(
      error.toUserMessage(),  // User-friendly message
      error.code,             // Error code for client
      error.retryable,        // Can client retry?
      { timestamp: new Date().toISOString() }
    );
  } else {
    errorMsg = createErrorMessage(
      'An unexpected error occurred',
      'UNKNOWN_ERROR',
      false
    );
  }

  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(errorMsg));
  }
}
```

### Client-Side Error Handling

```typescript
ws.on('message', (data) => {
  const message = JSON.parse(data);

  if (message.type === 'error') {
    console.error(`Error [${message.code}]:`, message.message);

    if (message.retryable) {
      // Can retry operation
      setTimeout(() => retryOperation(), 5000);
    } else {
      // Permanent failure
      showErrorToUser(message.message);
    }
  }
});
```

## Best Practices

### 1. Always Use Typed Errors

❌ **Bad**:
```typescript
throw new Error('Container not found');
```

✅ **Good**:
```typescript
throw new ContainerNotFoundError(containerId, { sessionId });
```

### 2. Provide Context

❌ **Bad**:
```typescript
throw new ContainerCreationError('Failed to create');
```

✅ **Good**:
```typescript
throw new ContainerCreationError('Failed to create container', {
  sessionId,
  image: config.image,
  reason: 'Image not found',
});
```

### 3. Log Structured Data

❌ **Bad**:
```typescript
console.error('Error:', error.message);
```

✅ **Good**:
```typescript
console.error('[ContainerManager] Creation failed:', error.toLogData());
```

### 4. Convert Unknown Errors

❌ **Bad**:
```typescript
catch (error) {
  throw error; // Unknown error type
}
```

✅ **Good**:
```typescript
catch (error) {
  const containerError = toContainerError(error);
  console.error('Error:', containerError.toLogData());
  throw containerError;
}
```

### 5. Use Circuit Breaker for External Services

❌ **Bad**:
```typescript
await docker.ping(); // No protection
```

✅ **Good**:
```typescript
await dockerCircuitBreaker.execute(async () => {
  return await docker.ping();
});
```

## Error Codes Reference

| Code | Description | Retryable | Action |
|------|-------------|-----------|--------|
| `CONTAINER_CREATION_FAILED` | Container creation failed | No | Check image, resources |
| `CONTAINER_NOT_FOUND` | Container doesn't exist | No | Create new session |
| `DOCKER_DAEMON_ERROR` | Docker daemon unreachable | Yes | Wait and retry |
| `STREAM_ATTACHMENT_FAILED` | Cannot attach streams | No | Restart session |
| `CONTAINER_EXECUTION_FAILED` | Command failed | No | Check command syntax |
| `CONTAINER_STATE_ERROR` | Invalid state | Depends | Check container status |
| `SESSION_NOT_FOUND` | Session expired | No | Create new session |
| `SESSION_VALIDATION_FAILED` | Invalid session params | No | Check configuration |

## Monitoring

### Log Error Patterns

```typescript
import { ContainerError } from './docker/errors';

// Log all errors with context
try {
  await operation();
} catch (error) {
  if (error instanceof ContainerError) {
    logger.error('Container operation failed', {
      ...error.toLogData(),
      operation: 'createSession',
      userId: context.userId,
    });
  }
}
```

### Track Error Metrics

```typescript
import { dockerCircuitBreaker } from './docker/circuitBreaker';

// Monitor circuit breaker
setInterval(() => {
  const metrics = dockerCircuitBreaker.getMetrics();

  if (metrics.state === 'OPEN') {
    alerting.send('Docker circuit breaker OPEN', {
      failures: metrics.failureCount,
      nextAttempt: metrics.nextAttemptTime,
    });
  }
}, 30000);
```

## Testing

### Mock Errors in Tests

```typescript
import { ContainerCreationError } from '../../docker/errors';

it('should handle container creation failure', async () => {
  // Mock error
  containerManager.createSession.mockRejectedValue(
    new ContainerCreationError('Image not found', { image: 'test:latest' })
  );

  // Test error handling
  await expect(handler()).rejects.toThrow(ContainerCreationError);
});
```

### Test Retry Logic

```typescript
it('should retry on transient failures', async () => {
  let attempts = 0;

  const result = await retryWithBackoff(async () => {
    attempts++;
    if (attempts < 3) {
      throw new DockerDaemonError('Connection refused');
    }
    return 'success';
  });

  expect(attempts).toBe(3);
  expect(result).toBe('success');
});
```

---

For more details, see:
- `/opt/dev/claude-studio/server/src/docker/errors.ts`
- `/opt/dev/claude-studio/server/src/docker/circuitBreaker.ts`
- `/opt/dev/claude-studio/server/src/docker/retry.ts`
- `/opt/dev/claude-studio/P03-T009-IMPLEMENTATION.md`

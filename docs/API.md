# Claude Studio API Documentation

Complete API reference for Claude Studio backend services.

## Table of Contents

- [Overview](#overview)
- [Authentication](#authentication)
- [WebSocket API](#websocket-api)
- [REST API](#rest-api)
- [Error Handling](#error-handling)
- [Rate Limiting](#rate-limiting)

---

## Overview

Claude Studio provides both WebSocket and REST APIs for container management, terminal interaction, and live preview.

**Base URL**: `http://localhost:3333` (development)

**WebSocket URL**: `ws://localhost:3333`

---

## Authentication

Currently, Claude Studio uses session-based authentication. Each client receives a unique `sessionId` upon connection.

### Session Management

- **Session timeout**: 30 minutes of inactivity
- **Heartbeat**: Automatic ping/pong every 30 seconds
- **Cleanup**: Expired sessions auto-cleaned every 5 minutes

---

## WebSocket API

### Connection

```javascript
const ws = new WebSocket('ws://localhost:3333');
```

### Message Format

All messages are JSON with a `type` field:

```typescript
interface WebSocketMessage {
  type: string;
  [key: string]: any;
}
```

### Client → Server Messages

#### 1. Create Container

```json
{
  "type": "create",
  "image": "node:20-alpine",
  "workspaceDir": "/opt/dev/my-project"
}
```

**Response**:
```json
{
  "type": "container_created",
  "sessionId": "session-abc123",
  "containerId": "container-xyz789",
  "status": "running"
}
```

#### 2. Execute Command

```json
{
  "type": "input",
  "sessionId": "session-abc123",
  "data": "npm install\n"
}
```

**Response**: Stream of output messages

#### 3. Configure Preview

```json
{
  "type": "configure_preview",
  "sessionId": "session-abc123",
  "port": 3000
}
```

**Response**:
```json
{
  "type": "preview_configured",
  "previewUrl": "/preview/session-abc123"
}
```

#### 4. Heartbeat (Ping)

```json
{
  "type": "ping"
}
```

**Response**:
```json
{
  "type": "pong"
}
```

### Server → Client Messages

#### Output

```json
{
  "type": "output",
  "data": "Command output...\n"
}
```

#### Error

```json
{
  "type": "error",
  "error": "ContainerCreationError",
  "message": "Failed to create container: Image not found",
  "retryable": true
}
```

#### Container Exit

```json
{
  "type": "exit",
  "code": 0,
  "signal": null
}
```

#### Reconnection Required

```json
{
  "type": "reconnect",
  "reason": "Session expired",
  "delay": 1000
}
```

---

## REST API

### Health Check

**GET** `/api/health`

**Response**:
```json
{
  "status": "ok",
  "docker": "connected",
  "uptime": 12345
}
```

**Rate Limit**: Not rate limited

---

### Container Management

#### Create Container

**POST** `/api/containers`

**Body**:
```json
{
  "image": "node:20-alpine",
  "workspaceDir": "/opt/dev/my-project",
  "sessionId": "optional-session-id"
}
```

**Response**: `200 OK`
```json
{
  "sessionId": "session-abc123",
  "containerId": "container-xyz789",
  "status": "running"
}
```

**Errors**:
- `400 Bad Request`: Invalid parameters
- `429 Too Many Requests`: Rate limit exceeded (10 per minute)
- `500 Internal Server Error`: Docker daemon error

**Rate Limit**: 10 requests/minute per IP + session

---

#### Get Container Info

**GET** `/api/containers/:sessionId`

**Response**: `200 OK`
```json
{
  "sessionId": "session-abc123",
  "containerId": "container-xyz789",
  "status": "running",
  "image": "node:20-alpine"
}
```

**Errors**:
- `404 Not Found`: Session not found

---

#### Remove Container

**DELETE** `/api/containers/:sessionId`

**Response**: `200 OK`
```json
{
  "message": "Container removed successfully"
}
```

---

### Preview Configuration

#### Configure Preview Proxy

**POST** `/api/preview/configure`

**Body**:
```json
{
  "sessionId": "session-abc123",
  "port": 3000
}
```

**Response**: `200 OK`
```json
{
  "previewUrl": "/preview/session-abc123",
  "targetUrl": "http://localhost:3000"
}
```

**Security**:
- Only container-internal URLs allowed
- SSRF protection enabled
- Rate limited to prevent abuse

**Rate Limit**: 20 requests/minute per IP

**Errors**:
- `400 Bad Request`: Invalid URL or SSRF attempt
- `404 Not Found`: Session not found
- `429 Too Many Requests`: Rate limit exceeded

---

#### Access Preview

**GET** `/preview/:sessionId/*`

Proxies requests to the configured container preview URL.

**Headers**:
- `X-Forwarded-For`: Original client IP
- `X-Forwarded-Proto`: Original protocol
- `X-Real-IP`: Real client IP

**Features**:
- Console log injection for browser console capture
- WebSocket upgrade support
- Automatic CSP header modification

---

## Error Handling

### Error Response Format

```typescript
interface ErrorResponse {
  error: string;           // Error type
  message: string;         // User-friendly message
  retryable?: boolean;     // Can client retry?
  statusCode?: number;     // HTTP status code (REST only)
}
```

### Error Types

#### ContainerCreationError

**Status**: `500`

**Retryable**: `false`

**Causes**:
- Image not found
- Insufficient disk space
- Insufficient memory

**Example**:
```json
{
  "error": "ContainerCreationError",
  "message": "Failed to create container: Image 'node:99' not found",
  "retryable": false
}
```

---

#### ContainerNotFoundError

**Status**: `404`

**Retryable**: `false`

**Causes**:
- Invalid session ID
- Container already removed

---

#### DockerDaemonError

**Status**: `503`

**Retryable**: `true`

**Causes**:
- Docker daemon not responding
- Network connectivity issues

---

#### RateLimitError

**Status**: `429`

**Retryable**: `true` (after delay)

**Headers**:
- `X-RateLimit-Limit`: Total allowed
- `X-RateLimit-Remaining`: Remaining in window
- `X-RateLimit-Reset`: Timestamp when limit resets

---

## Rate Limiting

### Limits by Endpoint

| Endpoint | Limit | Window | Per |
|----------|-------|--------|-----|
| General API | 100 req | 1 min | IP |
| Container operations | 10 req | 1 min | IP + session |
| Preview config | 20 req | 1 min | IP |
| WebSocket connections | 5 conn | 1 min | IP |
| Authentication | 5 attempts | 15 min | IP |

### Rate Limit Headers

All responses include rate limit information:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1699564800
```

### Handling Rate Limits

When rate limited (HTTP 429), clients should:

1. Check `X-RateLimit-Reset` header
2. Calculate delay: `reset - Date.now()`
3. Wait before retrying
4. Use exponential backoff for multiple failures

**Example**:
```typescript
if (response.status === 429) {
  const reset = parseInt(response.headers['x-ratelimit-reset']);
  const delay = reset * 1000 - Date.now();
  await sleep(Math.max(delay, 1000));
  // Retry request
}
```

---

## Security

### Request Validation

- All input sanitized
- Path traversal protection
- Command injection prevention
- XSS protection

### Container Security

- Read-only root filesystem
- Non-root user (1000:1000)
- Resource limits (512MB RAM, 1 CPU)
- Network isolation
- No privileged mode

### SSRF Prevention

Preview URLs validated against:
- Localhost/loopback addresses
- Private IP ranges (10.x, 192.168.x, 172.16-31.x)
- File:// protocol
- DNS rebinding attacks

---

## Client Libraries

### JavaScript/TypeScript

```typescript
import { ClaudeStudioClient } from '@claude-studio/client';

const client = new ClaudeStudioClient('ws://localhost:3333');

// Create container
const session = await client.createContainer({
  image: 'node:20-alpine',
  workspaceDir: '/opt/dev/my-project',
});

// Execute command
await client.executeCommand(session.id, 'npm install');

// Configure preview
await client.configurePreview(session.id, 3000);

// Clean up
await client.removeContainer(session.id);
```

---

## Examples

### Full Workflow Example

```typescript
// 1. Connect WebSocket
const ws = new WebSocket('ws://localhost:3333');

// 2. Create container
ws.send(JSON.stringify({
  type: 'create',
  image: 'node:20-alpine',
  workspaceDir: '/opt/dev/my-app',
}));

// 3. Wait for container_created
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);

  if (msg.type === 'container_created') {
    const sessionId = msg.sessionId;

    // 4. Start dev server
    ws.send(JSON.stringify({
      type: 'input',
      sessionId,
      data: 'npm run dev\n',
    }));

    // 5. Configure preview
    ws.send(JSON.stringify({
      type: 'configure_preview',
      sessionId,
      port: 3000,
    }));
  }

  if (msg.type === 'preview_configured') {
    // 6. Open preview in browser
    window.open(msg.previewUrl, '_blank');
  }

  if (msg.type === 'output') {
    // 7. Display output
    console.log(msg.data);
  }
};
```

---

## Changelog

### v1.0.0 (2024-11-02)

- Initial release
- WebSocket API for container management
- REST API for preview configuration
- Rate limiting
- Session management with auto-cleanup
- SSRF protection
- Console log injection

---

## Support

For issues and questions:
- GitHub: [claude-studio/issues](https://github.com/your-org/claude-studio/issues)
- Documentation: [/docs](../README.md)

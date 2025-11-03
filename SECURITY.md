# Security Architecture - Claude Studio

## 🔒 Security Overview

This document outlines the security considerations and hardening measures based on the multi-LLM expert consensus review.

---

## 🚨 Critical Security Risks (Identified by Debate MCP)

### 1. Container/Shell Breakout (CRITICAL)

**Risk**: User code could escape container and access host system.

**Mitigation**:

- ✅ **Docker containers** with strict isolation (not tmux!)
- ✅ **Rootless containers**: User namespace remapping
- ✅ **Read-only filesystem**: Mount `/workspace` as only writable volume
- ✅ **No privileged mode**: Never use `--privileged` flag
- ✅ **AppArmor/SELinux profiles**: Additional kernel-level isolation
- ✅ **Capability dropping**: Drop all unnecessary Linux capabilities

**Implementation**:

```typescript
// server/services/containerManager.ts
const container = await docker.createContainer({
  Image: 'claude-studio-env:latest',
  HostConfig: {
    Memory: 1024 * 1024 * 1024, // 1GB limit
    CpuShares: 512,
    ReadonlyRootfs: true, // Critical!
    Binds: [
      `${projectPath}:/workspace:rw`, // Only writable mount
    ],
    CapDrop: ['ALL'], // Drop all capabilities
    CapAdd: ['CHOWN', 'DAC_OVERRIDE'], // Only essential ones
    SecurityOpt: ['no-new-privileges'],
  },
  User: '1000:1000', // Non-root user
});
```

---

### 2. Denial of Service (DoS) (HIGH)

**Risk**: User code consumes 100% CPU/memory, crashes server.

**Mitigation**:

- ✅ **Resource limits**: cgroups via Docker
- ✅ **Rate limiting**: WebSocket messages, console logs, container creation
- ✅ **Timeout enforcement**: Kill long-running processes
- ✅ **Concurrent session limits**: Max 5 sessions per user

**Implementation**:

```typescript
// Rate limiting for WebSocket messages
const rateLimiter = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(sessionId: string): boolean {
  const now = Date.now();
  const limit = rateLimiter.get(sessionId);

  if (!limit || now > limit.resetAt) {
    rateLimiter.set(sessionId, { count: 1, resetAt: now + 60000 }); // 1 min
    return true;
  }

  if (limit.count >= 1000) {
    // 1000 messages per minute
    return false;
  }

  limit.count++;
  return true;
}
```

---

### 3. Server-Side Request Forgery (SSRF) (HIGH)

**Risk**: Malicious port input could proxy to internal services (Redis, DB, SSH).

**Mitigation**:

- ✅ **Strict whitelist**: Only `127.0.0.1` and `localhost`
- ✅ **Port validation**: 3000-9999 only
- ✅ **Blocklist**: Reject 22 (SSH), 3306 (MySQL), 5432 (Postgres), etc.
- ✅ **No redirects**: Disable HTTP redirects in proxy

**Implementation**:

```typescript
// server/services/proxyValidator.ts
const BLOCKED_PORTS = [22, 25, 80, 443, 3306, 5432, 6379, 27017];
const ALLOWED_HOSTS = ['127.0.0.1', 'localhost'];

function validateProxyTarget(host: string, port: number): boolean {
  // Check host
  if (!ALLOWED_HOSTS.includes(host)) {
    throw new Error(`Host ${host} not allowed. Only localhost permitted.`);
  }

  // Check port range
  if (port < 3000 || port > 9999) {
    throw new Error(`Port ${port} out of valid range (3000-9999).`);
  }

  // Check blocklist
  if (BLOCKED_PORTS.includes(port)) {
    throw new Error(`Port ${port} is blocked for security reasons.`);
  }

  return true;
}
```

---

### 4. Cross-Site Scripting (XSS) (MEDIUM)

**Risk**: Malicious console logs could inject scripts into IDE UI.

**Mitigation**:

- ✅ **HTML escaping**: All console log output
- ✅ **Content Security Policy**: Restrict inline scripts
- ✅ **Text-only rendering**: Never use `dangerouslySetInnerHTML`

**Implementation**:

```typescript
// client/components/ConsolePanel.tsx
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function ConsoleMessage({ message }: { message: ConsoleLog }) {
  const escaped = escapeHtml(JSON.stringify(message.args));

  return (
    <div className={`console-${message.level}`}>
      <span className="timestamp">{new Date(message.timestamp).toLocaleTimeString()}</span>
      <span className="level">[{message.level.toUpperCase()}]</span>
      <span className="message">{escaped}</span>
    </div>
  );
}
```

---

### 5. Path Traversal (HIGH)

**Risk**: User could read/write files outside project directory.

**Mitigation**:

- ✅ **Volume mount isolation**: Docker only mounts project path
- ✅ **Path validation**: Check all file paths before operations
- ✅ **Resolve symlinks**: Prevent symlink-based escapes

**Implementation**:

```typescript
// server/utils/pathValidator.ts
import path from 'path';
import fs from 'fs/promises';

async function validatePath(projectRoot: string, requestedPath: string): Promise<string> {
  // Resolve absolute path
  const absolutePath = path.resolve(projectRoot, requestedPath);

  // Check it's within project root
  if (!absolutePath.startsWith(projectRoot)) {
    throw new Error('Path traversal attempt detected');
  }

  // Resolve symlinks
  try {
    const realPath = await fs.realpath(absolutePath);
    if (!realPath.startsWith(projectRoot)) {
      throw new Error('Symlink escape attempt detected');
    }
    return realPath;
  } catch (err) {
    // File doesn't exist yet, that's OK
    return absolutePath;
  }
}
```

---

## 🛡️ Defense in Depth Layers

### Layer 1: Network

- ✅ **No external exposure**: Only `localhost` binding for dev
- ✅ **HTTPS only**: In production via Traefik
- ✅ **WebSocket auth**: JWT tokens required

### Layer 2: Application

- ✅ **Input validation**: zod schemas for all WebSocket messages
- ✅ **Rate limiting**: Per session, per endpoint
- ✅ **CORS**: Strict same-origin policy

### Layer 3: Container

- ✅ **Docker isolation**: Separate filesystem, network, PID namespace
- ✅ **Resource limits**: CPU, memory, disk I/O
- ✅ **Capability dropping**: Minimal privileges

### Layer 4: Host

- ✅ **User isolation**: Each container runs as non-root user
- ✅ **AppArmor/SELinux**: Kernel-level MAC
- ✅ **Log monitoring**: Alert on suspicious activity

---

## 🔐 Authentication & Authorization

### JWT Token Structure

```typescript
interface SessionToken {
  userId: string;
  sessionId: string;
  projectPath: string;
  iat: number; // Issued at
  exp: number; // Expires at (4 hours)
}
```

### WebSocket Authentication Flow

```
1. Client connects to WebSocket
2. Server waits for auth message within 5 seconds
3. Client sends: {type: 'auth', token: 'jwt...'}
4. Server verifies JWT signature and expiration
5. Server checks user has access to projectPath
6. Server accepts connection or closes with 401
```

**Implementation**:

```typescript
// server/websocket/middleware/auth.ts
import jwt from 'jsonwebtoken';

ws.on('message', async (data) => {
  if (!ws.authenticated) {
    const msg = JSON.parse(data.toString());

    if (msg.type !== 'auth') {
      ws.close(1008, 'Authentication required');
      return;
    }

    try {
      const payload = jwt.verify(msg.token, process.env.JWT_SECRET!) as SessionToken;

      // Check token hasn't expired
      if (payload.exp * 1000 < Date.now()) {
        ws.close(1008, 'Token expired');
        return;
      }

      // Validate project path access
      const hasAccess = await checkUserAccess(payload.userId, payload.projectPath);
      if (!hasAccess) {
        ws.close(1008, 'Access denied');
        return;
      }

      ws.authenticated = true;
      ws.userId = payload.userId;
      ws.sessionId = payload.sessionId;
      ws.projectPath = payload.projectPath;

      // Start heartbeat
      startHeartbeat(ws);
    } catch (err) {
      ws.close(1008, 'Invalid token');
    }
  } else {
    // Handle authenticated messages
    handleMessage(ws, data);
  }
});
```

---

## 🧪 Security Testing Checklist

### Unit Tests

- [ ] SSRF prevention: Reject invalid ports and hosts
- [ ] Path traversal: Block `../` and symlink escapes
- [ ] XSS: HTML escaping works correctly
- [ ] Rate limiting: Blocks excessive requests
- [ ] JWT validation: Rejects expired/invalid tokens

### Integration Tests

- [ ] Container breakout: User code cannot access host
- [ ] Resource exhaustion: CPU/memory limits enforced
- [ ] WebSocket auth: Unauthenticated connections rejected

### Penetration Testing (Manual)

- [ ] Attempt to proxy to internal services (localhost:22, etc.)
- [ ] Try to read `/etc/passwd` via path traversal
- [ ] Inject malicious script via console.log
- [ ] Fork bomb / infinite loop DoS
- [ ] Exhaust disk space with large files

---

## 🚀 Production Hardening (Post-MVP)

### Future Enhancements

1. **Web Application Firewall (WAF)**: Block common attack patterns
2. **Intrusion Detection (IDS)**: Alert on suspicious container activity
3. **Audit Logging**: Log all security events to SIEM
4. **Secrets Management**: Vault for JWT keys, API tokens
5. **Network segmentation**: Isolate container network from host
6. **Container image scanning**: Trivy/Clair for vulnerability detection
7. **Dependency scanning**: Snyk/npm audit in CI/CD
8. **Bug bounty program**: Incentivize security researchers

---

## 📚 References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Docker Security Best Practices](https://docs.docker.com/engine/security/)
- [CWE-918: SSRF](https://cwe.mitre.org/data/definitions/918.html)
- [CWE-22: Path Traversal](https://cwe.mitre.org/data/definitions/22.html)
- [NIST Container Security Guide](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-190.pdf)

---

**Last Updated**: 2025-11-02 (Post Debate MCP Review)
**Security Level**: High (suitable for single-user/trusted environment)
**Production Ready**: Requires Phase 9 hardening + penetration testing

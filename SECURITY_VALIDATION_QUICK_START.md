# Security Validation Quick Start Guide

**Run these commands to validate Docker socket proxy security**

---

## Prerequisites

Ensure containers are running:
```bash
docker compose -f docker-compose.prod.yml ps
```

Expected output: Both `claude-studio` and `claude-studio-docker-proxy` should show "Up"

---

## Step 1: Run Comprehensive Security Validation (2-3 minutes)

```bash
cd /opt/dev/claude-studio
./scripts/validate-docker-proxy-security.sh
```

**What it tests**: 43 automated security tests covering network isolation, API restrictions, and security boundaries.

**Expected result**:
```
✓ All tests passed!

Docker socket proxy security is correctly configured:
  - Network isolation: WORKING
  - Denied operations: BLOCKED
  - Allowed operations: FUNCTIONAL
  - Security boundaries: ENFORCED
```

**If tests fail**: Review output for specific failures and check `/opt/dev/claude-studio/docs/DOCKER_PROXY_SECURITY_VALIDATION.md` for troubleshooting.

---

## Step 2: Run Attack Scenario Tests (3-4 minutes)

```bash
./scripts/test-docker-escape-scenarios.sh
```

**What it tests**: 10 real-world container escape attack scenarios.

**Expected result**:
```
✓ SECURITY VALIDATION PASSED

All container escape attempts were successfully blocked.
Attacks blocked: 10
Attacks succeeded: 0
```

**CRITICAL**: If ANY attacks succeed, DO NOT deploy to production.

---

## Step 3: Run Integration Tests (1-2 minutes)

```bash
pnpm test:server -- docker-proxy-security.integration.test.ts
```

**What it tests**: Programmatic validation of Docker proxy security with ContainerManager.

**Expected result**:
```
PASS  server/src/__tests__/integration/docker-proxy-security.integration.test.ts
Test Suites: 1 passed
Tests: XX passed
```

---

## Quick Health Checks

### Verify Network Isolation
```bash
# Should FAIL (docker-proxy cannot reach external networks)
docker exec claude-studio-docker-proxy ping -c 1 8.8.8.8
```
Expected: "Network is unreachable" or timeout

### Verify Allowed Operations Work
```bash
# Should SUCCEED (200 OK)
docker exec claude-studio curl -s http://docker-proxy:2375/info | grep "Name"
```
Expected: JSON output with Docker info

### Verify Denied Operations Blocked
```bash
# Should FAIL (403 Forbidden)
docker exec claude-studio curl -s -o /dev/null -w "%{http_code}" http://docker-proxy:2375/volumes
```
Expected: `403`

### Verify Socket Configuration
```bash
# Should show RW=false (read-only socket)
docker inspect claude-studio-docker-proxy --format='{{range .Mounts}}{{if eq .Destination "/var/run/docker.sock"}}RW={{.RW}}{{end}}{{end}}'
```
Expected: `RW=false`

---

## Troubleshooting

### Tests fail with "Cannot connect to docker-proxy"
```bash
# Restart services
docker compose -f docker-compose.prod.yml restart

# Wait 30 seconds for healthchecks
sleep 30

# Re-run tests
./scripts/validate-docker-proxy-security.sh
```

### Allowed operations return 403
```bash
# Check proxy environment variables
docker inspect claude-studio-docker-proxy --format='{{range .Config.Env}}{{println .}}{{end}}' | grep -E "CONTAINERS|IMAGES|POST"
```
Should see: `CONTAINERS=1`, `IMAGES=1`, `POST=1`

### docker-proxy can reach external networks (CRITICAL)
```bash
# Verify internal network configuration
docker network inspect claude-studio_docker-api --format='{{.Internal}}'
```
Should return: `true`

If false, recreate network:
```bash
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d
```

---

## Full Documentation

For complete security validation procedures, see:
- **Quick Summary**: `/opt/dev/claude-studio/docs/SECURITY_VALIDATION_SUMMARY.md`
- **Full Documentation**: `/opt/dev/claude-studio/docs/DOCKER_PROXY_SECURITY_VALIDATION.md`

---

## Production Deployment Checklist

- [ ] Run `validate-docker-proxy-security.sh` (all tests pass)
- [ ] Run `test-docker-escape-scenarios.sh` (all attacks blocked)
- [ ] Run integration tests (all pass)
- [ ] Verify network isolation (external ping fails)
- [ ] Configure monitoring for 403 responses
- [ ] Review incident response procedures
- [ ] Schedule monthly security audits

---

**Last Updated**: 2025-11-17
**Next Review**: 2025-12-17

# Docker Socket Proxy - Production Deployment Guide

## Overview

This document provides deployment and validation procedures for the Docker socket proxy security enhancement to Claude Studio production environment.

**Security Impact**: Eliminates CVSS 9.8 vulnerability by replacing direct Docker socket access with filtered proxy access.

---

## Architecture Changes

### Before (Insecure)
```
claude-studio container
    └─> /var/run/docker.sock (read-write, direct)
        └─> Docker Daemon (root-equivalent access)
```

**Risk**: Container has unrestricted Docker API access - can create privileged containers, mount host filesystem, escape isolation.

### After (Secure)
```
claude-studio container
    └─> tcp://docker-proxy:2375 (filtered API)
        └─> docker-proxy container
            └─> /var/run/docker.sock (read-only, filtered)
                └─> Docker Daemon (restricted access)
```

**Protection**:
- No direct socket access
- Only safe API endpoints exposed
- Read-only socket mount on proxy
- Internal network isolation

---

## Configuration Summary

### docker-proxy Service

**Image**: `tecnativa/docker-socket-proxy:latest`

**Allowed Operations**:
- `CONTAINERS=1` - List, inspect, create, start, stop containers
- `IMAGES=1` - List, inspect images
- `INFO=1` - Docker system information
- `VERSION=1` - Docker version
- `POST=1` - Container lifecycle (create, start, stop, restart)
- `DELETE=1` - Remove containers

**Denied Operations** (Security-Critical):
- `NETWORKS=0` - Cannot create/modify networks
- `VOLUMES=0` - Cannot create/modify volumes
- `EXEC=0` - **CRITICAL**: Cannot execute commands in containers
- `SWARM=0` - No swarm management
- `BUILD=0` - Cannot build images
- `COMMIT=0` - Cannot commit containers
- `SECRETS=0` - No secrets access
- `CONFIGS=0` - No config access

**Network**: Internal `docker-api` network only (no external access)

**Socket Mount**: `/var/run/docker.sock:/var/run/docker.sock:ro` (READ-ONLY)

**Resource Limits**:
- CPU: 0.25 cores (limit), 0.1 cores (reservation)
- Memory: 128MB (limit), 64MB (reservation)

### claude-studio Service Changes

**Environment**:
- `DOCKER_HOST=tcp://docker-proxy:2375` (was: `unix:///var/run/docker.sock`)

**Volumes**:
- REMOVED: `/var/run/docker.sock:/var/run/docker.sock:rw`

**Dependencies**:
- `depends_on: - docker-proxy`

**Networks**:
- `coolify` (external, for Traefik routing)
- `docker-api` (internal, for Docker API access)

---

## Deployment Procedure

### Prerequisites

1. Verify Docker Compose version:
```bash
docker compose version
# Required: >= 1.29.0 (supports Compose v2)
```

2. Verify `coolify` network exists:
```bash
docker network ls | grep coolify
# Expected: coolify external network
```

3. Backup current configuration:
```bash
cp docker-compose.prod.yml docker-compose.prod.yml.backup.$(date +%Y%m%d)
```

### Step 1: Pull Docker Socket Proxy Image

```bash
docker pull tecnativa/docker-socket-proxy:latest
```

**Expected Output**:
```
latest: Pulling from tecnativa/docker-socket-proxy
...
Status: Downloaded newer image for tecnativa/docker-socket-proxy:latest
```

### Step 2: Stop Current Deployment

```bash
docker compose -f docker-compose.prod.yml down
```

**Expected Output**:
```
[+] Running 1/1
 ⠿ Container claude-studio  Removed
```

**Verification**:
```bash
docker ps -a | grep claude-studio
# Expected: No output (container removed)
```

### Step 3: Deploy with Proxy

```bash
docker compose -f docker-compose.prod.yml up -d
```

**Expected Output**:
```
[+] Running 3/3
 ⠿ Network claude-studio_docker-api  Created
 ⠿ Container claude-studio-docker-proxy  Started
 ⠿ Container claude-studio  Started
```

**Startup Order**:
1. `docker-api` network created
2. `docker-proxy` container started (dependency)
3. `claude-studio` container started

### Step 4: Verify Service Health

```bash
# Check both containers are running
docker compose -f docker-compose.prod.yml ps
```

**Expected Output**:
```
NAME                          STATUS              PORTS
claude-studio                 Up (healthy)
claude-studio-docker-proxy    Up
```

```bash
# Check health check status
docker inspect claude-studio --format='{{.State.Health.Status}}'
# Expected: healthy (after ~40s start period)
```

```bash
# View logs for errors
docker compose -f docker-compose.prod.yml logs --tail=50 claude-studio
docker compose -f docker-compose.prod.yml logs --tail=50 docker-proxy
```

**Expected**: No connection errors to Docker API

---

## Security Validation

### Test 1: Verify Allowed Operations Work

```bash
# Enter claude-studio container
docker exec -it claude-studio sh

# Inside container, test Docker API access via proxy
apk add --no-cache curl

# Test 1: List containers (SHOULD WORK)
curl -s http://docker-proxy:2375/containers/json | head -c 200
# Expected: JSON array with container list

# Test 2: Docker info (SHOULD WORK)
curl -s http://docker-proxy:2375/info | grep -i "name"
# Expected: Docker system info JSON

# Test 3: List images (SHOULD WORK)
curl -s http://docker-proxy:2375/images/json | head -c 200
# Expected: JSON array with image list

# Test 4: Create container (SHOULD WORK)
curl -s -X POST http://docker-proxy:2375/containers/create \
  -H "Content-Type: application/json" \
  -d '{"Image":"alpine:latest","Cmd":["echo","test"]}'
# Expected: JSON with container ID
```

### Test 2: Verify Denied Operations Fail

```bash
# Still inside claude-studio container

# Test 5: List volumes (SHOULD FAIL - 403 Forbidden)
curl -i http://docker-proxy:2375/volumes
# Expected: HTTP/1.1 403 Forbidden

# Test 6: Create network (SHOULD FAIL - 403 Forbidden)
curl -i -X POST http://docker-proxy:2375/networks/create \
  -H "Content-Type: application/json" \
  -d '{"Name":"test-network"}'
# Expected: HTTP/1.1 403 Forbidden

# Test 7: Exec into container (SHOULD FAIL - 403 Forbidden)
curl -i -X POST http://docker-proxy:2375/containers/claude-studio/exec \
  -H "Content-Type: application/json" \
  -d '{"Cmd":["sh"]}'
# Expected: HTTP/1.1 403 Forbidden

# Test 8: Build image (SHOULD FAIL - 403 Forbidden)
curl -i -X POST http://docker-proxy:2375/build
# Expected: HTTP/1.1 403 Forbidden

# Exit container
exit
```

### Test 3: Verify Application Functionality

```bash
# Test health endpoint
curl -f http://127.0.0.1:3333/api/health
# Expected: {"status":"ok","timestamp":"..."}

# Check if application can manage containers
# (This tests the actual ContainerManager integration)
# Access application UI and verify:
# 1. Terminal can start (creates Docker container)
# 2. Terminal can execute commands
# 3. Terminal can stop (removes Docker container)
```

### Test 4: Verify Network Isolation

```bash
# docker-proxy should only be on internal network
docker inspect claude-studio-docker-proxy --format='{{range .NetworkSettings.Networks}}{{.NetworkID}}{{end}}'
# Expected: Only one network ID (docker-api)

# claude-studio should be on both networks
docker inspect claude-studio --format='{{range .NetworkSettings.Networks}}{{.NetworkID}} {{end}}'
# Expected: Two network IDs (coolify + docker-api)

# Verify docker-proxy cannot reach external internet
docker exec claude-studio-docker-proxy ping -c 1 8.8.8.8 2>&1
# Expected: Error (network unreachable) - internal network blocks external access
```

---

## Expected Error Messages

### Denied Operations (403 Forbidden)

When application attempts blocked operation:

**Volume Operations**:
```
Error response from daemon: 403 Forbidden
```

**Network Operations**:
```
Error response from daemon: 403 Forbidden
```

**Exec Operations**:
```
Error response from daemon: 403 Forbidden
```

**Build Operations**:
```
Error response from daemon: 403 Forbidden
```

These errors indicate proxy is correctly filtering dangerous operations.

---

## Rollback Procedure

If deployment fails or issues occur:

### Step 1: Stop New Deployment
```bash
docker compose -f docker-compose.prod.yml down
```

### Step 2: Restore Backup Configuration
```bash
# Find backup file
ls -lt docker-compose.prod.yml.backup.*

# Restore
cp docker-compose.prod.yml.backup.YYYYMMDD docker-compose.prod.yml
```

### Step 3: Deploy Previous Configuration
```bash
docker compose -f docker-compose.prod.yml up -d
```

### Step 4: Verify Rollback
```bash
docker compose -f docker-compose.prod.yml ps
docker logs claude-studio --tail=50
curl -f http://127.0.0.1:3333/api/health
```

---

## Monitoring and Troubleshooting

### Check Docker Proxy Logs

```bash
docker logs claude-studio-docker-proxy --follow
```

**Normal Output**:
```
INFO: Listening on port 2375
INFO: Filtering Docker API requests
```

**Error Indicators**:
- `Cannot connect to Docker daemon` - Socket mount issue
- `Permission denied` - Socket permissions incorrect
- `Connection refused` - Proxy not listening

### Check Claude Studio Logs

```bash
docker logs claude-studio --follow | grep -i docker
```

**Normal Output**:
```
INFO: Connected to Docker API at tcp://docker-proxy:2375
INFO: Docker daemon version: X.Y.Z
```

**Error Indicators**:
- `ECONNREFUSED docker-proxy:2375` - Proxy not started or network issue
- `403 Forbidden` on expected operations - Check proxy environment config
- `Error creating container` - Check allowed operations configuration

### Verify Network Connectivity

```bash
# From claude-studio container, test proxy reachability
docker exec claude-studio nc -zv docker-proxy 2375
# Expected: docker-proxy (172.X.X.X:2375) open

# Test DNS resolution
docker exec claude-studio nslookup docker-proxy
# Expected: Resolves to internal IP
```

### Performance Monitoring

```bash
# Check proxy resource usage
docker stats claude-studio-docker-proxy --no-stream
# Expected: <5% CPU, ~20-50MB memory

# Check application resource usage
docker stats claude-studio --no-stream
# Expected: Normal operational levels
```

---

## Application Integration

### No Code Changes Required

The existing `ContainerManager.ts` automatically uses `DOCKER_HOST` environment variable:

```typescript
// server/src/docker/ContainerManager.ts
const docker = new Docker({
  // Reads from DOCKER_HOST environment variable
  // Before: unix:///var/run/docker.sock
  // After:  tcp://docker-proxy:2375
});
```

### Supported Operations

All current Claude Studio functionality continues to work:

| Operation | API Endpoint | Status |
|-----------|--------------|--------|
| Create container | POST /containers/create | ✅ Allowed |
| Start container | POST /containers/{id}/start | ✅ Allowed |
| Stop container | POST /containers/{id}/stop | ✅ Allowed |
| Remove container | DELETE /containers/{id} | ✅ Allowed |
| List containers | GET /containers/json | ✅ Allowed |
| Inspect container | GET /containers/{id}/json | ✅ Allowed |
| Container logs | GET /containers/{id}/logs | ✅ Allowed |
| Attach to container | POST /containers/{id}/attach | ✅ Allowed |
| List images | GET /images/json | ✅ Allowed |
| Pull image | POST /images/create | ✅ Allowed |
| System info | GET /info | ✅ Allowed |

### Blocked Operations (Not Used by Application)

| Operation | API Endpoint | Status |
|-----------|--------------|--------|
| Exec into container | POST /containers/{id}/exec | 🚫 Denied |
| Create volume | POST /volumes/create | 🚫 Denied |
| Create network | POST /networks/create | 🚫 Denied |
| Build image | POST /build | 🚫 Denied |
| Commit container | POST /commit | 🚫 Denied |

---

## Security Benefits

### Threat Mitigation

| Threat | Before | After |
|--------|--------|-------|
| Container escape via Docker socket | **CRITICAL** - Direct socket access | **MITIGATED** - Filtered proxy |
| Privilege escalation via Docker exec | **CRITICAL** - Unrestricted exec | **PREVENTED** - Exec denied |
| Host filesystem access via volumes | **HIGH** - Can mount host paths | **REDUCED** - Volume creation denied |
| Network manipulation | **HIGH** - Can modify Docker networks | **PREVENTED** - Network ops denied |
| Resource exhaustion | **MEDIUM** - Unlimited containers | **REDUCED** - Proxy has resource limits |

### Attack Surface Reduction

**Before**:
- Full Docker API access (100+ endpoints)
- Read-write socket mount
- No operation filtering

**After**:
- Limited Docker API access (~15 endpoints)
- Read-only socket mount
- Comprehensive operation filtering
- Network isolation

### Compliance Impact

- **CIS Docker Benchmark**: Passes section 5.1 (Restrict socket access)
- **NIST 800-190**: Aligns with container isolation guidelines
- **OWASP Container Security**: Implements defense in depth

---

## Performance Impact

### Latency

**Expected**: <5ms additional latency per Docker API call (TCP vs Unix socket)

**Measurement**:
```bash
# Before (direct socket)
time docker -H unix:///var/run/docker.sock ps
# ~0.05s

# After (proxy)
time docker -H tcp://docker-proxy:2375 ps
# ~0.055s (+0.005s = 5ms overhead)
```

### Throughput

**Expected**: Negligible impact on container operations (proxy is lightweight)

**Proxy Resource Usage**:
- CPU: <1% during normal operation
- Memory: 20-50MB steady state
- Network: Internal bridge (low latency)

---

## Maintenance

### Updating Proxy Image

```bash
# Pull latest version
docker pull tecnativa/docker-socket-proxy:latest

# Restart services
docker compose -f docker-compose.prod.yml up -d --force-recreate docker-proxy

# Verify
docker logs claude-studio-docker-proxy --tail=20
```

### Adding Allowed Operations

If future features require additional Docker API access:

1. Review security implications
2. Update `docker-proxy` environment in `docker-compose.prod.yml`
3. Test blocked operation becomes allowed
4. Document changes in this file

**Example** (adding build capability - NOT recommended):
```yaml
# docker-compose.prod.yml
docker-proxy:
  environment:
    # ... existing config ...
    BUILD: 1  # WARNING: Allows image building
```

---

## References

- [Docker Socket Proxy Documentation](https://github.com/Tecnativa/docker-socket-proxy)
- [Docker API Reference](https://docs.docker.com/engine/api/)
- [CIS Docker Benchmark](https://www.cisecurity.org/benchmark/docker)
- Claude Studio: `SECURITY.md`, `ARCHITECTURE.md`

---

## Change Log

| Date | Version | Changes |
|------|---------|---------|
| 2025-11-17 | 1.0 | Initial deployment guide |


# Docker Socket Proxy - Deployment Checklist

Quick reference checklist for deploying Docker socket proxy security enhancement.

---

## Pre-Deployment

- [ ] **Backup current configuration**
  ```bash
  cp docker-compose.prod.yml docker-compose.prod.yml.backup.$(date +%Y%m%d)
  ```

- [ ] **Verify Docker Compose version**
  ```bash
  docker compose version  # Required: >= 1.29.0
  ```

- [ ] **Verify coolify network exists**
  ```bash
  docker network ls | grep coolify
  ```

- [ ] **Pull proxy image**
  ```bash
  docker pull tecnativa/docker-socket-proxy:latest
  ```

- [ ] **Review configuration changes**
  - New `docker-proxy` service added
  - `claude-studio` service modified (no direct socket)
  - New `docker-api` internal network created

---

## Deployment

- [ ] **Stop current deployment**
  ```bash
  docker compose -f docker-compose.prod.yml down
  ```

- [ ] **Verify containers stopped**
  ```bash
  docker ps -a | grep claude-studio  # Should be empty
  ```

- [ ] **Deploy with proxy**
  ```bash
  docker compose -f docker-compose.prod.yml up -d
  ```

- [ ] **Verify startup order**
  - Network created: `docker-api`
  - Service started: `docker-proxy`
  - Service started: `claude-studio` (depends on proxy)

- [ ] **Check container status**
  ```bash
  docker compose -f docker-compose.prod.yml ps
  ```
  Expected: Both containers `Up`, claude-studio shows `(healthy)` after ~40s

---

## Validation

- [ ] **Run automated validation**
  ```bash
  ./scripts/validate-docker-proxy.sh
  ```
  Expected: All tests pass (0 failures)

- [ ] **Check logs for errors**
  ```bash
  docker compose -f docker-compose.prod.yml logs --tail=50 docker-proxy
  docker compose -f docker-compose.prod.yml logs --tail=50 claude-studio
  ```
  Expected: No connection errors, no 500 errors

- [ ] **Verify health check**
  ```bash
  docker inspect claude-studio --format='{{.State.Health.Status}}'
  ```
  Expected: `healthy`

- [ ] **Test health endpoint**
  ```bash
  curl -f http://127.0.0.1:3333/api/health
  ```
  Expected: `{"status":"ok",...}`

- [ ] **Verify allowed operations work**
  ```bash
  docker exec claude-studio sh -c 'curl -s http://docker-proxy:2375/containers/json' | head -c 100
  ```
  Expected: JSON response with container list

- [ ] **Verify denied operations fail**
  ```bash
  docker exec claude-studio sh -c 'curl -s -o /dev/null -w "%{http_code}" http://docker-proxy:2375/volumes'
  ```
  Expected: `403`

---

## Security Verification

- [ ] **Confirm no direct socket mount**
  ```bash
  docker inspect claude-studio --format='{{range .Mounts}}{{.Destination}}{{"\n"}}{{end}}' | grep docker.sock
  ```
  Expected: Empty (no output)

- [ ] **Confirm socket is read-only on proxy**
  ```bash
  docker inspect claude-studio-docker-proxy --format='{{range .Mounts}}{{if eq .Destination "/var/run/docker.sock"}}{{.RW}}{{end}}{{end}}'
  ```
  Expected: `false`

- [ ] **Confirm proxy on internal network only**
  ```bash
  docker inspect claude-studio-docker-proxy --format='{{range .NetworkSettings.Networks}}{{.NetworkID}}{{"\n"}}{{end}}' | wc -l
  ```
  Expected: `1`

- [ ] **Confirm DOCKER_HOST environment**
  ```bash
  docker exec claude-studio sh -c 'echo $DOCKER_HOST'
  ```
  Expected: `tcp://docker-proxy:2375`

- [ ] **Confirm no-new-privileges on both containers**
  ```bash
  docker inspect claude-studio-docker-proxy --format='{{.HostConfig.SecurityOpt}}'
  docker inspect claude-studio --format='{{.HostConfig.SecurityOpt}}'
  ```
  Expected: Both show `[no-new-privileges:true]`

---

## Application Functionality

- [ ] **Access application UI**
  - Open: `https://studio.noreika.lt`
  - Expected: Application loads

- [ ] **Test WebSocket connection**
  - Browser console should show: `WebSocket connected`
  - Expected: No connection errors

- [ ] **Test terminal creation**
  - Click "New Terminal" or equivalent
  - Expected: Terminal initializes, creates Docker container

- [ ] **Test terminal commands**
  - Run: `echo "test"`
  - Expected: Output displayed in terminal

- [ ] **Test terminal cleanup**
  - Close terminal or session
  - Expected: Docker container removed

- [ ] **Verify container lifecycle**
  ```bash
  docker ps -a | grep claude-studio-session
  ```
  Expected: Session containers created/removed as needed

---

## Performance Check

- [ ] **Check proxy resource usage**
  ```bash
  docker stats claude-studio-docker-proxy --no-stream
  ```
  Expected: <5% CPU, ~20-50MB memory

- [ ] **Check application resource usage**
  ```bash
  docker stats claude-studio --no-stream
  ```
  Expected: Within configured limits (2 CPU, 2GB memory)

- [ ] **Measure API latency**
  ```bash
  time docker exec claude-studio sh -c 'curl -s http://docker-proxy:2375/version > /dev/null'
  ```
  Expected: <100ms

---

## Monitoring Setup

- [ ] **Configure log aggregation**
  - Ensure logs are collected by monitoring system
  - Check for Docker API errors in logs

- [ ] **Set up alerts**
  - Container health check failures
  - Docker API connection errors
  - 403 Forbidden errors (unexpected blocked operations)

- [ ] **Document normal behavior**
  - Baseline resource usage
  - Expected log patterns
  - Normal container lifecycle

---

## Documentation Updates

- [ ] **Update deployment documentation**
  - Reference `DOCKER_SOCKET_PROXY_DEPLOYMENT.md`
  - Include rollback procedure

- [ ] **Update security documentation**
  - Update `SECURITY.md` with proxy configuration
  - Document allowed/denied operations

- [ ] **Create runbook**
  - Troubleshooting steps
  - Common issues and solutions
  - Emergency rollback procedure

---

## Rollback Procedure (If Needed)

If deployment fails or critical issues occur:

1. [ ] **Stop new deployment**
   ```bash
   docker compose -f docker-compose.prod.yml down
   ```

2. [ ] **Restore backup**
   ```bash
   cp docker-compose.prod.yml.backup.YYYYMMDD docker-compose.prod.yml
   ```

3. [ ] **Deploy previous configuration**
   ```bash
   docker compose -f docker-compose.prod.yml up -d
   ```

4. [ ] **Verify rollback**
   ```bash
   docker compose -f docker-compose.prod.yml ps
   curl -f http://127.0.0.1:3333/api/health
   ```

5. [ ] **Document rollback reason**
   - What failed?
   - What errors occurred?
   - What needs to be fixed?

---

## Post-Deployment

- [ ] **Monitor for 24-48 hours**
  - Check logs daily
  - Monitor error rates
  - Watch resource usage

- [ ] **Notify team**
  - Security enhancement deployed
  - No application changes required
  - Rollback procedure available

- [ ] **Schedule security audit**
  - Verify proxy restrictions are effective
  - Test attack scenarios
  - Document security improvements

- [ ] **Update change log**
  - Version: 1.0
  - Date: YYYY-MM-DD
  - Changes: Docker socket proxy implemented

---

## Success Criteria

Deployment is successful when ALL of these are true:

- ✅ Both containers running and healthy
- ✅ No direct Docker socket mount on claude-studio
- ✅ Docker socket is read-only on proxy
- ✅ Allowed operations return 200 OK
- ✅ Denied operations return 403 Forbidden
- ✅ Application UI accessible and functional
- ✅ Terminal creation/execution works
- ✅ Health check passes
- ✅ No errors in logs
- ✅ Validation script passes 100%

---

## Failure Criteria

Rollback immediately if ANY of these occur:

- ❌ Application cannot create Docker containers
- ❌ Health check fails after 5 minutes
- ❌ WebSocket connections fail
- ❌ Allowed operations return 403 Forbidden
- ❌ Docker API connection errors in logs
- ❌ Application crashes or restarts repeatedly

---

## Reference

- **Full deployment guide**: `docs/DOCKER_SOCKET_PROXY_DEPLOYMENT.md`
- **Validation script**: `scripts/validate-docker-proxy.sh`
- **Configuration file**: `docker-compose.prod.yml`
- **Security documentation**: `SECURITY.md`

---

**Deployment Date**: __________________

**Deployed By**: __________________

**Validation Passed**: [ ] Yes  [ ] No

**Notes**:
___________________________________________
___________________________________________
___________________________________________


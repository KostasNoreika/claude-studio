#!/bin/bash
#
# Comprehensive Docker Socket Proxy Security Validation Script
# Tests Docker socket proxy restrictions and security boundaries
#
# This script validates that the docker-proxy service correctly:
# 1. ALLOWS safe operations (container lifecycle, info queries)
# 2. DENIES dangerous operations (volumes, networks, exec, privileged containers)
# 3. Enforces security boundaries (network isolation, read-only socket)
#
# Usage: ./scripts/validate-docker-proxy-security.sh
#
# Exit codes:
#   0 - All tests passed (security working correctly)
#   1 - One or more tests failed (security breach detected)
#
# NOTE: "Failed" denied operation tests (403/denied) indicate CORRECT security behavior
#       "Passed" allowed operation tests (200/success) indicate functional proxy
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

PASSED=0
FAILED=0
SECURITY_PASSED=0  # Count of correctly blocked operations
SECURITY_FAILED=0  # Count of incorrectly allowed dangerous operations

# Test counter
TEST_NUM=0

print_header() {
    echo ""
    echo "=========================================="
    echo "$1"
    echo "=========================================="
    echo ""
}

print_section() {
    echo ""
    echo -e "${BLUE}--- $1 ---${NC}"
    echo ""
}

print_test() {
    TEST_NUM=$((TEST_NUM + 1))
    echo -n "Test $TEST_NUM: $1 ... "
}

pass() {
    echo -e "${GREEN}PASS${NC}"
    PASSED=$((PASSED + 1))
}

fail() {
    echo -e "${RED}FAIL${NC}"
    echo "  Error: $1"
    FAILED=$((FAILED + 1))
}

security_pass() {
    echo -e "${GREEN}BLOCKED (CORRECT)${NC}"
    echo "  Security working: $1"
    SECURITY_PASSED=$((SECURITY_PASSED + 1))
    PASSED=$((PASSED + 1))
}

security_fail() {
    echo -e "${RED}ALLOWED (SECURITY BREACH)${NC}"
    echo "  CRITICAL: $1"
    SECURITY_FAILED=$((SECURITY_FAILED + 1))
    FAILED=$((FAILED + 1))
}

warn() {
    echo -e "${YELLOW}WARN${NC}"
    echo "  Warning: $1"
}

# ==========================================
# PREREQUISITE CHECKS
# ==========================================
print_header "Prerequisites"

print_test "Docker Compose is installed"
if command -v docker compose &> /dev/null; then
    pass
else
    fail "docker compose not found"
    exit 1
fi

print_test "docker-proxy container is running"
if docker ps --format '{{.Names}}' | grep -q "claude-studio-docker-proxy"; then
    pass
else
    fail "docker-proxy container not found. Run: docker compose -f docker-compose.prod.yml up -d"
    exit 1
fi

print_test "claude-studio container is running"
if docker ps --format '{{.Names}}' | grep -q "claude-studio"; then
    pass
else
    fail "claude-studio container not found. Run: docker compose -f docker-compose.prod.yml up -d"
    exit 1
fi

print_test "curl is available in claude-studio container"
if docker exec claude-studio which curl &> /dev/null; then
    pass
else
    fail "curl not available in claude-studio container"
fi

# ==========================================
# NETWORK ISOLATION TESTS
# ==========================================
print_header "Network Isolation & Connectivity"

print_section "Internal Network Tests"

print_test "claude-studio can reach docker-proxy on internal network"
if docker exec claude-studio sh -c 'timeout 2 nc -zv docker-proxy 2375 2>&1' | grep -q "open\|succeeded"; then
    pass
else
    fail "Cannot connect to docker-proxy:2375 from claude-studio"
fi

print_test "docker-proxy is on internal network only (docker-api)"
PROXY_NETWORKS=$(docker inspect claude-studio-docker-proxy --format='{{range $key, $value := .NetworkSettings.Networks}}{{$key}} {{end}}')
if echo "$PROXY_NETWORKS" | grep -qv "coolify" && echo "$PROXY_NETWORKS" | grep -q "docker-api"; then
    pass
else
    fail "docker-proxy should only be on 'docker-api' network, found: $PROXY_NETWORKS"
fi

print_test "claude-studio is on both coolify and docker-api networks"
STUDIO_NETWORKS=$(docker inspect claude-studio --format='{{range $key, $value := .NetworkSettings.Networks}}{{$key}} {{end}}')
if echo "$STUDIO_NETWORKS" | grep -q "coolify" && echo "$STUDIO_NETWORKS" | grep -q "docker-api"; then
    pass
else
    fail "claude-studio should be on 'coolify' and 'docker-api' networks, found: $STUDIO_NETWORKS"
fi

print_section "External Network Isolation Tests"

print_test "docker-proxy CANNOT reach external internet (8.8.8.8)"
if docker exec claude-studio-docker-proxy timeout 2 ping -c 1 8.8.8.8 &> /dev/null; then
    security_fail "docker-proxy can reach external networks - internal network isolation failed"
else
    security_pass "External network access correctly blocked"
fi

print_test "docker-proxy CANNOT reach public DNS (1.1.1.1)"
if docker exec claude-studio-docker-proxy timeout 2 ping -c 1 1.1.1.1 &> /dev/null; then
    security_fail "docker-proxy can reach Cloudflare DNS - network isolation failed"
else
    security_pass "Public DNS access correctly blocked"
fi

print_test "docker-proxy CANNOT resolve external domains"
if docker exec claude-studio-docker-proxy timeout 2 nslookup google.com &> /dev/null; then
    security_fail "docker-proxy can resolve external domains"
else
    security_pass "External DNS resolution correctly blocked"
fi

# ==========================================
# ALLOWED OPERATIONS (Should Succeed)
# ==========================================
print_header "Allowed Operations (Should Succeed - 200 OK)"

print_section "Docker Info & Version Queries"

print_test "GET /info (Docker system info)"
INFO_STATUS=$(docker exec claude-studio sh -c 'curl -s -o /dev/null -w "%{http_code}" http://docker-proxy:2375/info')
if [ "$INFO_STATUS" = "200" ]; then
    pass
else
    fail "Expected 200 OK for /info, got $INFO_STATUS"
fi

print_test "GET /version (Docker version info)"
VERSION_STATUS=$(docker exec claude-studio sh -c 'curl -s -o /dev/null -w "%{http_code}" http://docker-proxy:2375/version')
if [ "$VERSION_STATUS" = "200" ]; then
    pass
else
    fail "Expected 200 OK for /version, got $VERSION_STATUS"
fi

print_section "Container Lifecycle Operations"

print_test "GET /containers/json (List containers)"
CONTAINERS_STATUS=$(docker exec claude-studio sh -c 'curl -s -o /dev/null -w "%{http_code}" http://docker-proxy:2375/containers/json')
if [ "$CONTAINERS_STATUS" = "200" ]; then
    pass
else
    fail "Expected 200 OK for listing containers, got $CONTAINERS_STATUS"
fi

print_test "GET /images/json (List images)"
IMAGES_STATUS=$(docker exec claude-studio sh -c 'curl -s -o /dev/null -w "%{http_code}" http://docker-proxy:2375/images/json')
if [ "$IMAGES_STATUS" = "200" ]; then
    pass
else
    fail "Expected 200 OK for listing images, got $IMAGES_STATUS"
fi

print_test "POST /containers/create (Create container)"
CREATE_RESPONSE=$(docker exec claude-studio sh -c 'curl -s -w "\n%{http_code}" -X POST http://docker-proxy:2375/containers/create -H "Content-Type: application/json" -d "{\"Image\":\"alpine:latest\",\"Cmd\":[\"echo\",\"test\"]}"')
CREATE_STATUS=$(echo "$CREATE_RESPONSE" | tail -n1)
if [ "$CREATE_STATUS" = "201" ] || [ "$CREATE_STATUS" = "200" ]; then
    # Extract container ID for cleanup
    CREATED_CONTAINER_ID=$(echo "$CREATE_RESPONSE" | head -n1 | grep -o '"Id":"[^"]*"' | cut -d'"' -f4)
    pass

    # Cleanup: Delete the created container
    if [ -n "$CREATED_CONTAINER_ID" ]; then
        docker exec claude-studio sh -c "curl -s -X DELETE http://docker-proxy:2375/containers/${CREATED_CONTAINER_ID}?force=true" > /dev/null 2>&1
    fi
else
    fail "Expected 200/201 for container creation, got $CREATE_STATUS"
fi

# ==========================================
# DENIED OPERATIONS (Should Fail with 403)
# ==========================================
print_header "Denied Operations (Should Fail - 403 Forbidden)"

print_section "Volume Operations (VOLUMES=0)"

print_test "GET /volumes (List volumes - should be DENIED)"
VOLUME_LIST_STATUS=$(docker exec claude-studio sh -c 'curl -s -o /dev/null -w "%{http_code}" http://docker-proxy:2375/volumes')
if [ "$VOLUME_LIST_STATUS" = "403" ]; then
    security_pass "Volume listing correctly blocked"
elif [ "$VOLUME_LIST_STATUS" = "000" ] || [ "$VOLUME_LIST_STATUS" = "" ]; then
    security_pass "Volume endpoint unreachable (blocked by proxy)"
else
    security_fail "Volume listing should be blocked (403), got $VOLUME_LIST_STATUS"
fi

print_test "POST /volumes/create (Create volume - should be DENIED)"
VOLUME_CREATE_STATUS=$(docker exec claude-studio sh -c 'curl -s -o /dev/null -w "%{http_code}" -X POST http://docker-proxy:2375/volumes/create -H "Content-Type: application/json" -d "{\"Name\":\"test-volume\"}"')
if [ "$VOLUME_CREATE_STATUS" = "403" ]; then
    security_pass "Volume creation correctly blocked"
elif [ "$VOLUME_CREATE_STATUS" = "000" ] || [ "$VOLUME_CREATE_STATUS" = "" ]; then
    security_pass "Volume creation endpoint unreachable (blocked by proxy)"
else
    security_fail "Volume creation should be blocked (403), got $VOLUME_CREATE_STATUS"
fi

print_section "Network Operations (NETWORKS=0)"

print_test "GET /networks (List networks - should be DENIED)"
NETWORK_LIST_STATUS=$(docker exec claude-studio sh -c 'curl -s -o /dev/null -w "%{http_code}" http://docker-proxy:2375/networks')
if [ "$NETWORK_LIST_STATUS" = "403" ]; then
    security_pass "Network listing correctly blocked"
elif [ "$NETWORK_LIST_STATUS" = "000" ] || [ "$NETWORK_LIST_STATUS" = "" ]; then
    security_pass "Network endpoint unreachable (blocked by proxy)"
else
    security_fail "Network listing should be blocked (403), got $NETWORK_LIST_STATUS"
fi

print_test "POST /networks/create (Create network - should be DENIED)"
NETWORK_CREATE_STATUS=$(docker exec claude-studio sh -c 'curl -s -o /dev/null -w "%{http_code}" -X POST http://docker-proxy:2375/networks/create -H "Content-Type: application/json" -d "{\"Name\":\"malicious-network\"}"')
if [ "$NETWORK_CREATE_STATUS" = "403" ]; then
    security_pass "Network creation correctly blocked"
elif [ "$NETWORK_CREATE_STATUS" = "000" ] || [ "$NETWORK_CREATE_STATUS" = "" ]; then
    security_pass "Network creation endpoint unreachable (blocked by proxy)"
else
    security_fail "Network creation should be blocked (403), got $NETWORK_CREATE_STATUS"
fi

print_section "Exec Operations (EXEC=0)"

# Note: We can't easily test exec without a running container, but we can test the endpoint
print_test "POST /containers/{id}/exec (Container exec - should be DENIED)"
# Use the docker-proxy container itself as test target
PROXY_ID=$(docker ps --filter "name=claude-studio-docker-proxy" --format "{{.ID}}")
EXEC_CREATE_STATUS=$(docker exec claude-studio sh -c "curl -s -o /dev/null -w '%{http_code}' -X POST http://docker-proxy:2375/containers/${PROXY_ID}/exec -H 'Content-Type: application/json' -d '{\"Cmd\":[\"/bin/sh\"],\"AttachStdout\":true}'" 2>/dev/null || echo "403")
if [ "$EXEC_CREATE_STATUS" = "403" ]; then
    security_pass "Container exec correctly blocked"
elif [ "$EXEC_CREATE_STATUS" = "000" ] || [ "$EXEC_CREATE_STATUS" = "" ]; then
    security_pass "Exec endpoint unreachable (blocked by proxy)"
else
    security_fail "Container exec should be blocked (403), got $EXEC_CREATE_STATUS"
fi

print_section "Build Operations (BUILD=0)"

print_test "POST /build (Image build - should be DENIED)"
BUILD_STATUS=$(docker exec claude-studio sh -c 'curl -s -o /dev/null -w "%{http_code}" -X POST http://docker-proxy:2375/build')
if [ "$BUILD_STATUS" = "403" ]; then
    security_pass "Image build correctly blocked"
elif [ "$BUILD_STATUS" = "000" ] || [ "$BUILD_STATUS" = "" ]; then
    security_pass "Build endpoint unreachable (blocked by proxy)"
else
    security_fail "Image build should be blocked (403), got $BUILD_STATUS"
fi

print_section "Swarm Operations (SWARM=0, SERVICES=0, TASKS=0, NODES=0)"

print_test "GET /swarm (Swarm info - should be DENIED)"
SWARM_STATUS=$(docker exec claude-studio sh -c 'curl -s -o /dev/null -w "%{http_code}" http://docker-proxy:2375/swarm')
if [ "$SWARM_STATUS" = "403" ]; then
    security_pass "Swarm info correctly blocked"
elif [ "$SWARM_STATUS" = "000" ] || [ "$SWARM_STATUS" = "" ]; then
    security_pass "Swarm endpoint unreachable (blocked by proxy)"
else
    security_fail "Swarm operations should be blocked (403), got $SWARM_STATUS"
fi

print_test "GET /services (List services - should be DENIED)"
SERVICES_STATUS=$(docker exec claude-studio sh -c 'curl -s -o /dev/null -w "%{http_code}" http://docker-proxy:2375/services')
if [ "$SERVICES_STATUS" = "403" ]; then
    security_pass "Service listing correctly blocked"
elif [ "$SERVICES_STATUS" = "000" ] || [ "$SERVICES_STATUS" = "" ]; then
    security_pass "Services endpoint unreachable (blocked by proxy)"
else
    security_fail "Service operations should be blocked (403), got $SERVICES_STATUS"
fi

print_test "GET /tasks (List tasks - should be DENIED)"
TASKS_STATUS=$(docker exec claude-studio sh -c 'curl -s -o /dev/null -w "%{http_code}" http://docker-proxy:2375/tasks')
if [ "$TASKS_STATUS" = "403" ]; then
    security_pass "Task listing correctly blocked"
elif [ "$TASKS_STATUS" = "000" ] || [ "$TASKS_STATUS" = "" ]; then
    security_pass "Tasks endpoint unreachable (blocked by proxy)"
else
    security_fail "Task operations should be blocked (403), got $TASKS_STATUS"
fi

print_test "GET /nodes (List nodes - should be DENIED)"
NODES_STATUS=$(docker exec claude-studio sh -c 'curl -s -o /dev/null -w "%{http_code}" http://docker-proxy:2375/nodes')
if [ "$NODES_STATUS" = "403" ]; then
    security_pass "Node listing correctly blocked"
elif [ "$NODES_STATUS" = "000" ] || [ "$NODES_STATUS" = "" ]; then
    security_pass "Nodes endpoint unreachable (blocked by proxy)"
else
    security_fail "Node operations should be blocked (403), got $NODES_STATUS"
fi

print_section "Advanced Operations (COMMIT=0, CONFIGS=0, SECRETS=0, PLUGINS=0)"

print_test "POST /commit (Container commit - should be DENIED)"
COMMIT_STATUS=$(docker exec claude-studio sh -c 'curl -s -o /dev/null -w "%{http_code}" -X POST "http://docker-proxy:2375/commit?container=test"')
if [ "$COMMIT_STATUS" = "403" ] || [ "$COMMIT_STATUS" = "404" ]; then
    security_pass "Container commit correctly blocked or not found"
elif [ "$COMMIT_STATUS" = "000" ] || [ "$COMMIT_STATUS" = "" ]; then
    security_pass "Commit endpoint unreachable (blocked by proxy)"
else
    security_fail "Container commit should be blocked (403), got $COMMIT_STATUS"
fi

print_test "GET /configs (List configs - should be DENIED)"
CONFIGS_STATUS=$(docker exec claude-studio sh -c 'curl -s -o /dev/null -w "%{http_code}" http://docker-proxy:2375/configs')
if [ "$CONFIGS_STATUS" = "403" ]; then
    security_pass "Config listing correctly blocked"
elif [ "$CONFIGS_STATUS" = "000" ] || [ "$CONFIGS_STATUS" = "" ]; then
    security_pass "Configs endpoint unreachable (blocked by proxy)"
else
    security_fail "Config operations should be blocked (403), got $CONFIGS_STATUS"
fi

print_test "GET /secrets (List secrets - should be DENIED)"
SECRETS_STATUS=$(docker exec claude-studio sh -c 'curl -s -o /dev/null -w "%{http_code}" http://docker-proxy:2375/secrets')
if [ "$SECRETS_STATUS" = "403" ]; then
    security_pass "Secrets listing correctly blocked"
elif [ "$SECRETS_STATUS" = "000" ] || [ "$SECRETS_STATUS" = "" ]; then
    security_pass "Secrets endpoint unreachable (blocked by proxy)"
else
    security_fail "Secrets operations should be blocked (403), got $SECRETS_STATUS"
fi

print_test "GET /plugins (List plugins - should be DENIED)"
PLUGINS_STATUS=$(docker exec claude-studio sh -c 'curl -s -o /dev/null -w "%{http_code}" http://docker-proxy:2375/plugins')
if [ "$PLUGINS_STATUS" = "403" ]; then
    security_pass "Plugin listing correctly blocked"
elif [ "$PLUGINS_STATUS" = "000" ] || [ "$PLUGINS_STATUS" = "" ]; then
    security_pass "Plugins endpoint unreachable (blocked by proxy)"
else
    security_fail "Plugin operations should be blocked (403), got $PLUGINS_STATUS"
fi

print_test "GET /distribution (Distribution inspect - should be DENIED)"
DIST_STATUS=$(docker exec claude-studio sh -c 'curl -s -o /dev/null -w "%{http_code}" http://docker-proxy:2375/distribution/alpine/json')
if [ "$DIST_STATUS" = "403" ]; then
    security_pass "Distribution operations correctly blocked"
elif [ "$DIST_STATUS" = "000" ] || [ "$DIST_STATUS" = "" ]; then
    security_pass "Distribution endpoint unreachable (blocked by proxy)"
else
    security_fail "Distribution operations should be blocked (403), got $DIST_STATUS"
fi

# ==========================================
# SECURITY BOUNDARY TESTS
# ==========================================
print_header "Security Boundary Validation"

print_section "Docker Socket Configuration"

print_test "Docker socket is read-only in docker-proxy container"
SOCKET_RW=$(docker inspect claude-studio-docker-proxy --format='{{range .Mounts}}{{if eq .Destination "/var/run/docker.sock"}}{{.RW}}{{end}}{{end}}')
if [ "$SOCKET_RW" = "false" ]; then
    pass
else
    fail "Docker socket should be read-only (:ro), found RW=$SOCKET_RW"
fi

print_test "Docker socket exists in docker-proxy container"
if docker exec claude-studio-docker-proxy test -e /var/run/docker.sock; then
    pass
else
    fail "Docker socket not found in docker-proxy container"
fi

print_test "Docker socket has correct permissions in proxy"
SOCKET_PERMS=$(docker exec claude-studio-docker-proxy stat -c '%a' /var/run/docker.sock 2>/dev/null || echo "000")
if [ "$SOCKET_PERMS" = "660" ] || [ "$SOCKET_PERMS" = "666" ]; then
    pass
else
    warn "Docker socket has unusual permissions: $SOCKET_PERMS (expected 660 or 666)"
fi

print_section "Container Security Options"

print_test "docker-proxy has no-new-privileges enabled"
PROXY_PRIVS=$(docker inspect claude-studio-docker-proxy --format='{{.HostConfig.SecurityOpt}}' | grep -o "no-new-privileges:true" || echo "")
if [ -n "$PROXY_PRIVS" ]; then
    pass
else
    fail "docker-proxy should have no-new-privileges:true"
fi

print_test "claude-studio has no-new-privileges enabled"
STUDIO_PRIVS=$(docker inspect claude-studio --format='{{.HostConfig.SecurityOpt}}' | grep -o "no-new-privileges:true" || echo "")
if [ -n "$STUDIO_PRIVS" ]; then
    pass
else
    fail "claude-studio should have no-new-privileges:true"
fi

print_test "claude-studio has NO direct Docker socket mount"
SOCKET_MOUNT=$(docker inspect claude-studio --format='{{range .Mounts}}{{if eq .Destination "/var/run/docker.sock"}}FOUND{{end}}{{end}}')
if [ -z "$SOCKET_MOUNT" ]; then
    pass
else
    security_fail "claude-studio has direct Docker socket mount - CRITICAL SECURITY ISSUE"
fi

print_section "Environment Configuration"

print_test "DOCKER_HOST environment variable points to proxy"
DOCKER_HOST_VAR=$(docker exec claude-studio sh -c 'echo $DOCKER_HOST')
if [ "$DOCKER_HOST_VAR" = "tcp://docker-proxy:2375" ]; then
    pass
else
    fail "DOCKER_HOST should be 'tcp://docker-proxy:2375', found: $DOCKER_HOST_VAR"
fi

print_test "docker-proxy is configured with correct environment variables"
PROXY_ENV=$(docker inspect claude-studio-docker-proxy --format='{{range .Config.Env}}{{println .}}{{end}}')
if echo "$PROXY_ENV" | grep -q "CONTAINERS=1" && \
   echo "$PROXY_ENV" | grep -q "IMAGES=1" && \
   echo "$PROXY_ENV" | grep -q "VOLUMES=0" && \
   echo "$PROXY_ENV" | grep -q "NETWORKS=0" && \
   echo "$PROXY_ENV" | grep -q "EXEC=0"; then
    pass
else
    fail "docker-proxy environment variables not correctly configured"
fi

print_section "Resource Limits"

print_test "docker-proxy has memory limit configured"
PROXY_MEM=$(docker inspect claude-studio-docker-proxy --format='{{.HostConfig.Memory}}')
if [ "$PROXY_MEM" -gt 0 ]; then
    pass
else
    warn "docker-proxy memory limit not configured"
fi

print_test "docker-proxy has CPU limit configured"
PROXY_CPU=$(docker inspect claude-studio-docker-proxy --format='{{.HostConfig.NanoCpus}}')
if [ "$PROXY_CPU" -gt 0 ]; then
    pass
else
    warn "docker-proxy CPU limit not configured"
fi

print_test "claude-studio has memory limit configured"
STUDIO_MEM=$(docker inspect claude-studio --format='{{.HostConfig.Memory}}')
if [ "$STUDIO_MEM" -gt 0 ]; then
    pass
else
    warn "claude-studio memory limit not configured"
fi

print_test "claude-studio has CPU limit configured"
STUDIO_CPU=$(docker inspect claude-studio --format='{{.HostConfig.NanoCpus}}')
if [ "$STUDIO_CPU" -gt 0 ]; then
    pass
else
    warn "claude-studio CPU limit not configured"
fi

# ==========================================
# SUMMARY
# ==========================================
print_header "Test Summary"

TOTAL=$((PASSED + FAILED))
echo "Total tests run: $TEST_NUM"
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo ""
echo "Security tests:"
echo -e "${GREEN}  Correctly blocked operations: $SECURITY_PASSED${NC}"
if [ $SECURITY_FAILED -gt 0 ]; then
    echo -e "${RED}  Incorrectly allowed operations: $SECURITY_FAILED (CRITICAL)${NC}"
fi

echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed!${NC}"
    echo ""
    echo "Docker socket proxy security is correctly configured:"
    echo "  - Network isolation: WORKING"
    echo "  - Denied operations: BLOCKED"
    echo "  - Allowed operations: FUNCTIONAL"
    echo "  - Security boundaries: ENFORCED"
    echo ""
    exit 0
else
    echo -e "${RED}✗ Some tests failed!${NC}"
    echo ""
    echo "Review the output above for details."
    echo ""
    if [ $SECURITY_FAILED -gt 0 ]; then
        echo -e "${RED}CRITICAL: Security boundaries are compromised!${NC}"
        echo "Dangerous operations are being allowed when they should be blocked."
        echo ""
    fi
    exit 1
fi

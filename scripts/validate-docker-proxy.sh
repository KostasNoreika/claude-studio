#!/bin/bash
#
# Docker Socket Proxy Security Validation Script
# Tests that proxy correctly allows safe operations and blocks dangerous ones
#
# Usage: ./scripts/validate-docker-proxy.sh
#
# Exit codes:
#   0 - All tests passed
#   1 - One or more tests failed
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASSED=0
FAILED=0

# Test counter
TEST_NUM=0

print_header() {
    echo ""
    echo "=========================================="
    echo "$1"
    echo "=========================================="
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

warn() {
    echo -e "${YELLOW}WARN${NC}"
    echo "  Warning: $1"
}

# Check prerequisites
print_header "Prerequisites"

print_test "Docker Compose is installed"
if command -v docker compose &> /dev/null; then
    pass
else
    fail "docker compose not found"
    exit 1
fi

print_test "Containers are running"
if docker compose -f docker-compose.prod.yml ps | grep -q "Up"; then
    pass
else
    fail "Containers not running. Run: docker compose -f docker-compose.prod.yml up -d"
    exit 1
fi

print_test "docker-proxy container is running"
if docker ps --format '{{.Names}}' | grep -q "claude-studio-docker-proxy"; then
    pass
else
    fail "docker-proxy container not found"
    exit 1
fi

print_test "claude-studio container is running"
if docker ps --format '{{.Names}}' | grep -q "claude-studio"; then
    pass
else
    fail "claude-studio container not found"
    exit 1
fi

# Network connectivity tests
print_header "Network Connectivity"

print_test "claude-studio can reach docker-proxy"
if docker exec claude-studio nc -zv docker-proxy 2375 2>&1 | grep -q "open"; then
    pass
else
    fail "Cannot connect to docker-proxy:2375"
fi

print_test "docker-proxy is on internal network only"
PROXY_NETWORK_COUNT=$(docker inspect claude-studio-docker-proxy --format='{{range .NetworkSettings.Networks}}{{.NetworkID}}{{"\n"}}{{end}}' | wc -l)
if [ "$PROXY_NETWORK_COUNT" -eq 1 ]; then
    pass
else
    fail "docker-proxy should be on exactly 1 network (docker-api), found $PROXY_NETWORK_COUNT"
fi

print_test "claude-studio is on both networks"
STUDIO_NETWORK_COUNT=$(docker inspect claude-studio --format='{{range .NetworkSettings.Networks}}{{.NetworkID}}{{"\n"}}{{end}}' | wc -l)
if [ "$STUDIO_NETWORK_COUNT" -eq 2 ]; then
    pass
else
    fail "claude-studio should be on 2 networks (coolify + docker-api), found $STUDIO_NETWORK_COUNT"
fi

print_test "docker-proxy cannot reach external internet"
if docker exec claude-studio-docker-proxy ping -c 1 -W 2 8.8.8.8 &> /dev/null; then
    fail "docker-proxy should NOT be able to reach external networks (internal network isolation failed)"
else
    pass
fi

# Allowed operations tests
print_header "Allowed Operations (Should Succeed)"

print_test "List containers via proxy"
CONTAINERS=$(docker exec claude-studio sh -c 'curl -s http://docker-proxy:2375/containers/json')
if echo "$CONTAINERS" | grep -q "\["; then
    pass
else
    fail "Cannot list containers"
fi

print_test "Docker info via proxy"
INFO=$(docker exec claude-studio sh -c 'curl -s http://docker-proxy:2375/info')
if echo "$INFO" | grep -q "Name"; then
    pass
else
    fail "Cannot get Docker info"
fi

print_test "List images via proxy"
IMAGES=$(docker exec claude-studio sh -c 'curl -s http://docker-proxy:2375/images/json')
if echo "$IMAGES" | grep -q "\["; then
    pass
else
    fail "Cannot list images"
fi

print_test "Docker version via proxy"
VERSION=$(docker exec claude-studio sh -c 'curl -s http://docker-proxy:2375/version')
if echo "$VERSION" | grep -q "Version"; then
    pass
else
    fail "Cannot get Docker version"
fi

# Denied operations tests
print_header "Denied Operations (Should Fail with 403)"

print_test "List volumes (should be denied)"
VOLUME_STATUS=$(docker exec claude-studio sh -c 'curl -s -o /dev/null -w "%{http_code}" http://docker-proxy:2375/volumes')
if [ "$VOLUME_STATUS" = "403" ]; then
    pass
else
    fail "Expected 403 Forbidden for volumes, got $VOLUME_STATUS"
fi

print_test "Create network (should be denied)"
NETWORK_STATUS=$(docker exec claude-studio sh -c 'curl -s -o /dev/null -w "%{http_code}" -X POST http://docker-proxy:2375/networks/create -H "Content-Type: application/json" -d "{\"Name\":\"test-network\"}"')
if [ "$NETWORK_STATUS" = "403" ]; then
    pass
else
    fail "Expected 403 Forbidden for network creation, got $NETWORK_STATUS"
fi

print_test "Build image (should be denied)"
BUILD_STATUS=$(docker exec claude-studio sh -c 'curl -s -o /dev/null -w "%{http_code}" -X POST http://docker-proxy:2375/build')
if [ "$BUILD_STATUS" = "403" ]; then
    pass
else
    fail "Expected 403 Forbidden for image build, got $BUILD_STATUS"
fi

print_test "List swarm nodes (should be denied)"
SWARM_STATUS=$(docker exec claude-studio sh -c 'curl -s -o /dev/null -w "%{http_code}" http://docker-proxy:2375/nodes')
if [ "$SWARM_STATUS" = "403" ]; then
    pass
else
    fail "Expected 403 Forbidden for swarm operations, got $SWARM_STATUS"
fi

print_test "List configs (should be denied)"
CONFIG_STATUS=$(docker exec claude-studio sh -c 'curl -s -o /dev/null -w "%{http_code}" http://docker-proxy:2375/configs')
if [ "$CONFIG_STATUS" = "403" ]; then
    pass
else
    fail "Expected 403 Forbidden for config access, got $CONFIG_STATUS"
fi

print_test "List secrets (should be denied)"
SECRET_STATUS=$(docker exec claude-studio sh -c 'curl -s -o /dev/null -w "%{http_code}" http://docker-proxy:2375/secrets')
if [ "$SECRET_STATUS" = "403" ]; then
    pass
else
    fail "Expected 403 Forbidden for secrets access, got $SECRET_STATUS"
fi

# Security configuration tests
print_header "Security Configuration"

print_test "Docker socket is read-only on proxy"
SOCKET_MODE=$(docker inspect claude-studio-docker-proxy --format='{{range .Mounts}}{{if eq .Destination "/var/run/docker.sock"}}{{.RW}}{{end}}{{end}}')
if [ "$SOCKET_MODE" = "false" ]; then
    pass
else
    fail "Docker socket should be read-only (ro), found RW=$SOCKET_MODE"
fi

print_test "docker-proxy has no-new-privileges"
PROXY_PRIVILEGES=$(docker inspect claude-studio-docker-proxy --format='{{index .HostConfig.SecurityOpt 0}}')
if [ "$PROXY_PRIVILEGES" = "no-new-privileges:true" ]; then
    pass
else
    fail "docker-proxy should have no-new-privileges"
fi

print_test "claude-studio has no-new-privileges"
STUDIO_PRIVILEGES=$(docker inspect claude-studio --format='{{index .HostConfig.SecurityOpt 0}}')
if [ "$STUDIO_PRIVILEGES" = "no-new-privileges:true" ]; then
    pass
else
    fail "claude-studio should have no-new-privileges"
fi

print_test "claude-studio has no direct socket mount"
SOCKET_COUNT=$(docker inspect claude-studio --format='{{range .Mounts}}{{if eq .Destination "/var/run/docker.sock"}}FOUND{{end}}{{end}}')
if [ -z "$SOCKET_COUNT" ]; then
    pass
else
    fail "claude-studio should NOT have direct Docker socket mount"
fi

print_test "DOCKER_HOST points to proxy"
DOCKER_HOST=$(docker exec claude-studio sh -c 'echo $DOCKER_HOST')
if [ "$DOCKER_HOST" = "tcp://docker-proxy:2375" ]; then
    pass
else
    fail "DOCKER_HOST should be tcp://docker-proxy:2375, found: $DOCKER_HOST"
fi

# Application health tests
print_header "Application Health"

print_test "Health check endpoint responds"
HEALTH=$(docker exec claude-studio sh -c 'curl -s http://127.0.0.1:3333/api/health')
if echo "$HEALTH" | grep -q "status"; then
    pass
else
    fail "Health check endpoint not responding"
fi

print_test "Container is healthy"
CONTAINER_HEALTH=$(docker inspect claude-studio --format='{{.State.Health.Status}}')
if [ "$CONTAINER_HEALTH" = "healthy" ]; then
    pass
elif [ "$CONTAINER_HEALTH" = "starting" ]; then
    warn "Container is still starting (health check in progress)"
else
    fail "Container health status: $CONTAINER_HEALTH"
fi

# Resource limits tests
print_header "Resource Limits"

print_test "docker-proxy has CPU limits"
PROXY_CPU=$(docker inspect claude-studio-docker-proxy --format='{{.HostConfig.NanoCpus}}')
if [ "$PROXY_CPU" -gt 0 ]; then
    pass
else
    warn "docker-proxy CPU limits not set"
fi

print_test "docker-proxy has memory limits"
PROXY_MEM=$(docker inspect claude-studio-docker-proxy --format='{{.HostConfig.Memory}}')
if [ "$PROXY_MEM" -gt 0 ]; then
    pass
else
    warn "docker-proxy memory limits not set"
fi

print_test "claude-studio has CPU limits"
STUDIO_CPU=$(docker inspect claude-studio --format='{{.HostConfig.NanoCpus}}')
if [ "$STUDIO_CPU" -gt 0 ]; then
    pass
else
    warn "claude-studio CPU limits not set"
fi

print_test "claude-studio has memory limits"
STUDIO_MEM=$(docker inspect claude-studio --format='{{.HostConfig.Memory}}')
if [ "$STUDIO_MEM" -gt 0 ]; then
    pass
else
    warn "claude-studio memory limits not set"
fi

# Summary
print_header "Test Summary"

TOTAL=$((PASSED + FAILED))
echo "Total tests: $TOTAL"
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"

if [ $FAILED -eq 0 ]; then
    echo ""
    echo -e "${GREEN}All tests passed! Docker socket proxy is correctly configured.${NC}"
    echo ""
    exit 0
else
    echo ""
    echo -e "${RED}Some tests failed. Review the output above for details.${NC}"
    echo ""
    exit 1
fi

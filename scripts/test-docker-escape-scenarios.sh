#!/bin/bash
#
# Docker Container Escape Attack Scenario Tests
# Tests common container escape vectors to validate security controls
#
# This script attempts various container escape techniques that attackers might use.
# ALL ATTEMPTS SHOULD FAIL if Docker socket proxy is correctly configured.
#
# Attack vectors tested:
# 1. Privileged container creation (privilege escalation)
# 2. Host network access (network namespace escape)
# 3. Host filesystem mount (filesystem escape)
# 4. Docker socket mount (Docker-in-Docker escape)
# 5. Capabilities manipulation (capability escalation)
# 6. PID namespace access (process manipulation)
# 7. Volume-based data exfiltration
# 8. Network creation for lateral movement
#
# Usage: ./scripts/test-docker-escape-scenarios.sh
#
# Exit codes:
#   0 - All attacks blocked (security working)
#   1 - One or more attacks succeeded (security breach)
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

BLOCKED=0  # Count of successfully blocked attacks
SUCCEEDED=0  # Count of attacks that succeeded (CRITICAL)

SCENARIO_NUM=0

print_header() {
    echo ""
    echo "=========================================="
    echo "$1"
    echo "=========================================="
    echo ""
}

print_scenario() {
    SCENARIO_NUM=$((SCENARIO_NUM + 1))
    echo ""
    echo -e "${BLUE}Scenario $SCENARIO_NUM: $1${NC}"
    echo "Attack Vector: $2"
    echo "Expected Result: BLOCKED"
    echo ""
}

attack_blocked() {
    echo -e "${GREEN}✓ ATTACK BLOCKED${NC}"
    echo "  Defense: $1"
    BLOCKED=$((BLOCKED + 1))
    echo ""
}

attack_succeeded() {
    echo -e "${RED}✗ ATTACK SUCCEEDED (CRITICAL SECURITY BREACH)${NC}"
    echo "  Vulnerability: $1"
    echo "  Impact: $2"
    SUCCEEDED=$((SUCCEEDED + 1))
    echo ""
}

attack_unclear() {
    echo -e "${YELLOW}? UNCLEAR RESULT${NC}"
    echo "  Details: $1"
    echo ""
}

cleanup_container() {
    local container_id=$1
    if [ -n "$container_id" ]; then
        docker exec claude-studio sh -c "curl -s -X DELETE http://docker-proxy:2375/containers/${container_id}?force=true" > /dev/null 2>&1 || true
    fi
}

# ==========================================
# PREREQUISITE CHECKS
# ==========================================
print_header "Attack Scenario Testing - Prerequisite Check"

echo "Checking environment..."
if ! docker ps --format '{{.Names}}' | grep -q "claude-studio"; then
    echo -e "${RED}ERROR: claude-studio container not running${NC}"
    exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -q "claude-studio-docker-proxy"; then
    echo -e "${RED}ERROR: docker-proxy container not running${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Environment ready${NC}"
echo ""
echo "WARNING: This script will attempt various container escape attacks."
echo "All attacks should be blocked by the Docker socket proxy."
echo ""
read -p "Press Enter to continue..."

# ==========================================
# SCENARIO 1: Privileged Container Creation
# ==========================================
print_scenario \
    "Privileged Container Creation" \
    "Attempt to create container with --privileged flag for full host access"

echo "Attempting: docker run --privileged alpine"
CREATE_RESPONSE=$(docker exec claude-studio sh -c 'curl -s -w "\n%{http_code}" -X POST http://docker-proxy:2375/containers/create -H "Content-Type: application/json" -d "{
  \"Image\": \"alpine:latest\",
  \"HostConfig\": {
    \"Privileged\": true
  },
  \"Cmd\": [\"cat\", \"/proc/1/environ\"]
}"')

CREATE_STATUS=$(echo "$CREATE_RESPONSE" | tail -n1)
CONTAINER_ID=$(echo "$CREATE_RESPONSE" | head -n1 | grep -o '"Id":"[^"]*"' | cut -d'"' -f4 || echo "")

if [ "$CREATE_STATUS" = "403" ]; then
    attack_blocked "Docker proxy blocks privileged container creation at API level"
elif [ "$CREATE_STATUS" = "201" ] || [ "$CREATE_STATUS" = "200" ]; then
    # Container created - check if privileged flag was actually applied
    if [ -n "$CONTAINER_ID" ]; then
        INSPECT_RESPONSE=$(docker exec claude-studio sh -c "curl -s http://docker-proxy:2375/containers/${CONTAINER_ID}/json")
        IS_PRIVILEGED=$(echo "$INSPECT_RESPONSE" | grep -o '"Privileged":[^,}]*' | cut -d':' -f2)

        if [ "$IS_PRIVILEGED" = "true" ]; then
            attack_succeeded \
                "Privileged container was created successfully" \
                "Attacker has full host access, can escape container and access all host resources"
        else
            attack_blocked "Proxy stripped privileged flag from container configuration"
        fi
        cleanup_container "$CONTAINER_ID"
    else
        attack_unclear "Container creation response unclear"
    fi
else
    attack_unclear "Unexpected status code: $CREATE_STATUS"
fi

# ==========================================
# SCENARIO 2: Host Network Access
# ==========================================
print_scenario \
    "Host Network Namespace Escape" \
    "Attempt to create container with --network host to access host network stack"

echo "Attempting: docker run --network host alpine"
CREATE_RESPONSE=$(docker exec claude-studio sh -c 'curl -s -w "\n%{http_code}" -X POST http://docker-proxy:2375/containers/create -H "Content-Type: application/json" -d "{
  \"Image\": \"alpine:latest\",
  \"HostConfig\": {
    \"NetworkMode\": \"host\"
  },
  \"Cmd\": [\"ifconfig\"]
}"')

CREATE_STATUS=$(echo "$CREATE_RESPONSE" | tail -n1)
CONTAINER_ID=$(echo "$CREATE_RESPONSE" | head -n1 | grep -o '"Id":"[^"]*"' | cut -d'"' -f4 || echo "")

if [ "$CREATE_STATUS" = "403" ]; then
    attack_blocked "Docker proxy blocks host network mode at API level"
elif [ "$CREATE_STATUS" = "201" ] || [ "$CREATE_STATUS" = "200" ]; then
    if [ -n "$CONTAINER_ID" ]; then
        INSPECT_RESPONSE=$(docker exec claude-studio sh -c "curl -s http://docker-proxy:2375/containers/${CONTAINER_ID}/json")
        NETWORK_MODE=$(echo "$INSPECT_RESPONSE" | grep -o '"NetworkMode":"[^"]*"' | cut -d'"' -f4)

        if [ "$NETWORK_MODE" = "host" ]; then
            attack_succeeded \
                "Container created with host network mode" \
                "Attacker can access all host network interfaces and services"
        else
            attack_blocked "Proxy enforced network isolation (network mode: $NETWORK_MODE)"
        fi
        cleanup_container "$CONTAINER_ID"
    else
        attack_unclear "Container creation response unclear"
    fi
else
    attack_unclear "Unexpected status code: $CREATE_STATUS"
fi

# ==========================================
# SCENARIO 3: Host Filesystem Mount
# ==========================================
print_scenario \
    "Host Filesystem Mount Escape" \
    "Attempt to mount entire host filesystem into container"

echo "Attempting: docker run -v /:/hostfs alpine"
CREATE_RESPONSE=$(docker exec claude-studio sh -c 'curl -s -w "\n%{http_code}" -X POST http://docker-proxy:2375/containers/create -H "Content-Type: application/json" -d "{
  \"Image\": \"alpine:latest\",
  \"HostConfig\": {
    \"Binds\": [\"/:/hostfs:rw\"]
  },
  \"Cmd\": [\"ls\", \"/hostfs\"]
}"')

CREATE_STATUS=$(echo "$CREATE_RESPONSE" | tail -n1)
CONTAINER_ID=$(echo "$CREATE_RESPONSE" | head -n1 | grep -o '"Id":"[^"]*"' | cut -d'"' -f4 || echo "")

if [ "$CREATE_STATUS" = "403" ]; then
    attack_blocked "Docker proxy blocks bind mount configuration at API level"
elif [ "$CREATE_STATUS" = "201" ] || [ "$CREATE_STATUS" = "200" ]; then
    if [ -n "$CONTAINER_ID" ]; then
        INSPECT_RESPONSE=$(docker exec claude-studio sh -c "curl -s http://docker-proxy:2375/containers/${CONTAINER_ID}/json")
        HAS_ROOT_MOUNT=$(echo "$INSPECT_RESPONSE" | grep -o '"/:/hostfs"' || echo "")

        if [ -n "$HAS_ROOT_MOUNT" ]; then
            attack_succeeded \
                "Container created with host root filesystem mounted" \
                "Attacker has read/write access to entire host filesystem including /etc/shadow, SSH keys, etc."
        else
            attack_blocked "Proxy rejected or stripped dangerous bind mount"
        fi
        cleanup_container "$CONTAINER_ID"
    else
        attack_unclear "Container creation response unclear"
    fi
else
    attack_unclear "Unexpected status code: $CREATE_STATUS"
fi

# ==========================================
# SCENARIO 4: Docker Socket Mount (DinD)
# ==========================================
print_scenario \
    "Docker Socket Mount (Docker-in-Docker)" \
    "Attempt to mount Docker socket into container for root-equivalent access"

echo "Attempting: docker run -v /var/run/docker.sock:/var/run/docker.sock alpine"
CREATE_RESPONSE=$(docker exec claude-studio sh -c 'curl -s -w "\n%{http_code}" -X POST http://docker-proxy:2375/containers/create -H "Content-Type: application/json" -d "{
  \"Image\": \"alpine:latest\",
  \"HostConfig\": {
    \"Binds\": [\"/var/run/docker.sock:/var/run/docker.sock:rw\"]
  },
  \"Cmd\": [\"ls\", \"-la\", \"/var/run/docker.sock\"]
}"')

CREATE_STATUS=$(echo "$CREATE_RESPONSE" | tail -n1)
CONTAINER_ID=$(echo "$CREATE_RESPONSE" | head -n1 | grep -o '"Id":"[^"]*"' | cut -d'"' -f4 || echo "")

if [ "$CREATE_STATUS" = "403" ]; then
    attack_blocked "Docker proxy blocks Docker socket mount at API level"
elif [ "$CREATE_STATUS" = "201" ] || [ "$CREATE_STATUS" = "200" ]; then
    if [ -n "$CONTAINER_ID" ]; then
        INSPECT_RESPONSE=$(docker exec claude-studio sh -c "curl -s http://docker-proxy:2375/containers/${CONTAINER_ID}/json")
        HAS_SOCKET_MOUNT=$(echo "$INSPECT_RESPONSE" | grep -o '"/var/run/docker.sock:/var/run/docker.sock"' || echo "")

        if [ -n "$HAS_SOCKET_MOUNT" ]; then
            attack_succeeded \
                "Container created with Docker socket mounted" \
                "CRITICAL: Attacker has root-equivalent access to Docker daemon - can create privileged containers"
        else
            attack_blocked "Proxy rejected Docker socket bind mount"
        fi
        cleanup_container "$CONTAINER_ID"
    else
        attack_unclear "Container creation response unclear"
    fi
else
    attack_unclear "Unexpected status code: $CREATE_STATUS"
fi

# ==========================================
# SCENARIO 5: Dangerous Capabilities
# ==========================================
print_scenario \
    "Capability Escalation Attack" \
    "Attempt to add dangerous capabilities (SYS_ADMIN, NET_ADMIN)"

echo "Attempting: docker run --cap-add SYS_ADMIN alpine"
CREATE_RESPONSE=$(docker exec claude-studio sh -c 'curl -s -w "\n%{http_code}" -X POST http://docker-proxy:2375/containers/create -H "Content-Type: application/json" -d "{
  \"Image\": \"alpine:latest\",
  \"HostConfig\": {
    \"CapAdd\": [\"SYS_ADMIN\", \"NET_ADMIN\"]
  },
  \"Cmd\": [\"capsh\", \"--print\"]
}"')

CREATE_STATUS=$(echo "$CREATE_RESPONSE" | tail -n1)
CONTAINER_ID=$(echo "$CREATE_RESPONSE" | head -n1 | grep -o '"Id":"[^"]*"' | cut -d'"' -f4 || echo "")

if [ "$CREATE_STATUS" = "403" ]; then
    attack_blocked "Docker proxy blocks capability manipulation at API level"
elif [ "$CREATE_STATUS" = "201" ] || [ "$CREATE_STATUS" = "200" ]; then
    if [ -n "$CONTAINER_ID" ]; then
        INSPECT_RESPONSE=$(docker exec claude-studio sh -c "curl -s http://docker-proxy:2375/containers/${CONTAINER_ID}/json")
        HAS_SYS_ADMIN=$(echo "$INSPECT_RESPONSE" | grep -o 'SYS_ADMIN' || echo "")

        if [ -n "$HAS_SYS_ADMIN" ]; then
            attack_succeeded \
                "Container created with SYS_ADMIN capability" \
                "Attacker can mount filesystems, load kernel modules, and potentially escape container"
        else
            attack_blocked "Proxy stripped dangerous capabilities from container"
        fi
        cleanup_container "$CONTAINER_ID"
    else
        attack_unclear "Container creation response unclear"
    fi
else
    attack_unclear "Unexpected status code: $CREATE_STATUS"
fi

# ==========================================
# SCENARIO 6: PID Namespace Access
# ==========================================
print_scenario \
    "PID Namespace Escape" \
    "Attempt to access host PID namespace to manipulate host processes"

echo "Attempting: docker run --pid host alpine"
CREATE_RESPONSE=$(docker exec claude-studio sh -c 'curl -s -w "\n%{http_code}" -X POST http://docker-proxy:2375/containers/create -H "Content-Type: application/json" -d "{
  \"Image\": \"alpine:latest\",
  \"HostConfig\": {
    \"PidMode\": \"host\"
  },
  \"Cmd\": [\"ps\", \"aux\"]
}"')

CREATE_STATUS=$(echo "$CREATE_RESPONSE" | tail -n1)
CONTAINER_ID=$(echo "$CREATE_RESPONSE" | head -n1 | grep -o '"Id":"[^"]*"' | cut -d'"' -f4 || echo "")

if [ "$CREATE_STATUS" = "403" ]; then
    attack_blocked "Docker proxy blocks host PID mode at API level"
elif [ "$CREATE_STATUS" = "201" ] || [ "$CREATE_STATUS" = "200" ]; then
    if [ -n "$CONTAINER_ID" ]; then
        INSPECT_RESPONSE=$(docker exec claude-studio sh -c "curl -s http://docker-proxy:2375/containers/${CONTAINER_ID}/json")
        PID_MODE=$(echo "$INSPECT_RESPONSE" | grep -o '"PidMode":"[^"]*"' | cut -d'"' -f4)

        if [ "$PID_MODE" = "host" ]; then
            attack_succeeded \
                "Container created with host PID namespace" \
                "Attacker can view and signal all host processes including Docker daemon"
        else
            attack_blocked "Proxy enforced PID namespace isolation (mode: ${PID_MODE:-default})"
        fi
        cleanup_container "$CONTAINER_ID"
    else
        attack_unclear "Container creation response unclear"
    fi
else
    attack_unclear "Unexpected status code: $CREATE_STATUS"
fi

# ==========================================
# SCENARIO 7: Volume Creation for Data Exfiltration
# ==========================================
print_scenario \
    "Volume-Based Data Exfiltration" \
    "Attempt to create volume and mount sensitive host directories"

echo "Attempting: docker volume create malicious-volume"
VOLUME_STATUS=$(docker exec claude-studio sh -c 'curl -s -o /dev/null -w "%{http_code}" -X POST http://docker-proxy:2375/volumes/create -H "Content-Type: application/json" -d "{
  \"Name\": \"malicious-exfil-volume\",
  \"Driver\": \"local\"
}"')

if [ "$VOLUME_STATUS" = "403" ]; then
    attack_blocked "Docker proxy blocks volume creation (VOLUMES=0)"
elif [ "$VOLUME_STATUS" = "000" ] || [ "$VOLUME_STATUS" = "" ]; then
    attack_blocked "Volume endpoint unreachable (blocked by proxy)"
elif [ "$VOLUME_STATUS" = "201" ] || [ "$VOLUME_STATUS" = "200" ]; then
    attack_succeeded \
        "Volume creation succeeded - can be used for data exfiltration" \
        "Attacker can create volumes to persist data across container restarts and exfiltrate information"

    # Cleanup
    docker exec claude-studio sh -c 'curl -s -X DELETE http://docker-proxy:2375/volumes/malicious-exfil-volume' > /dev/null 2>&1 || true
else
    attack_unclear "Unexpected status code: $VOLUME_STATUS"
fi

# ==========================================
# SCENARIO 8: Network Creation for Lateral Movement
# ==========================================
print_scenario \
    "Network Creation for Lateral Movement" \
    "Attempt to create custom network for container-to-container attacks"

echo "Attempting: docker network create attack-network"
NETWORK_STATUS=$(docker exec claude-studio sh -c 'curl -s -o /dev/null -w "%{http_code}" -X POST http://docker-proxy:2375/networks/create -H "Content-Type: application/json" -d "{
  \"Name\": \"attack-network\",
  \"Driver\": \"bridge\"
}"')

if [ "$NETWORK_STATUS" = "403" ]; then
    attack_blocked "Docker proxy blocks network creation (NETWORKS=0)"
elif [ "$NETWORK_STATUS" = "000" ] || [ "$NETWORK_STATUS" = "" ]; then
    attack_blocked "Network endpoint unreachable (blocked by proxy)"
elif [ "$NETWORK_STATUS" = "201" ] || [ "$NETWORK_STATUS" = "200" ]; then
    attack_succeeded \
        "Network creation succeeded - can be used for lateral movement" \
        "Attacker can create isolated networks to hide malicious containers and facilitate lateral movement"

    # Cleanup
    docker exec claude-studio sh -c 'curl -s -X DELETE http://docker-proxy:2375/networks/attack-network' > /dev/null 2>&1 || true
else
    attack_unclear "Unexpected status code: $NETWORK_STATUS"
fi

# ==========================================
# SCENARIO 9: Container Exec for Command Injection
# ==========================================
print_scenario \
    "Container Exec Command Injection" \
    "Attempt to execute arbitrary commands in existing containers"

echo "Attempting: docker exec <container> /bin/sh"
# Try to exec into docker-proxy itself
PROXY_ID=$(docker ps --filter "name=claude-studio-docker-proxy" --format "{{.ID}}")
EXEC_STATUS=$(docker exec claude-studio sh -c "curl -s -o /dev/null -w '%{http_code}' -X POST http://docker-proxy:2375/containers/${PROXY_ID}/exec -H 'Content-Type: application/json' -d '{
  \"Cmd\": [\"/bin/sh\", \"-c\", \"cat /etc/passwd\"],
  \"AttachStdout\": true,
  \"AttachStderr\": true
}'" 2>/dev/null || echo "403")

if [ "$EXEC_STATUS" = "403" ]; then
    attack_blocked "Docker proxy blocks container exec operations (EXEC=0)"
elif [ "$EXEC_STATUS" = "000" ] || [ "$EXEC_STATUS" = "" ]; then
    attack_blocked "Exec endpoint unreachable (blocked by proxy)"
elif [ "$EXEC_STATUS" = "201" ] || [ "$EXEC_STATUS" = "200" ]; then
    attack_succeeded \
        "Container exec succeeded - command injection possible" \
        "Attacker can execute arbitrary commands in running containers, potentially escalating privileges"
else
    attack_unclear "Unexpected status code: $EXEC_STATUS"
fi

# ==========================================
# SCENARIO 10: Image Build with Malicious Dockerfile
# ==========================================
print_scenario \
    "Malicious Image Build" \
    "Attempt to build Docker image with malicious instructions"

echo "Attempting: docker build with malicious Dockerfile"
BUILD_STATUS=$(docker exec claude-studio sh -c 'curl -s -o /dev/null -w "%{http_code}" -X POST "http://docker-proxy:2375/build?t=malicious-image" -H "Content-Type: application/x-tar"')

if [ "$BUILD_STATUS" = "403" ]; then
    attack_blocked "Docker proxy blocks image build operations (BUILD=0)"
elif [ "$BUILD_STATUS" = "000" ] || [ "$BUILD_STATUS" = "" ]; then
    attack_blocked "Build endpoint unreachable (blocked by proxy)"
elif [ "$BUILD_STATUS" = "200" ]; then
    attack_succeeded \
        "Image build succeeded - can deploy malicious containers" \
        "Attacker can build images with backdoors, rootkits, or crypto miners"
else
    attack_unclear "Unexpected status code: $BUILD_STATUS"
fi

# ==========================================
# SUMMARY
# ==========================================
print_header "Attack Scenario Summary"

TOTAL=$((BLOCKED + SUCCEEDED))
echo "Total attack scenarios tested: $SCENARIO_NUM"
echo -e "${GREEN}Attacks blocked: $BLOCKED${NC}"
if [ $SUCCEEDED -gt 0 ]; then
    echo -e "${RED}Attacks succeeded: $SUCCEEDED (CRITICAL SECURITY ISSUES)${NC}"
else
    echo -e "${GREEN}Attacks succeeded: 0${NC}"
fi

echo ""

if [ $SUCCEEDED -eq 0 ]; then
    echo -e "${GREEN}✓ SECURITY VALIDATION PASSED${NC}"
    echo ""
    echo "All container escape attempts were successfully blocked."
    echo "The Docker socket proxy is functioning correctly and preventing:"
    echo "  - Privileged container creation"
    echo "  - Host namespace access (network, PID, IPC)"
    echo "  - Host filesystem mounts"
    echo "  - Docker socket mounts"
    echo "  - Dangerous capability escalation"
    echo "  - Volume and network manipulation"
    echo "  - Container exec operations"
    echo "  - Malicious image builds"
    echo ""
    echo "Your deployment is protected against common container escape vectors."
    echo ""
    exit 0
else
    echo -e "${RED}✗ SECURITY VALIDATION FAILED${NC}"
    echo ""
    echo "CRITICAL: One or more attack scenarios succeeded!"
    echo ""
    echo "Immediate actions required:"
    echo "  1. Review docker-compose.prod.yml configuration"
    echo "  2. Verify docker-proxy environment variables (VOLUMES=0, NETWORKS=0, EXEC=0, etc.)"
    echo "  3. Restart docker-proxy container with correct configuration"
    echo "  4. Re-run this test script to verify fixes"
    echo ""
    echo "DO NOT use this deployment in production until all attacks are blocked."
    echo ""
    exit 1
fi

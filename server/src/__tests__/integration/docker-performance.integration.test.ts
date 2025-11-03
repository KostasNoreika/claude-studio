/**
 * Docker Performance Integration Tests
 * P03-T010: Integration tests for performance and concurrency
 *
 * Tests:
 * - Concurrent container creation and management
 * - Circuit breaker behavior under load
 * - Health monitoring of multiple containers
 * - Resource cleanup under stress
 */

import { ContainerManager } from '../../docker/ContainerManager';
import { ContainerConfig, ContainerSession } from '../../docker/types';
import { dockerCircuitBreaker, CircuitBreakerState } from '../../docker/circuitBreaker';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { randomBytes } from 'crypto';

// Skip tests if Docker is not available
const isDockerAvailable = async (): Promise<boolean> => {
  try {
    const manager = ContainerManager.getInstance();
    return await manager.healthCheck();
  } catch (error) {
    return false;
  }
};

describe('Docker Performance Integration Tests', () => {
  let manager: ContainerManager;
  const createdSessions: string[] = [];
  const testWorkspaces: string[] = [];

  beforeAll(async () => {
    const dockerAvailable = await isDockerAvailable();
    if (!dockerAvailable) {
      console.warn('Docker daemon not available. Skipping performance integration tests.');
    }

    manager = ContainerManager.getInstance();

    // Pull alpine image if not exists
    try {
      const docker = manager.getDockerClient();
      await docker.pull('alpine:latest');
    } catch (error) {
      console.warn('Failed to pull alpine:latest. Tests may fail.');
    }
  }, 60000);

  afterEach(async () => {
    // Cleanup all test containers
    for (const sessionId of createdSessions) {
      try {
        await manager.stopSession(sessionId);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
    createdSessions.length = 0;

    // Remove test workspaces
    for (const workspace of testWorkspaces) {
      if (existsSync(workspace)) {
        rmSync(workspace, { recursive: true, force: true });
      }
    }
    testWorkspaces.length = 0;
  }, 60000);

  // Helper function to create test workspace
  const createTestWorkspace = (): string => {
    const randomId = randomBytes(8).toString('hex');
    const workspacePath = `/opt/dev/claude-studio-test-${randomId}`;
    mkdirSync(workspacePath, { recursive: true });
    testWorkspaces.push(workspacePath);
    return workspacePath;
  };

  describe('Concurrent Container Creation', () => {
    test('should create 10 containers concurrently', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const containerCount = 10;
      const promises: Promise<ContainerSession>[] = [];

      // Create 10 containers concurrently
      for (let i = 0; i < containerCount; i++) {
        const workspacePath = createTestWorkspace();
        const config: ContainerConfig = {
          projectName: `test-concurrent-${i}`,
          workspacePath,
          image: 'alpine:latest',
        };

        promises.push(manager.createSession(config));
      }

      // Wait for all containers to be created
      const sessions = await Promise.all(promises);

      // Track sessions for cleanup
      createdSessions.push(...sessions.map((s) => s.sessionId));

      // Verify all containers were created successfully
      expect(sessions.length).toBe(containerCount);
      sessions.forEach((session) => {
        expect(session.status).toBe('running');
        expect(session.containerId).toBeTruthy();
      });
    }, 120000);

    test('should handle mixed concurrent create and stop operations', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      // Create 5 containers first
      const initialSessions: ContainerSession[] = [];
      for (let i = 0; i < 5; i++) {
        const workspacePath = createTestWorkspace();
        const config: ContainerConfig = {
          projectName: `test-mixed-${i}`,
          workspacePath,
          image: 'alpine:latest',
        };
        const session = await manager.createSession(config);
        initialSessions.push(session);
        createdSessions.push(session.sessionId);
      }

      // Mix of create and stop operations
      const operations: Promise<void | ContainerSession>[] = [];

      // Stop 2 containers
      operations.push(manager.stopSession(initialSessions[0].sessionId));
      operations.push(manager.stopSession(initialSessions[1].sessionId));

      // Create 3 new containers
      for (let i = 0; i < 3; i++) {
        const workspacePath = createTestWorkspace();
        const config: ContainerConfig = {
          projectName: `test-mixed-new-${i}`,
          workspacePath,
          image: 'alpine:latest',
        };
        operations.push(manager.createSession(config));
      }

      // Wait for all operations
      const results = await Promise.all(operations);

      // Extract new sessions
      const newSessions = results.filter((r) => r && typeof r === 'object' && 'sessionId' in r) as ContainerSession[];
      createdSessions.push(...newSessions.map((s) => s.sessionId));

      expect(newSessions.length).toBe(3);
    }, 120000);
  });

  describe('Circuit Breaker Behavior', () => {
    test('should handle Docker daemon failures gracefully', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      // Reset circuit breaker before test
      dockerCircuitBreaker.manualReset();

      // Circuit breaker should start in CLOSED state
      expect(dockerCircuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);

      // Normal operation should work
      const healthy = await manager.healthCheck();
      expect(healthy).toBe(true);
      expect(dockerCircuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
    }, 30000);

    test('should track circuit breaker metrics', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      // Reset circuit breaker
      dockerCircuitBreaker.manualReset();

      // Get initial metrics
      const metrics = dockerCircuitBreaker.getMetrics();

      expect(metrics.state).toBe(CircuitBreakerState.CLOSED);
      expect(metrics.failureCount).toBe(0);
    }, 30000);
  });

  describe('Health Monitoring', () => {
    test('should monitor health of multiple containers', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      // Create 5 containers
      const sessions: ContainerSession[] = [];
      for (let i = 0; i < 5; i++) {
        const workspacePath = createTestWorkspace();
        const config: ContainerConfig = {
          projectName: `test-health-${i}`,
          workspacePath,
          image: 'alpine:latest',
        };
        const session = await manager.createSession(config);
        sessions.push(session);
        createdSessions.push(session.sessionId);
      }

      // Check health of all containers
      const healthChecks = await Promise.all(
        sessions.map((s) => manager.isContainerRunning(s.containerId))
      );

      // All should be running
      expect(healthChecks.every((h) => h === true)).toBe(true);
    }, 120000);

    test('should detect when multiple containers stop', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      // Create 3 containers
      const sessions: ContainerSession[] = [];
      for (let i = 0; i < 3; i++) {
        const workspacePath = createTestWorkspace();
        const config: ContainerConfig = {
          projectName: `test-stop-detect-${i}`,
          workspacePath,
          image: 'alpine:latest',
        };
        const session = await manager.createSession(config);
        sessions.push(session);
        createdSessions.push(session.sessionId);
      }

      // Stop 2 containers manually (simulate crash)
      const docker = manager.getDockerClient();
      await docker.getContainer(sessions[0].containerId).stop();
      await docker.getContainer(sessions[1].containerId).stop();

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Check health
      const health0 = await manager.isContainerRunning(sessions[0].containerId);
      const health1 = await manager.isContainerRunning(sessions[1].containerId);
      const health2 = await manager.isContainerRunning(sessions[2].containerId);

      expect(health0).toBe(false);
      expect(health1).toBe(false);
      expect(health2).toBe(true);
    }, 60000);
  });

  describe('Resource Cleanup', () => {
    test('should cleanup multiple containers efficiently', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      // Create 15 containers
      const sessions: ContainerSession[] = [];
      for (let i = 0; i < 15; i++) {
        const workspacePath = createTestWorkspace();
        const config: ContainerConfig = {
          projectName: `test-cleanup-${i}`,
          workspacePath,
          image: 'alpine:latest',
        };
        const session = await manager.createSession(config);
        sessions.push(session);
        createdSessions.push(session.sessionId);
      }

      // Cleanup all containers
      const cleanupPromises = sessions.map((s) => manager.stopSession(s.sessionId));
      await Promise.all(cleanupPromises);

      // Clear from tracking (already cleaned)
      createdSessions.length = 0;

      // Verify all containers are stopped
      const healthChecks = await Promise.all(
        sessions.map((s) => manager.isContainerRunning(s.containerId))
      );

      expect(healthChecks.every((h) => h === false)).toBe(true);
    }, 120000);

    test('should handle zombie container cleanup', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      // Create 5 containers
      for (let i = 0; i < 5; i++) {
        const workspacePath = createTestWorkspace();
        const config: ContainerConfig = {
          projectName: `test-zombie-${i}`,
          workspacePath,
          image: 'alpine:latest',
        };
        const session = await manager.createSession(config);
        createdSessions.push(session.sessionId);
      }

      // Run cleanup
      const cleanedCount = await manager.cleanupZombieContainers();

      // Should have cleaned up all test containers
      expect(cleanedCount).toBeGreaterThanOrEqual(5);

      // Clear tracking (already cleaned)
      createdSessions.length = 0;
    }, 120000);
  });

  describe('Session Management at Scale', () => {
    test('should list all active sessions', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const initialCount = manager.listSessions().length;

      // Create 10 containers
      for (let i = 0; i < 10; i++) {
        const workspacePath = createTestWorkspace();
        const config: ContainerConfig = {
          projectName: `test-list-${i}`,
          workspacePath,
          image: 'alpine:latest',
        };
        const session = await manager.createSession(config);
        createdSessions.push(session.sessionId);
      }

      const sessions = manager.listSessions();
      expect(sessions.length).toBe(initialCount + 10);
    }, 120000);

    test('should retrieve individual sessions efficiently', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      // Create 5 containers
      const sessions: ContainerSession[] = [];
      for (let i = 0; i < 5; i++) {
        const workspacePath = createTestWorkspace();
        const config: ContainerConfig = {
          projectName: `test-retrieve-${i}`,
          workspacePath,
          image: 'alpine:latest',
        };
        const session = await manager.createSession(config);
        sessions.push(session);
        createdSessions.push(session.sessionId);
      }

      // Retrieve each session
      const startTime = Date.now();
      for (const session of sessions) {
        const retrieved = manager.getSession(session.sessionId);
        expect(retrieved).toBeDefined();
        expect(retrieved!.sessionId).toBe(session.sessionId);
      }
      const endTime = Date.now();

      // Should be very fast (< 100ms for 5 retrievals)
      expect(endTime - startTime).toBeLessThan(100);
    }, 120000);
  });

  describe('Stream Operations Under Load', () => {
    test('should attach streams to multiple containers', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      // Create 5 containers
      const sessions: ContainerSession[] = [];
      for (let i = 0; i < 5; i++) {
        const workspacePath = createTestWorkspace();
        const config: ContainerConfig = {
          projectName: `test-streams-${i}`,
          workspacePath,
          image: 'alpine:latest',
        };
        const session = await manager.createSession(config);
        sessions.push(session);
        createdSessions.push(session.sessionId);
      }

      // Attach streams to all containers
      const streamPromises = sessions.map((s) =>
        manager.attachToContainerStreams(s.containerId)
      );
      const streams = await Promise.all(streamPromises);

      // Verify all streams attached
      expect(streams.length).toBe(5);
      streams.forEach((s) => {
        expect(s.stdin).toBeDefined();
        expect(s.stdout).toBeDefined();
        expect(s.stderr).toBeDefined();
      });
    }, 120000);
  });

  describe('Activity Tracking', () => {
    test('should track activity for multiple sessions', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      // Create 3 containers
      const sessions: ContainerSession[] = [];
      for (let i = 0; i < 3; i++) {
        const workspacePath = createTestWorkspace();
        const config: ContainerConfig = {
          projectName: `test-activity-${i}`,
          workspacePath,
          image: 'alpine:latest',
        };
        const session = await manager.createSession(config);
        sessions.push(session);
        createdSessions.push(session.sessionId);
      }

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Update activity for all sessions
      sessions.forEach((s) => manager.updateActivity(s.sessionId));

      // Verify activity was updated
      sessions.forEach((session) => {
        const updated = manager.getSession(session.sessionId);
        expect(updated).toBeDefined();
        expect(updated!.lastActivity.getTime()).toBeGreaterThan(session.lastActivity.getTime());
      });
    }, 60000);
  });

  describe('Error Recovery Under Load', () => {
    test('should recover from partial failures', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const operations: Promise<ContainerSession | null>[] = [];

      // Mix of valid and invalid operations
      for (let i = 0; i < 5; i++) {
        const workspacePath = createTestWorkspace();
        const config: ContainerConfig = {
          projectName: `test-recovery-${i}`,
          workspacePath,
          image: 'alpine:latest',
        };
        operations.push(
          manager.createSession(config).catch(() => null)
        );
      }

      // Add some invalid operations (should fail)
      operations.push(
        manager
          .createSession({
            projectName: 'invalid',
            workspacePath: '/invalid/path',
            image: 'alpine:latest',
          })
          .catch(() => null)
      );

      const results = await Promise.all(operations);

      // Filter successful sessions
      const successfulSessions = results.filter((r) => r !== null) as ContainerSession[];
      createdSessions.push(...successfulSessions.map((s) => s.sessionId));

      // Should have at least the valid containers
      expect(successfulSessions.length).toBeGreaterThanOrEqual(5);
    }, 120000);
  });

  describe('Performance Metrics', () => {
    test('should create containers within reasonable time', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const workspacePath = createTestWorkspace();
      const config: ContainerConfig = {
        projectName: 'test-performance',
        workspacePath,
        image: 'alpine:latest',
      };

      const startTime = Date.now();
      const session = await manager.createSession(config);
      const endTime = Date.now();

      createdSessions.push(session.sessionId);

      const duration = endTime - startTime;

      // Should create container in under 10 seconds
      expect(duration).toBeLessThan(10000);

      console.log(`Container creation took: ${duration}ms`);
    }, 30000);

    test('should stop containers within reasonable time', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const workspacePath = createTestWorkspace();
      const config: ContainerConfig = {
        projectName: 'test-stop-performance',
        workspacePath,
        image: 'alpine:latest',
      };

      const session = await manager.createSession(config);
      createdSessions.push(session.sessionId);

      const startTime = Date.now();
      await manager.stopSession(session.sessionId);
      const endTime = Date.now();

      const duration = endTime - startTime;

      // Should stop container in under 15 seconds (includes 10s grace period)
      expect(duration).toBeLessThan(15000);

      console.log(`Container stop took: ${duration}ms`);
    }, 30000);
  });
});

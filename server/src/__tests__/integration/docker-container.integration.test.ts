/**
 * Docker Container Integration Tests
 * P03-T010: Integration tests for Docker container functionality
 *
 * Tests interact with real Docker daemon (not mocked)
 * Requirements:
 * - Docker daemon running on /var/run/docker.sock
 * - alpine:latest image available
 */

import { ContainerManager } from '../../docker/ContainerManager';
import { ContainerConfig, ContainerSession } from '../../docker/types';
import {
  ContainerCreationError,
  ContainerNotFoundError,
  SessionNotFoundError,
  StreamAttachmentError,
} from '../../docker/errors';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'fs';
import { randomBytes } from 'crypto';
import { Readable } from 'stream';

// Skip tests if Docker is not available
const isDockerAvailable = async (): Promise<boolean> => {
  try {
    const manager = ContainerManager.getInstance();
    return await manager.healthCheck();
  } catch (error) {
    return false;
  }
};

describe('Docker Container Integration Tests', () => {
  let manager: ContainerManager;
  let testWorkspacePath: string;
  const createdSessions: string[] = [];

  beforeAll(async () => {
    const dockerAvailable = await isDockerAvailable();
    if (!dockerAvailable) {
      console.warn('Docker daemon not available. Skipping integration tests.');
    }

    manager = ContainerManager.getInstance();

    // Pull alpine image if not exists (lightweight test image)
    try {
      const docker = manager.getDockerClient();
      await docker.pull('alpine:latest');
    } catch (error) {
      console.warn('Failed to pull alpine:latest. Tests may fail.');
    }
  }, 60000);

  beforeEach(() => {
    // Create unique test workspace for each test
    const randomId = randomBytes(8).toString('hex');
    testWorkspacePath = `/opt/dev/claude-studio-test-${randomId}`;
    mkdirSync(testWorkspacePath, { recursive: true });
  });

  afterEach(async () => {
    // Cleanup test containers
    for (const sessionId of createdSessions) {
      try {
        await manager.stopSession(sessionId);
      } catch (error) {
        // Ignore errors during cleanup
      }
    }
    createdSessions.length = 0;

    // Remove test workspace
    if (existsSync(testWorkspacePath)) {
      rmSync(testWorkspacePath, { recursive: true, force: true });
    }
  }, 30000);

  describe('Container Lifecycle', () => {
    test('should create and start container', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const config: ContainerConfig = {
        projectName: 'test-project',
        workspacePath: testWorkspacePath,
        image: 'alpine:latest',
        env: { TEST_VAR: 'test_value' },
      };

      const session = await manager.createSession(config);
      createdSessions.push(session.sessionId);

      expect(session).toBeDefined();
      expect(session.sessionId).toMatch(/^session-/);
      expect(session.containerId).toBeTruthy();
      expect(session.status).toBe('running');
      expect(session.projectName).toBe('test-project');
      expect(session.workspacePath).toBe(testWorkspacePath);
    }, 30000);

    test('should stop and remove container', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const config: ContainerConfig = {
        projectName: 'test-stop',
        workspacePath: testWorkspacePath,
        image: 'alpine:latest',
      };

      const session = await manager.createSession(config);
      createdSessions.push(session.sessionId);

      expect(session.status).toBe('running');

      await manager.stopSession(session.sessionId);

      // Session should be removed from manager
      const retrievedSession = manager.getSession(session.sessionId);
      expect(retrievedSession).toBeUndefined();

      // Container should not be running
      const isRunning = await manager.isContainerRunning(session.containerId);
      expect(isRunning).toBe(false);
    }, 30000);

    test('should list active sessions', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const initialSessions = manager.listSessions();
      const initialCount = initialSessions.length;

      const config: ContainerConfig = {
        projectName: 'test-list',
        workspacePath: testWorkspacePath,
        image: 'alpine:latest',
      };

      const session = await manager.createSession(config);
      createdSessions.push(session.sessionId);

      const sessions = manager.listSessions();
      expect(sessions.length).toBe(initialCount + 1);
      expect(sessions.some((s) => s.sessionId === session.sessionId)).toBe(true);
    }, 30000);

    test('should update activity timestamp', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const config: ContainerConfig = {
        projectName: 'test-activity',
        workspacePath: testWorkspacePath,
        image: 'alpine:latest',
      };

      const session = await manager.createSession(config);
      createdSessions.push(session.sessionId);

      const initialActivity = session.lastActivity;

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 100));

      manager.updateActivity(session.sessionId);

      const updatedSession = manager.getSession(session.sessionId);
      expect(updatedSession).toBeDefined();
      expect(updatedSession!.lastActivity.getTime()).toBeGreaterThan(initialActivity.getTime());
    }, 30000);
  });

  describe('Container I/O Streams', () => {
    test('should attach to container stdin/stdout/stderr', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const config: ContainerConfig = {
        projectName: 'test-streams',
        workspacePath: testWorkspacePath,
        image: 'alpine:latest',
      };

      const session = await manager.createSession(config);
      createdSessions.push(session.sessionId);

      const streams = await manager.attachToContainerStreams(session.containerId);

      expect(streams).toBeDefined();
      expect(streams.stdin).toBeDefined();
      expect(streams.stdout).toBeDefined();
      expect(streams.stderr).toBeDefined();
    }, 30000);

    test('should write to container stdin', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const config: ContainerConfig = {
        projectName: 'test-stdin',
        workspacePath: testWorkspacePath,
        image: 'alpine:latest',
      };

      const session = await manager.createSession(config);
      createdSessions.push(session.sessionId);

      const streams = await manager.attachToContainerStreams(session.containerId);

      // Write to stdin (should not throw)
      expect(() => {
        manager.writeToContainerStdin(session.containerId, 'echo "test"\n', streams.stdin);
      }).not.toThrow();
    }, 30000);

    test('should write buffer to container stdin', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const config: ContainerConfig = {
        projectName: 'test-buffer',
        workspacePath: testWorkspacePath,
        image: 'alpine:latest',
      };

      const session = await manager.createSession(config);
      createdSessions.push(session.sessionId);

      const streams = await manager.attachToContainerStreams(session.containerId);

      const buffer = Buffer.from('test data\n', 'utf-8');

      // Write buffer to stdin (should not throw)
      expect(() => {
        manager.writeBufferToContainerStdin(session.containerId, buffer, streams.stdin);
      }).not.toThrow();
    }, 30000);

    test('should fail to attach to non-running container', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const config: ContainerConfig = {
        projectName: 'test-attach-stopped',
        workspacePath: testWorkspacePath,
        image: 'alpine:latest',
      };

      const session = await manager.createSession(config);
      const containerId = session.containerId;
      createdSessions.push(session.sessionId);

      // Stop container
      await manager.stopSession(session.sessionId);

      // Try to attach (should fail)
      await expect(
        manager.attachToContainerStreams(containerId)
      ).rejects.toThrow(ContainerNotFoundError);
    }, 30000);
  });

  describe('Session Re-attachment', () => {
    test('should retrieve existing session', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const config: ContainerConfig = {
        projectName: 'test-reattach',
        workspacePath: testWorkspacePath,
        image: 'alpine:latest',
      };

      const session = await manager.createSession(config);
      createdSessions.push(session.sessionId);

      // Retrieve session
      const retrievedSession = manager.getSession(session.sessionId);

      expect(retrievedSession).toBeDefined();
      expect(retrievedSession!.sessionId).toBe(session.sessionId);
      expect(retrievedSession!.containerId).toBe(session.containerId);
      expect(retrievedSession!.status).toBe('running');
    }, 30000);

    test('should verify container is still running', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const config: ContainerConfig = {
        projectName: 'test-running-check',
        workspacePath: testWorkspacePath,
        image: 'alpine:latest',
      };

      const session = await manager.createSession(config);
      createdSessions.push(session.sessionId);

      const isRunning = await manager.isContainerRunning(session.containerId);
      expect(isRunning).toBe(true);
    }, 30000);
  });

  describe('Error Scenarios', () => {
    test('should throw error for invalid image', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const config: ContainerConfig = {
        projectName: 'test-invalid-image',
        workspacePath: testWorkspacePath,
        image: 'nonexistent-image-xyz:latest',
      };

      await expect(manager.createSession(config)).rejects.toThrow(ContainerCreationError);
    }, 30000);

    test('should throw error for invalid workspace path', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const config: ContainerConfig = {
        projectName: 'test-invalid-path',
        workspacePath: 'relative/path', // Must be absolute
        image: 'alpine:latest',
      };

      await expect(manager.createSession(config)).rejects.toThrow();
    }, 30000);

    test('should throw error for path outside allowed directories', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const config: ContainerConfig = {
        projectName: 'test-forbidden-path',
        workspacePath: '/tmp/test', // Not in /opt/dev or /opt/prod
        image: 'alpine:latest',
      };

      await expect(manager.createSession(config)).rejects.toThrow();
    }, 30000);

    test('should throw error when stopping non-existent session', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      await expect(manager.stopSession('session-nonexistent')).rejects.toThrow(SessionNotFoundError);
    }, 30000);

    test('should return false for non-existent container', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const isRunning = await manager.isContainerRunning('nonexistent-container-id');
      expect(isRunning).toBe(false);
    }, 30000);
  });

  describe('Zombie Container Cleanup', () => {
    test('should cleanup leftover containers', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      // Create some containers
      const config: ContainerConfig = {
        projectName: 'test-zombie',
        workspacePath: testWorkspacePath,
        image: 'alpine:latest',
      };

      const session1 = await manager.createSession(config);
      const session2 = await manager.createSession(config);

      createdSessions.push(session1.sessionId, session2.sessionId);

      // Cleanup
      const cleanedUp = await manager.cleanupZombieContainers();

      expect(cleanedUp).toBeGreaterThanOrEqual(2);

      // Clear createdSessions since they're already cleaned
      createdSessions.length = 0;
    }, 60000);
  });

  describe('Health Monitoring', () => {
    test('should perform health check', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const healthy = await manager.healthCheck();
      expect(healthy).toBe(true);
    }, 30000);

    test('should detect crashed container', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const config: ContainerConfig = {
        projectName: 'test-crash',
        workspacePath: testWorkspacePath,
        image: 'alpine:latest',
      };

      const session = await manager.createSession(config);
      createdSessions.push(session.sessionId);

      // Manually stop container (simulate crash)
      const docker = manager.getDockerClient();
      const container = docker.getContainer(session.containerId);
      await container.stop();

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check if container is running
      const isRunning = await manager.isContainerRunning(session.containerId);
      expect(isRunning).toBe(false);
    }, 30000);
  });

  describe('Workspace Mounting', () => {
    test('should mount workspace directory', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      // Create a test file in workspace
      const testFilePath = `${testWorkspacePath}/test.txt`;
      writeFileSync(testFilePath, 'test content', 'utf-8');

      const config: ContainerConfig = {
        projectName: 'test-mount',
        workspacePath: testWorkspacePath,
        image: 'alpine:latest',
      };

      const session = await manager.createSession(config);
      createdSessions.push(session.sessionId);

      // Verify container was created with workspace mount
      const docker = manager.getDockerClient();
      const container = docker.getContainer(session.containerId);
      const info = await container.inspect();

      const mounts = info.Mounts || [];
      const workspaceMount = mounts.find((m) => m.Destination === '/workspace');

      expect(workspaceMount).toBeDefined();
      expect(workspaceMount!.Source).toBe(testWorkspacePath);
    }, 30000);
  });

  describe('Environment Variables', () => {
    test('should pass environment variables to container', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const config: ContainerConfig = {
        projectName: 'test-env',
        workspacePath: testWorkspacePath,
        image: 'alpine:latest',
        env: {
          TEST_VAR_1: 'value1',
          TEST_VAR_2: 'value2',
        },
      };

      const session = await manager.createSession(config);
      createdSessions.push(session.sessionId);

      // Verify environment variables
      const docker = manager.getDockerClient();
      const container = docker.getContainer(session.containerId);
      const info = await container.inspect();

      const env = info.Config.Env || [];
      expect(env).toContain('TEST_VAR_1=value1');
      expect(env).toContain('TEST_VAR_2=value2');
    }, 30000);
  });

  describe('Container Labeling', () => {
    test('should add claude-studio labels to container', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const config: ContainerConfig = {
        projectName: 'test-labels',
        workspacePath: testWorkspacePath,
        image: 'alpine:latest',
      };

      const session = await manager.createSession(config);
      createdSessions.push(session.sessionId);

      // Verify labels
      const docker = manager.getDockerClient();
      const container = docker.getContainer(session.containerId);
      const info = await container.inspect();

      const labels = info.Config.Labels || {};
      expect(labels['claude-studio.session-id']).toBe(session.sessionId);
      expect(labels['claude-studio.project']).toBe('test-labels');
      expect(labels['claude-studio.managed']).toBe('true');
    }, 30000);
  });
});

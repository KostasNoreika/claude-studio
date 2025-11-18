/**
 * Docker Socket Proxy Security Integration Tests
 *
 * Tests that validate Docker socket proxy correctly restricts dangerous operations
 * while allowing safe container lifecycle management.
 *
 * These tests verify:
 * 1. ContainerManager connects to proxy via TCP (not direct socket)
 * 2. Allowed operations (container create/start/stop/list) work correctly
 * 3. Denied operations (volume/network/exec/build) fail appropriately
 * 4. Security boundaries are enforced
 * 5. Error handling for blocked operations
 *
 * Environment Requirements:
 * - DOCKER_HOST=tcp://docker-proxy:2375 (production mode)
 * - docker-proxy container running with correct restrictions
 *
 * @group integration
 * @group security
 * @group docker-proxy
 */

import { ContainerManager } from '../../docker/ContainerManager';
import { ContainerConfig } from '../../docker/types';
import Docker from 'dockerode';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { randomBytes } from 'crypto';
import { Readable } from 'stream';

// Check if we're running with Docker proxy (TCP connection)
const isDockerProxy = (): boolean => {
  const dockerHost = process.env.DOCKER_HOST || '';
  return dockerHost.startsWith('tcp://');
};

// Check if Docker is available
const isDockerAvailable = async (): Promise<boolean> => {
  try {
    const manager = ContainerManager.getInstance();
    return await manager.healthCheck();
  } catch {
    return false;
  }
};

describe('Docker Socket Proxy Security Integration Tests', () => {
  let manager: ContainerManager;
  let dockerClient: Docker;
  let testWorkspacePath: string;
  const createdSessions: string[] = [];
  const createdContainers: string[] = [];

  beforeAll(async () => {
    const dockerAvailable = await isDockerAvailable();
    if (!dockerAvailable) {
      console.warn('Docker daemon not available. Skipping Docker proxy security tests.');
      return;
    }

    manager = ContainerManager.getInstance();
    dockerClient = manager.getDockerClient();

    // Pull alpine image if needed
    try {
      await dockerClient.pull('alpine:latest');
    } catch {
      console.warn('Failed to pull alpine:latest. Tests may fail.');
    }
  }, 60000);

  beforeEach(() => {
    // Create unique test workspace
    const randomId = randomBytes(8).toString('hex');
    testWorkspacePath = `/opt/dev/claude-studio-test-proxy-${randomId}`;
    mkdirSync(testWorkspacePath, { recursive: true });
  });

  afterEach(async () => {
    // Cleanup test containers
    for (const sessionId of createdSessions) {
      try {
        await manager.stopSession(sessionId);
      } catch {
        // Ignore cleanup errors
      }
    }
    createdSessions.length = 0;

    // Cleanup any manually created containers
    for (const containerId of createdContainers) {
      try {
        const container = dockerClient.getContainer(containerId);
        await container.stop({ t: 5 });
        await container.remove({ force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
    createdContainers.length = 0;

    // Remove test workspace
    if (existsSync(testWorkspacePath)) {
      rmSync(testWorkspacePath, { recursive: true, force: true });
    }
  }, 30000);

  describe('Connection Mode Verification', () => {
    test('should connect via TCP when DOCKER_HOST is set to proxy', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const dockerHost = process.env.DOCKER_HOST;

      if (isDockerProxy()) {
        expect(dockerHost).toMatch(/^tcp:\/\//);
        expect(dockerHost).toContain('docker-proxy');
        expect(dockerHost).toContain('2375');
      } else {
        console.warn('Not running with Docker proxy. Set DOCKER_HOST=tcp://docker-proxy:2375');
      }
    });

    test('should successfully ping Docker daemon through proxy', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const healthy = await manager.healthCheck();
      expect(healthy).toBe(true);
    });
  });

  describe('Allowed Operations (Should Succeed)', () => {
    test('should successfully create container through proxy', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const config: ContainerConfig = {
        projectName: 'test-proxy-create',
        workspacePath: testWorkspacePath,
        image: 'alpine:latest',
      };

      const session = await manager.createSession(config);
      createdSessions.push(session.sessionId);

      expect(session.containerId).toBeDefined();
      expect(session.status).toBe('running');
    }, 30000);

    test('should successfully list containers through proxy', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const containers = await dockerClient.listContainers({ all: true });
      expect(Array.isArray(containers)).toBe(true);
    });

    test('should successfully list images through proxy', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const images = await dockerClient.listImages();
      expect(Array.isArray(images)).toBe(true);
      expect(images.length).toBeGreaterThan(0);
    });

    test('should successfully inspect container through proxy', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const config: ContainerConfig = {
        projectName: 'test-proxy-inspect',
        workspacePath: testWorkspacePath,
        image: 'alpine:latest',
      };

      const session = await manager.createSession(config);
      createdSessions.push(session.sessionId);

      const container = dockerClient.getContainer(session.containerId);
      const info = await container.inspect();

      expect(info.Id).toBe(session.containerId);
      expect(info.State.Running).toBe(true);
    }, 30000);

    test('should successfully stop and remove container through proxy', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const config: ContainerConfig = {
        projectName: 'test-proxy-stop',
        workspacePath: testWorkspacePath,
        image: 'alpine:latest',
      };

      const session = await manager.createSession(config);
      const containerId = session.containerId;
      createdSessions.push(session.sessionId);

      // Stop session (which stops and removes container)
      await manager.stopSession(session.sessionId);

      // Verify container is removed
      const container = dockerClient.getContainer(containerId);
      await expect(container.inspect()).rejects.toThrow();
    }, 30000);

    test('should get Docker system info through proxy', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const info = await dockerClient.info();
      expect(info.Name).toBeDefined();
      expect(info.ServerVersion).toBeDefined();
    });

    test('should get Docker version through proxy', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const version = await dockerClient.version();
      expect(version.Version).toBeDefined();
    });
  });

  describe('Denied Operations (Should Fail)', () => {
    test('should block volume listing when VOLUMES=0', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      // Skip if not using proxy
      if (!isDockerProxy()) {
        console.warn('Skipping: Not using Docker proxy');
        return;
      }

      await expect(dockerClient.listVolumes()).rejects.toThrow();
    });

    test('should block volume creation when VOLUMES=0', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      if (!isDockerProxy()) {
        console.warn('Skipping: Not using Docker proxy');
        return;
      }

      await expect(
        dockerClient.createVolume({ Name: 'test-blocked-volume' })
      ).rejects.toThrow();
    });

    test('should block network listing when NETWORKS=0', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      if (!isDockerProxy()) {
        console.warn('Skipping: Not using Docker proxy');
        return;
      }

      await expect(dockerClient.listNetworks()).rejects.toThrow();
    });

    test('should block network creation when NETWORKS=0', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      if (!isDockerProxy()) {
        console.warn('Skipping: Not using Docker proxy');
        return;
      }

      await expect(
        dockerClient.createNetwork({ Name: 'test-blocked-network' })
      ).rejects.toThrow();
    });

    test('should block image build when BUILD=0', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      if (!isDockerProxy()) {
        console.warn('Skipping: Not using Docker proxy');
        return;
      }

      // Create a minimal tar stream for build context
      const tarStream = new Readable();
      tarStream.push('FROM alpine\n');
      tarStream.push(null);

      await expect(
        dockerClient.buildImage(tarStream, { t: 'test-blocked-build' })
      ).rejects.toThrow();
    });

    test('should handle exec denial gracefully when EXEC=0', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      if (!isDockerProxy()) {
        console.warn('Skipping: Not using Docker proxy');
        return;
      }

      // Create a container first
      const config: ContainerConfig = {
        projectName: 'test-proxy-exec-block',
        workspacePath: testWorkspacePath,
        image: 'alpine:latest',
      };

      const session = await manager.createSession(config);
      createdSessions.push(session.sessionId);

      const container = dockerClient.getContainer(session.containerId);

      // Attempt to create exec - should be blocked
      await expect(
        container.exec({
          Cmd: ['/bin/sh', '-c', 'echo test'],
          AttachStdout: true,
        })
      ).rejects.toThrow();
    }, 30000);
  });

  describe('Security Boundary Validation', () => {
    test('should prevent privileged container creation', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      if (!isDockerProxy()) {
        console.warn('Skipping: Not using Docker proxy');
        return;
      }

      // Attempt to create privileged container
      const createPromise = dockerClient.createContainer({
        Image: 'alpine:latest',
        HostConfig: {
          Privileged: true,
        },
        Cmd: ['sleep', '10'],
      });

      // Should either fail or strip privileged flag
      try {
        const container = await createPromise;
        createdContainers.push(container.id);

        // If creation succeeded, verify privileged flag was stripped
        const info = await container.inspect();
        expect(info.HostConfig.Privileged).toBe(false);
      } catch {
        // Creation blocked - this is also acceptable
        expect(error).toBeDefined();
      }
    }, 30000);

    test('should prevent host network mode', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      if (!isDockerProxy()) {
        console.warn('Skipping: Not using Docker proxy');
        return;
      }

      const createPromise = dockerClient.createContainer({
        Image: 'alpine:latest',
        HostConfig: {
          NetworkMode: 'host',
        },
        Cmd: ['sleep', '10'],
      });

      try {
        const container = await createPromise;
        createdContainers.push(container.id);

        // If creation succeeded, verify network mode was changed
        const info = await container.inspect();
        expect(info.HostConfig.NetworkMode).not.toBe('host');
      } catch {
        // Creation blocked - acceptable
        expect(error).toBeDefined();
      }
    }, 30000);

    test('should prevent Docker socket mount', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      if (!isDockerProxy()) {
        console.warn('Skipping: Not using Docker proxy');
        return;
      }

      const createPromise = dockerClient.createContainer({
        Image: 'alpine:latest',
        HostConfig: {
          Binds: ['/var/run/docker.sock:/var/run/docker.sock:rw'],
        },
        Cmd: ['sleep', '10'],
      });

      try {
        const container = await createPromise;
        createdContainers.push(container.id);

        // If creation succeeded, verify socket mount was stripped
        const info = await container.inspect();
        const binds = info.HostConfig.Binds || [];
        const hasSocketMount = binds.some((bind: string) =>
          bind.includes('/var/run/docker.sock')
        );
        expect(hasSocketMount).toBe(false);
      } catch {
        // Creation blocked - acceptable
        expect(error).toBeDefined();
      }
    }, 30000);

    test('should prevent host PID namespace access', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      if (!isDockerProxy()) {
        console.warn('Skipping: Not using Docker proxy');
        return;
      }

      const createPromise = dockerClient.createContainer({
        Image: 'alpine:latest',
        HostConfig: {
          PidMode: 'host',
        },
        Cmd: ['sleep', '10'],
      });

      try {
        const container = await createPromise;
        createdContainers.push(container.id);

        // If creation succeeded, verify PID mode was changed
        const info = await container.inspect();
        expect(info.HostConfig.PidMode).not.toBe('host');
      } catch {
        // Creation blocked - acceptable
        expect(error).toBeDefined();
      }
    }, 30000);
  });

  describe('Error Handling for Blocked Operations', () => {
    test('should provide clear error messages for blocked volume operations', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      if (!isDockerProxy()) {
        console.warn('Skipping: Not using Docker proxy');
        return;
      }

      try {
        await dockerClient.listVolumes();
        fail('Should have thrown error for blocked volume operation');
      } catch {
        expect(error).toBeDefined();
        // Error should indicate operation is forbidden/blocked
        const errorMessage = error instanceof Error ? error.message : String(error);
        expect(
          errorMessage.toLowerCase().includes('forbidden') ||
          errorMessage.toLowerCase().includes('not allowed') ||
          errorMessage.toLowerCase().includes('blocked') ||
          errorMessage.includes('403')
        ).toBe(true);
      }
    });

    test('should provide clear error messages for blocked network operations', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      if (!isDockerProxy()) {
        console.warn('Skipping: Not using Docker proxy');
        return;
      }

      try {
        await dockerClient.listNetworks();
        fail('Should have thrown error for blocked network operation');
      } catch {
        expect(error).toBeDefined();
        const errorMessage = error instanceof Error ? error.message : String(error);
        expect(
          errorMessage.toLowerCase().includes('forbidden') ||
          errorMessage.toLowerCase().includes('not allowed') ||
          errorMessage.toLowerCase().includes('blocked') ||
          errorMessage.includes('403')
        ).toBe(true);
      }
    });
  });

  describe('ContainerManager Integration', () => {
    test('should work correctly with proxy for normal container lifecycle', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const config: ContainerConfig = {
        projectName: 'test-proxy-lifecycle',
        workspacePath: testWorkspacePath,
        image: 'alpine:latest',
      };

      // Create session
      const session = await manager.createSession(config);
      createdSessions.push(session.sessionId);
      expect(session.status).toBe('running');

      // Verify container is running
      const isRunning = await manager.isContainerRunning(session.containerId);
      expect(isRunning).toBe(true);

      // Update activity
      manager.updateActivity(session.sessionId);
      const updatedSession = manager.getSession(session.sessionId);
      expect(updatedSession?.lastActivity.getTime()).toBeGreaterThan(
        session.createdAt.getTime()
      );

      // Stop session
      await manager.stopSession(session.sessionId);

      // Verify container is stopped and removed
      const isStillRunning = await manager.isContainerRunning(session.containerId);
      expect(isStillRunning).toBe(false);
    }, 30000);

    test('should enforce security defaults even through proxy', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const config: ContainerConfig = {
        projectName: 'test-proxy-security',
        workspacePath: testWorkspacePath,
        image: 'alpine:latest',
      };

      const session = await manager.createSession(config);
      createdSessions.push(session.sessionId);

      // Inspect container to verify security settings
      const container = dockerClient.getContainer(session.containerId);
      const info = await container.inspect();

      // Verify security defaults are applied
      expect(info.HostConfig.ReadonlyRootfs).toBe(true);
      expect(info.HostConfig.Privileged).toBe(false);
      expect(info.Config.User).toBe('1000:1000');
      expect(info.HostConfig.CapDrop).toContain('ALL');
      expect(info.HostConfig.SecurityOpt).toContain('no-new-privileges');
    }, 30000);
  });
});

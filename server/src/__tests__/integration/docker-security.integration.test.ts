/**
 * Docker Security Integration Tests
 * P03-T010: Integration tests for Docker security constraints
 *
 * Tests enforce security policies with real containers:
 * - Memory limits
 * - CPU limits
 * - Read-only filesystem
 * - Dropped capabilities
 * - Non-root user execution
 */

import { ContainerManager } from '../../docker/ContainerManager';
import { ContainerConfig } from '../../docker/types';
import { CONTAINER_SECURITY_DEFAULTS } from '../../docker/types';
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

describe('Docker Security Integration Tests', () => {
  let manager: ContainerManager;
  let testWorkspacePath: string;
  const createdSessions: string[] = [];

  beforeAll(async () => {
    const dockerAvailable = await isDockerAvailable();
    if (!dockerAvailable) {
      console.warn('Docker daemon not available. Skipping security integration tests.');
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

  beforeEach(() => {
    // Create unique test workspace
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
        // Ignore cleanup errors
      }
    }
    createdSessions.length = 0;

    // Remove test workspace
    if (existsSync(testWorkspacePath)) {
      rmSync(testWorkspacePath, { recursive: true, force: true });
    }
  }, 30000);

  describe('Memory Limits', () => {
    test('should enforce default memory limit (1GB)', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const config: ContainerConfig = {
        projectName: 'test-memory-default',
        workspacePath: testWorkspacePath,
        image: 'alpine:latest',
      };

      const session = await manager.createSession(config);
      createdSessions.push(session.sessionId);

      // Verify memory limit
      const docker = manager.getDockerClient();
      const container = docker.getContainer(session.containerId);
      const info = await container.inspect();

      expect(info.HostConfig.Memory).toBe(CONTAINER_SECURITY_DEFAULTS.Memory);
      expect(info.HostConfig.Memory).toBe(1073741824); // 1GB
    }, 30000);

    test('should enforce custom memory limit', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const customMemoryLimit = 536870912; // 512MB

      const config: ContainerConfig = {
        projectName: 'test-memory-custom',
        workspacePath: testWorkspacePath,
        image: 'alpine:latest',
        securityOptions: {
          memoryLimit: customMemoryLimit,
        },
      };

      const session = await manager.createSession(config);
      createdSessions.push(session.sessionId);

      // Verify memory limit
      const docker = manager.getDockerClient();
      const container = docker.getContainer(session.containerId);
      const info = await container.inspect();

      expect(info.HostConfig.Memory).toBe(customMemoryLimit);
    }, 30000);
  });

  describe('CPU Limits', () => {
    test('should enforce default CPU shares (512)', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const config: ContainerConfig = {
        projectName: 'test-cpu-default',
        workspacePath: testWorkspacePath,
        image: 'alpine:latest',
      };

      const session = await manager.createSession(config);
      createdSessions.push(session.sessionId);

      // Verify CPU shares
      const docker = manager.getDockerClient();
      const container = docker.getContainer(session.containerId);
      const info = await container.inspect();

      expect(info.HostConfig.CpuShares).toBe(CONTAINER_SECURITY_DEFAULTS.CpuShares);
      expect(info.HostConfig.CpuShares).toBe(512);
    }, 30000);

    test('should enforce custom CPU shares', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const customCpuShares = 256;

      const config: ContainerConfig = {
        projectName: 'test-cpu-custom',
        workspacePath: testWorkspacePath,
        image: 'alpine:latest',
        securityOptions: {
          cpuShares: customCpuShares,
        },
      };

      const session = await manager.createSession(config);
      createdSessions.push(session.sessionId);

      // Verify CPU shares
      const docker = manager.getDockerClient();
      const container = docker.getContainer(session.containerId);
      const info = await container.inspect();

      expect(info.HostConfig.CpuShares).toBe(customCpuShares);
    }, 30000);
  });

  describe('Read-only Filesystem', () => {
    test('should enforce read-only root filesystem by default', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const config: ContainerConfig = {
        projectName: 'test-readonly-default',
        workspacePath: testWorkspacePath,
        image: 'alpine:latest',
      };

      const session = await manager.createSession(config);
      createdSessions.push(session.sessionId);

      // Verify read-only filesystem
      const docker = manager.getDockerClient();
      const container = docker.getContainer(session.containerId);
      const info = await container.inspect();

      expect(info.HostConfig.ReadonlyRootfs).toBe(true);
    }, 30000);

    test('should allow disabling read-only filesystem if specified', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const config: ContainerConfig = {
        projectName: 'test-readonly-disabled',
        workspacePath: testWorkspacePath,
        image: 'alpine:latest',
        securityOptions: {
          readonlyRootfs: false,
        },
      };

      const session = await manager.createSession(config);
      createdSessions.push(session.sessionId);

      // Verify read-only filesystem is disabled
      const docker = manager.getDockerClient();
      const container = docker.getContainer(session.containerId);
      const info = await container.inspect();

      expect(info.HostConfig.ReadonlyRootfs).toBe(false);
    }, 30000);
  });

  describe('Non-root User', () => {
    test('should run as non-root user (1000:1000)', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const config: ContainerConfig = {
        projectName: 'test-nonroot',
        workspacePath: testWorkspacePath,
        image: 'alpine:latest',
      };

      const session = await manager.createSession(config);
      createdSessions.push(session.sessionId);

      // Verify user
      const docker = manager.getDockerClient();
      const container = docker.getContainer(session.containerId);
      const info = await container.inspect();

      expect(info.Config.User).toBe(CONTAINER_SECURITY_DEFAULTS.User);
      expect(info.Config.User).toBe('1000:1000');
    }, 30000);
  });

  describe('Capability Controls', () => {
    test('should drop all capabilities and add minimal ones', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const config: ContainerConfig = {
        projectName: 'test-capabilities',
        workspacePath: testWorkspacePath,
        image: 'alpine:latest',
      };

      const session = await manager.createSession(config);
      createdSessions.push(session.sessionId);

      // Verify capability controls
      const docker = manager.getDockerClient();
      const container = docker.getContainer(session.containerId);
      const info = await container.inspect();

      expect(info.HostConfig.CapDrop).toEqual(CONTAINER_SECURITY_DEFAULTS.CapDrop);
      expect(info.HostConfig.CapDrop).toContain('ALL');

      expect(info.HostConfig.CapAdd).toEqual(CONTAINER_SECURITY_DEFAULTS.CapAdd);
      expect(info.HostConfig.CapAdd).toContain('CHOWN');
      expect(info.HostConfig.CapAdd).toContain('DAC_OVERRIDE');
    }, 30000);
  });

  describe('Network Isolation', () => {
    test('should use bridge network mode', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const config: ContainerConfig = {
        projectName: 'test-network',
        workspacePath: testWorkspacePath,
        image: 'alpine:latest',
      };

      const session = await manager.createSession(config);
      createdSessions.push(session.sessionId);

      // Verify network mode
      const docker = manager.getDockerClient();
      const container = docker.getContainer(session.containerId);
      const info = await container.inspect();

      expect(info.HostConfig.NetworkMode).toBe(CONTAINER_SECURITY_DEFAULTS.NetworkMode);
      expect(info.HostConfig.NetworkMode).toBe('bridge');
    }, 30000);
  });

  describe('Privileged Mode', () => {
    test('should NOT run in privileged mode', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const config: ContainerConfig = {
        projectName: 'test-privileged',
        workspacePath: testWorkspacePath,
        image: 'alpine:latest',
      };

      const session = await manager.createSession(config);
      createdSessions.push(session.sessionId);

      // Verify not privileged
      const docker = manager.getDockerClient();
      const container = docker.getContainer(session.containerId);
      const info = await container.inspect();

      expect(info.HostConfig.Privileged).toBe(false);
    }, 30000);
  });

  describe('Security Options', () => {
    test('should apply no-new-privileges security option', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const config: ContainerConfig = {
        projectName: 'test-security-opts',
        workspacePath: testWorkspacePath,
        image: 'alpine:latest',
      };

      const session = await manager.createSession(config);
      createdSessions.push(session.sessionId);

      // Verify security options
      const docker = manager.getDockerClient();
      const container = docker.getContainer(session.containerId);
      const info = await container.inspect();

      expect(info.HostConfig.SecurityOpt).toEqual(CONTAINER_SECURITY_DEFAULTS.SecurityOpt);
      expect(info.HostConfig.SecurityOpt).toContain('no-new-privileges');
    }, 30000);
  });

  describe('Auto-remove', () => {
    test('should auto-remove container on stop', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const config: ContainerConfig = {
        projectName: 'test-autoremove',
        workspacePath: testWorkspacePath,
        image: 'alpine:latest',
      };

      const session = await manager.createSession(config);
      const containerId = session.containerId;
      createdSessions.push(session.sessionId);

      // Verify auto-remove is enabled
      const docker = manager.getDockerClient();
      const container = docker.getContainer(session.containerId);
      const info = await container.inspect();

      expect(info.HostConfig.AutoRemove).toBe(true);

      // Stop container
      await manager.stopSession(session.sessionId);

      // Verify container is removed (should throw)
      await expect(async () => {
        const removedContainer = docker.getContainer(containerId);
        await removedContainer.inspect();
      }).rejects.toThrow();
    }, 30000);
  });

  describe('Workspace Bind Mount', () => {
    test('should only mount workspace directory', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const config: ContainerConfig = {
        projectName: 'test-binds',
        workspacePath: testWorkspacePath,
        image: 'alpine:latest',
      };

      const session = await manager.createSession(config);
      createdSessions.push(session.sessionId);

      // Verify only workspace is mounted
      const docker = manager.getDockerClient();
      const container = docker.getContainer(session.containerId);
      const info = await container.inspect();

      const binds = info.HostConfig.Binds || [];
      expect(binds.length).toBe(1);
      expect(binds[0]).toBe(`${testWorkspacePath}:/workspace`);
    }, 30000);
  });

  describe('Working Directory', () => {
    test('should set working directory to /workspace', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const config: ContainerConfig = {
        projectName: 'test-workdir',
        workspacePath: testWorkspacePath,
        image: 'alpine:latest',
      };

      const session = await manager.createSession(config);
      createdSessions.push(session.sessionId);

      // Verify working directory
      const docker = manager.getDockerClient();
      const container = docker.getContainer(session.containerId);
      const info = await container.inspect();

      expect(info.Config.WorkingDir).toBe('/workspace');
    }, 30000);
  });

  describe('Combined Security Constraints', () => {
    test('should enforce all security constraints together', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const config: ContainerConfig = {
        projectName: 'test-all-security',
        workspacePath: testWorkspacePath,
        image: 'alpine:latest',
      };

      const session = await manager.createSession(config);
      createdSessions.push(session.sessionId);

      // Verify all security constraints
      const docker = manager.getDockerClient();
      const container = docker.getContainer(session.containerId);
      const info = await container.inspect();

      // User
      expect(info.Config.User).toBe('1000:1000');

      // Memory & CPU
      expect(info.HostConfig.Memory).toBe(1073741824);
      expect(info.HostConfig.CpuShares).toBe(512);

      // Filesystem
      expect(info.HostConfig.ReadonlyRootfs).toBe(true);

      // Capabilities
      expect(info.HostConfig.CapDrop).toContain('ALL');
      expect(info.HostConfig.CapAdd).toEqual(['CHOWN', 'DAC_OVERRIDE']);

      // Network
      expect(info.HostConfig.NetworkMode).toBe('bridge');

      // Privileged
      expect(info.HostConfig.Privileged).toBe(false);

      // Security options
      expect(info.HostConfig.SecurityOpt).toContain('no-new-privileges');

      // Auto-remove
      expect(info.HostConfig.AutoRemove).toBe(true);

      // Working directory
      expect(info.Config.WorkingDir).toBe('/workspace');

      // Mounts (only workspace)
      const binds = info.HostConfig.Binds || [];
      expect(binds.length).toBe(1);
    }, 30000);
  });
});

/**
 * Security Tests for Claude CLI Container Isolation - P04-T006
 *
 * Tests verify that Claude CLI containers are properly isolated:
 * - Cannot escape container boundaries
 * - Filesystem restrictions enforced
 * - Capability dropping effective
 * - Security constraints prevent privilege escalation
 */

import { ContainerManager } from '../../docker/ContainerManager';
import { ContainerConfig } from '../../docker/types';
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

describe('Claude CLI Container Isolation Security Tests', () => {
  let manager: ContainerManager;
  let testWorkspacePath: string;
  const createdSessions: string[] = [];

  beforeAll(async () => {
    const dockerAvailable = await isDockerAvailable();
    if (!dockerAvailable) {
      console.warn('Docker daemon not available. Skipping Claude CLI security tests.');
    }

    manager = ContainerManager.getInstance();
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

  describe('Container Escape Prevention', () => {
    test('should NOT allow access to host filesystem outside workspace', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const config: ContainerConfig = {
        projectName: 'test-escape-prevention',
        workspacePath: testWorkspacePath,
        image: 'claude-studio-terminal:latest',
      };

      const session = await manager.createSession(config);
      createdSessions.push(session.sessionId);

      // Try to execute command that accesses host filesystem
      const docker = manager.getDockerClient();
      const container = docker.getContainer(session.containerId);

      // Attempt to read /etc/passwd from host (should fail or show container's own)
      const exec = await container.exec({
        Cmd: ['cat', '/etc/passwd'],
        AttachStdout: true,
        AttachStderr: true,
      });

      const stream = await exec.start({ Detach: false });
      let output = '';

      await new Promise<void>((resolve) => {
        stream.on('data', (chunk: Buffer) => {
          output += chunk.toString();
        });
        stream.on('end', () => resolve());
      });

      // Should NOT contain host system users (only container users)
      // Host typically has many users, container has minimal users
      expect(output).not.toContain('kostasnoreika'); // User from Mac
      expect(output).toContain('node'); // Container user should exist
    }, 30000);

    test('should NOT allow writing to root filesystem', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const config: ContainerConfig = {
        projectName: 'test-readonly-root',
        workspacePath: testWorkspacePath,
        image: 'claude-studio-terminal:latest',
      };

      const session = await manager.createSession(config);
      createdSessions.push(session.sessionId);

      const docker = manager.getDockerClient();
      const container = docker.getContainer(session.containerId);

      // Verify read-only root filesystem is enforced
      const info = await container.inspect();
      expect(info.HostConfig.ReadonlyRootfs).toBe(true);

      // Try to write to root filesystem (should fail)
      const exec = await container.exec({
        Cmd: ['sh', '-c', 'echo "test" > /test.txt 2>&1'],
        AttachStdout: true,
        AttachStderr: true,
      });

      const stream = await exec.start({ Detach: false });
      let output = '';

      await new Promise<void>((resolve) => {
        stream.on('data', (chunk: Buffer) => {
          output += chunk.toString();
        });
        stream.on('end', () => resolve());
      });

      // Should fail with read-only filesystem error
      expect(output.toLowerCase()).toMatch(/read-only|permission denied/);
    }, 30000);

    test('should only allow writes to /workspace', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const config: ContainerConfig = {
        projectName: 'test-workspace-write',
        workspacePath: testWorkspacePath,
        image: 'claude-studio-terminal:latest',
      };

      const session = await manager.createSession(config);
      createdSessions.push(session.sessionId);

      const docker = manager.getDockerClient();
      const container = docker.getContainer(session.containerId);

      // Write to /workspace should succeed
      const execWrite = await container.exec({
        Cmd: ['sh', '-c', 'echo "allowed" > /workspace/test.txt && cat /workspace/test.txt'],
        AttachStdout: true,
        AttachStderr: true,
      });

      const streamWrite = await execWrite.start({ Detach: false });
      let outputWrite = '';

      await new Promise<void>((resolve) => {
        streamWrite.on('data', (chunk: Buffer) => {
          outputWrite += chunk.toString();
        });
        streamWrite.on('end', () => resolve());
      });

      // Should successfully write and read
      expect(outputWrite).toContain('allowed');
    }, 30000);
  });

  describe('Filesystem Restrictions', () => {
    test('should NOT have access to Docker socket', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const config: ContainerConfig = {
        projectName: 'test-docker-socket',
        workspacePath: testWorkspacePath,
        image: 'claude-studio-terminal:latest',
      };

      const session = await manager.createSession(config);
      createdSessions.push(session.sessionId);

      const docker = manager.getDockerClient();
      const container = docker.getContainer(session.containerId);
      const info = await container.inspect();

      // Should NOT have Docker socket mounted
      const binds = info.HostConfig.Binds || [];
      const hasDockerSocket = binds.some((bind: string) =>
        bind.includes('/var/run/docker.sock')
      );

      expect(hasDockerSocket).toBe(false);
    }, 30000);

    test('should only have workspace volume mounted', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const config: ContainerConfig = {
        projectName: 'test-volume-isolation',
        workspacePath: testWorkspacePath,
        image: 'claude-studio-terminal:latest',
      };

      const session = await manager.createSession(config);
      createdSessions.push(session.sessionId);

      const docker = manager.getDockerClient();
      const container = docker.getContainer(session.containerId);
      const info = await container.inspect();

      // Should only have workspace bind mount
      const binds = info.HostConfig.Binds || [];
      expect(binds.length).toBe(1);
      expect(binds[0]).toContain('/workspace');
    }, 30000);
  });

  describe('Capability Restrictions', () => {
    test('should have all capabilities dropped', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const config: ContainerConfig = {
        projectName: 'test-cap-drop',
        workspacePath: testWorkspacePath,
        image: 'claude-studio-terminal:latest',
      };

      const session = await manager.createSession(config);
      createdSessions.push(session.sessionId);

      const docker = manager.getDockerClient();
      const container = docker.getContainer(session.containerId);
      const info = await container.inspect();

      // Should have ALL capabilities dropped
      expect(info.HostConfig.CapDrop).toContain('ALL');
    }, 30000);

    test('should only have minimal required capabilities', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const config: ContainerConfig = {
        projectName: 'test-cap-add',
        workspacePath: testWorkspacePath,
        image: 'claude-studio-terminal:latest',
      };

      const session = await manager.createSession(config);
      createdSessions.push(session.sessionId);

      const docker = manager.getDockerClient();
      const container = docker.getContainer(session.containerId);
      const info = await container.inspect();

      // Should only have CHOWN and DAC_OVERRIDE
      const capAdd = info.HostConfig.CapAdd || [];
      expect(capAdd).toEqual(['CHOWN', 'DAC_OVERRIDE']);

      // Should NOT have dangerous capabilities
      expect(capAdd).not.toContain('SYS_ADMIN');
      expect(capAdd).not.toContain('NET_ADMIN');
      expect(capAdd).not.toContain('SYS_MODULE');
    }, 30000);

    test('should NOT allow privilege escalation', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const config: ContainerConfig = {
        projectName: 'test-no-new-privileges',
        workspacePath: testWorkspacePath,
        image: 'claude-studio-terminal:latest',
      };

      const session = await manager.createSession(config);
      createdSessions.push(session.sessionId);

      const docker = manager.getDockerClient();
      const container = docker.getContainer(session.containerId);
      const info = await container.inspect();

      // Should have no-new-privileges security option
      expect(info.HostConfig.SecurityOpt).toContain('no-new-privileges');
    }, 30000);
  });

  describe('User Isolation', () => {
    test('should run as non-root user', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const config: ContainerConfig = {
        projectName: 'test-non-root',
        workspacePath: testWorkspacePath,
        image: 'claude-studio-terminal:latest',
      };

      const session = await manager.createSession(config);
      createdSessions.push(session.sessionId);

      const docker = manager.getDockerClient();
      const container = docker.getContainer(session.containerId);

      // Check user in container
      const exec = await container.exec({
        Cmd: ['id', '-u'],
        AttachStdout: true,
        AttachStderr: true,
      });

      const stream = await exec.start({ Detach: false });
      let output = '';

      await new Promise<void>((resolve) => {
        stream.on('data', (chunk: Buffer) => {
          output += chunk.toString();
        });
        stream.on('end', () => resolve());
      });

      const uid = parseInt(output.trim());

      // Should NOT be root (uid 0)
      expect(uid).not.toBe(0);
      expect(uid).toBe(1000); // node user
    }, 30000);

    test('should NOT be able to switch to root', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const config: ContainerConfig = {
        projectName: 'test-su-denied',
        workspacePath: testWorkspacePath,
        image: 'claude-studio-terminal:latest',
      };

      const session = await manager.createSession(config);
      createdSessions.push(session.sessionId);

      const docker = manager.getDockerClient();
      const container = docker.getContainer(session.containerId);

      // Try to switch to root (should fail)
      const exec = await container.exec({
        Cmd: ['sh', '-c', 'su - root 2>&1 || echo "su-failed"'],
        AttachStdout: true,
        AttachStderr: true,
      });

      const stream = await exec.start({ Detach: false });
      let output = '';

      await new Promise<void>((resolve) => {
        stream.on('data', (chunk: Buffer) => {
          output += chunk.toString();
        });
        stream.on('end', () => resolve());
      });

      // Should fail to switch user
      expect(output).toMatch(/su-failed|permission denied|not found/i);
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
        projectName: 'test-network-mode',
        workspacePath: testWorkspacePath,
        image: 'claude-studio-terminal:latest',
      };

      const session = await manager.createSession(config);
      createdSessions.push(session.sessionId);

      const docker = manager.getDockerClient();
      const container = docker.getContainer(session.containerId);
      const info = await container.inspect();

      // Should use bridge network (not host or none)
      expect(info.HostConfig.NetworkMode).toBe('bridge');
    }, 30000);

    test('should NOT have host network access', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const config: ContainerConfig = {
        projectName: 'test-no-host-network',
        workspacePath: testWorkspacePath,
        image: 'claude-studio-terminal:latest',
      };

      const session = await manager.createSession(config);
      createdSessions.push(session.sessionId);

      const docker = manager.getDockerClient();
      const container = docker.getContainer(session.containerId);
      const info = await container.inspect();

      // Should NOT use host network mode
      expect(info.HostConfig.NetworkMode).not.toBe('host');
    }, 30000);
  });

  describe('Resource Limits Enforcement', () => {
    test('should enforce memory limits', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const config: ContainerConfig = {
        projectName: 'test-memory-limit',
        workspacePath: testWorkspacePath,
        image: 'claude-studio-terminal:latest',
      };

      const session = await manager.createSession(config);
      createdSessions.push(session.sessionId);

      const docker = manager.getDockerClient();
      const container = docker.getContainer(session.containerId);
      const info = await container.inspect();

      // Should have memory limit set
      expect(info.HostConfig.Memory).toBeGreaterThan(0);
      expect(info.HostConfig.Memory).toBeLessThanOrEqual(1073741824); // <= 1GB
    }, 30000);

    test('should enforce CPU limits', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const config: ContainerConfig = {
        projectName: 'test-cpu-limit',
        workspacePath: testWorkspacePath,
        image: 'claude-studio-terminal:latest',
      };

      const session = await manager.createSession(config);
      createdSessions.push(session.sessionId);

      const docker = manager.getDockerClient();
      const container = docker.getContainer(session.containerId);
      const info = await container.inspect();

      // Should have CPU shares set
      expect(info.HostConfig.CpuShares).toBeGreaterThan(0);
      expect(info.HostConfig.CpuShares).toBeLessThanOrEqual(1024);
    }, 30000);
  });

  describe('Claude CLI Specific Security', () => {
    test('should verify Claude CLI runs as non-root', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const config: ContainerConfig = {
        projectName: 'test-claude-nonroot',
        workspacePath: testWorkspacePath,
        image: 'claude-studio-terminal:latest',
      };

      const session = await manager.createSession(config);
      createdSessions.push(session.sessionId);

      const docker = manager.getDockerClient();
      const container = docker.getContainer(session.containerId);

      // Check if claude command exists and runs as non-root
      const exec = await container.exec({
        Cmd: ['sh', '-c', 'which claude && id -u'],
        AttachStdout: true,
        AttachStderr: true,
      });

      const stream = await exec.start({ Detach: false });
      let output = '';

      await new Promise<void>((resolve) => {
        stream.on('data', (chunk: Buffer) => {
          output += chunk.toString();
        });
        stream.on('end', () => resolve());
      });

      // Should have claude in path and uid 1000
      expect(output).toContain('claude');
      expect(output).toContain('1000');
    }, 30000);
  });
});

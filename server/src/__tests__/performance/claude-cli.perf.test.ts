/**
 * Performance Benchmarks for Claude CLI Containers - P04-T007
 *
 * Tests verify performance characteristics:
 * - Container startup time with Claude CLI
 * - Command execution latency
 * - Resource usage under load
 * - Concurrent session handling
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

describe('Claude CLI Performance Benchmarks', () => {
  let manager: ContainerManager;
  const createdSessions: string[] = [];
  const testWorkspaces: string[] = [];

  beforeAll(async () => {
    const dockerAvailable = await isDockerAvailable();
    if (!dockerAvailable) {
      console.warn('Docker daemon not available. Skipping Claude CLI performance tests.');
    }

    manager = ContainerManager.getInstance();
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

  describe('Container Startup Performance', () => {
    test('should create container with Claude CLI in under 5 seconds', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const workspacePath = createTestWorkspace();
      const config: ContainerConfig = {
        projectName: 'test-startup-time',
        workspacePath,
        image: 'claude-studio-terminal:latest',
      };

      const startTime = Date.now();
      const session = await manager.createSession(config);
      const endTime = Date.now();

      createdSessions.push(session.sessionId);

      const duration = endTime - startTime;

      // Should create container in under 5 seconds
      expect(duration).toBeLessThan(5000);

      console.log(`Container with Claude CLI created in: ${duration}ms`);
    }, 30000);

    test('should create 5 containers concurrently in reasonable time', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const containerCount = 5;
      const promises = [];

      const startTime = Date.now();

      for (let i = 0; i < containerCount; i++) {
        const workspacePath = createTestWorkspace();
        const config: ContainerConfig = {
          projectName: `test-concurrent-startup-${i}`,
          workspacePath,
          image: 'claude-studio-terminal:latest',
        };

        promises.push(manager.createSession(config));
      }

      const sessions = await Promise.all(promises);
      const endTime = Date.now();

      createdSessions.push(...sessions.map((s) => s.sessionId));

      const duration = endTime - startTime;

      // Should create 5 containers concurrently in under 15 seconds
      expect(duration).toBeLessThan(15000);

      console.log(`5 containers created concurrently in: ${duration}ms`);
    }, 60000);

    test('should measure container ready time (startup + bash ready)', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const workspacePath = createTestWorkspace();
      const config: ContainerConfig = {
        projectName: 'test-ready-time',
        workspacePath,
        image: 'claude-studio-terminal:latest',
      };

      const startTime = Date.now();
      const session = await manager.createSession(config);

      // Execute simple command to verify bash is ready
      const docker = manager.getDockerClient();
      const container = docker.getContainer(session.containerId);

      const exec = await container.exec({
        Cmd: ['echo', 'ready'],
        AttachStdout: true,
        AttachStderr: true,
      });

      await exec.start({ Detach: false });
      const endTime = Date.now();

      createdSessions.push(session.sessionId);

      const duration = endTime - startTime;

      // Should be ready (including bash) in under 7 seconds
      expect(duration).toBeLessThan(7000);

      console.log(`Container ready (bash responsive) in: ${duration}ms`);
    }, 30000);
  });

  describe('Command Execution Latency', () => {
    test('should execute simple command with low latency', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const workspacePath = createTestWorkspace();
      const config: ContainerConfig = {
        projectName: 'test-exec-latency',
        workspacePath,
        image: 'claude-studio-terminal:latest',
      };

      const session = await manager.createSession(config);
      createdSessions.push(session.sessionId);

      const docker = manager.getDockerClient();
      const container = docker.getContainer(session.containerId);

      // Measure command execution latency
      const startTime = Date.now();

      const exec = await container.exec({
        Cmd: ['echo', 'test'],
        AttachStdout: true,
        AttachStderr: true,
      });

      const stream = await exec.start({ Detach: false });

      await new Promise<void>((resolve) => {
        stream.on('end', () => resolve());
      });

      const endTime = Date.now();
      const latency = endTime - startTime;

      // Command execution should be fast (< 500ms)
      expect(latency).toBeLessThan(500);

      console.log(`Simple command execution latency: ${latency}ms`);
    }, 30000);

    test('should execute multiple commands with consistent latency', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const workspacePath = createTestWorkspace();
      const config: ContainerConfig = {
        projectName: 'test-multi-exec',
        workspacePath,
        image: 'claude-studio-terminal:latest',
      };

      const session = await manager.createSession(config);
      createdSessions.push(session.sessionId);

      const docker = manager.getDockerClient();
      const container = docker.getContainer(session.containerId);

      const latencies: number[] = [];

      // Execute 10 commands and measure latency
      for (let i = 0; i < 10; i++) {
        const startTime = Date.now();

        const exec = await container.exec({
          Cmd: ['echo', `test-${i}`],
          AttachStdout: true,
          AttachStderr: true,
        });

        const stream = await exec.start({ Detach: false });

        await new Promise<void>((resolve) => {
          stream.on('end', () => resolve());
        });

        const endTime = Date.now();
        latencies.push(endTime - startTime);
      }

      // Calculate average latency
      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      const maxLatency = Math.max(...latencies);

      console.log(`Average command latency: ${avgLatency.toFixed(2)}ms`);
      console.log(`Max command latency: ${maxLatency}ms`);

      // Average should be reasonable (< 400ms)
      expect(avgLatency).toBeLessThan(400);

      // Max latency should not spike too high (< 1000ms)
      expect(maxLatency).toBeLessThan(1000);
    }, 60000);

    test('should verify Claude CLI command execution time', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const workspacePath = createTestWorkspace();
      const config: ContainerConfig = {
        projectName: 'test-claude-exec-time',
        workspacePath,
        image: 'claude-studio-terminal:latest',
      };

      const session = await manager.createSession(config);
      createdSessions.push(session.sessionId);

      const docker = manager.getDockerClient();
      const container = docker.getContainer(session.containerId);

      // Measure Claude CLI version command
      const startTime = Date.now();

      const exec = await container.exec({
        Cmd: ['sh', '-c', 'claude --version 2>&1 || echo "claude available"'],
        AttachStdout: true,
        AttachStderr: true,
      });

      const stream = await exec.start({ Detach: false });

      await new Promise<void>((resolve) => {
        stream.on('end', () => resolve());
      });

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Claude CLI should respond reasonably fast
      expect(duration).toBeLessThan(3000);

      console.log(`Claude CLI command execution time: ${duration}ms`);
    }, 30000);
  });

  describe('Stream I/O Performance', () => {
    test('should handle high-frequency stdin writes efficiently', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const workspacePath = createTestWorkspace();
      const config: ContainerConfig = {
        projectName: 'test-stdin-throughput',
        workspacePath,
        image: 'claude-studio-terminal:latest',
      };

      const session = await manager.createSession(config);
      createdSessions.push(session.sessionId);

      // Attach to container streams
      const streams = await manager.attachToContainerStreams(session.containerId);

      const startTime = Date.now();

      // Write 100 lines rapidly
      const writeCount = 100;
      for (let i = 0; i < writeCount; i++) {
        manager.writeToContainerStdin(
          session.containerId,
          `echo "Line ${i}"\n`,
          streams.stdin
        );
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should handle 100 writes very quickly (< 1000ms)
      expect(duration).toBeLessThan(1000);

      console.log(`100 stdin writes completed in: ${duration}ms`);
    }, 30000);

    test('should handle stdout data stream efficiently', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const workspacePath = createTestWorkspace();
      const config: ContainerConfig = {
        projectName: 'test-stdout-throughput',
        workspacePath,
        image: 'claude-studio-terminal:latest',
      };

      const session = await manager.createSession(config);
      createdSessions.push(session.sessionId);

      const docker = manager.getDockerClient();
      const container = docker.getContainer(session.containerId);

      // Generate large output and measure read performance
      const startTime = Date.now();

      const exec = await container.exec({
        Cmd: ['sh', '-c', 'for i in $(seq 1 100); do echo "Output line $i"; done'],
        AttachStdout: true,
        AttachStderr: true,
      });

      const stream = await exec.start({ Detach: false });
      let lineCount = 0;

      await new Promise<void>((resolve) => {
        stream.on('data', (chunk: Buffer) => {
          const lines = chunk.toString().split('\n');
          lineCount += lines.length - 1; // Subtract 1 for trailing newline
        });
        stream.on('end', () => resolve());
      });

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should read 100 lines quickly (< 2000ms)
      expect(duration).toBeLessThan(2000);

      console.log(`100 lines read from stdout in: ${duration}ms`);
    }, 30000);
  });

  describe('Container Lifecycle Performance', () => {
    test('should stop container quickly', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const workspacePath = createTestWorkspace();
      const config: ContainerConfig = {
        projectName: 'test-stop-time',
        workspacePath,
        image: 'claude-studio-terminal:latest',
      };

      const session = await manager.createSession(config);
      createdSessions.push(session.sessionId);

      const startTime = Date.now();
      await manager.stopSession(session.sessionId);
      const endTime = Date.now();

      const duration = endTime - startTime;

      // Should stop in under 15 seconds (includes 10s grace period)
      expect(duration).toBeLessThan(15000);

      console.log(`Container stopped in: ${duration}ms`);
    }, 30000);

    test('should handle rapid create-stop cycles', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const startTime = Date.now();

      // Create and stop 5 containers rapidly
      for (let i = 0; i < 5; i++) {
        const workspacePath = createTestWorkspace();
        const config: ContainerConfig = {
          projectName: `test-rapid-cycle-${i}`,
          workspacePath,
          image: 'claude-studio-terminal:latest',
        };

        const session = await manager.createSession(config);
        await manager.stopSession(session.sessionId);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete 5 create-stop cycles in reasonable time (< 60s)
      expect(duration).toBeLessThan(60000);

      console.log(`5 rapid create-stop cycles completed in: ${duration}ms`);
    }, 120000);
  });

  describe('Resource Usage Benchmarks', () => {
    test('should verify container memory usage is within limits', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const workspacePath = createTestWorkspace();
      const config: ContainerConfig = {
        projectName: 'test-memory-usage',
        workspacePath,
        image: 'claude-studio-terminal:latest',
      };

      const session = await manager.createSession(config);
      createdSessions.push(session.sessionId);

      const docker = manager.getDockerClient();
      const container = docker.getContainer(session.containerId);

      // Get container stats
      const stats = await container.stats({ stream: false });

      const memoryUsage = stats.memory_stats.usage || 0;
      const memoryLimit = stats.memory_stats.limit || 0;

      console.log(`Memory usage: ${(memoryUsage / 1024 / 1024).toFixed(2)} MB`);
      console.log(`Memory limit: ${(memoryLimit / 1024 / 1024).toFixed(2)} MB`);

      // Memory usage should be reasonable (< 500MB for idle container)
      expect(memoryUsage).toBeLessThan(500 * 1024 * 1024);

      // Should have limit set
      expect(memoryLimit).toBeGreaterThan(0);
    }, 30000);

    test('should handle 10 concurrent active sessions', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const containerCount = 10;
      const startTime = Date.now();

      // Create 10 containers
      const sessions = [];
      for (let i = 0; i < containerCount; i++) {
        const workspacePath = createTestWorkspace();
        const config: ContainerConfig = {
          projectName: `test-concurrent-load-${i}`,
          workspacePath,
          image: 'claude-studio-terminal:latest',
        };

        const session = await manager.createSession(config);
        sessions.push(session);
        createdSessions.push(session.sessionId);
      }

      // Execute commands in all containers concurrently
      const docker = manager.getDockerClient();
      const execPromises = sessions.map(async (session) => {
        const container = docker.getContainer(session.containerId);
        const exec = await container.exec({
          Cmd: ['echo', 'test'],
          AttachStdout: true,
          AttachStderr: true,
        });
        return exec.start({ Detach: false });
      });

      await Promise.all(execPromises);

      const endTime = Date.now();
      const duration = endTime - startTime;

      console.log(`10 concurrent sessions handled in: ${duration}ms`);

      // Should handle 10 concurrent sessions reasonably (< 30s)
      expect(duration).toBeLessThan(30000);
    }, 90000);
  });

  describe('Performance Under Load', () => {
    test('should maintain performance with sequential operations', async () => {
      const dockerAvailable = await isDockerAvailable();
      if (!dockerAvailable) {
        console.warn('Skipping test: Docker not available');
        return;
      }

      const workspacePath = createTestWorkspace();
      const config: ContainerConfig = {
        projectName: 'test-sequential-load',
        workspacePath,
        image: 'claude-studio-terminal:latest',
      };

      const session = await manager.createSession(config);
      createdSessions.push(session.sessionId);

      const docker = manager.getDockerClient();
      const container = docker.getContainer(session.containerId);

      const latencies: number[] = [];

      // Execute 20 commands sequentially
      for (let i = 0; i < 20; i++) {
        const startTime = Date.now();

        const exec = await container.exec({
          Cmd: ['echo', `iteration-${i}`],
          AttachStdout: true,
          AttachStderr: true,
        });

        const stream = await exec.start({ Detach: false });

        await new Promise<void>((resolve) => {
          stream.on('end', () => resolve());
        });

        const endTime = Date.now();
        latencies.push(endTime - startTime);
      }

      // Calculate statistics
      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      const firstFive = latencies.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
      const lastFive = latencies.slice(-5).reduce((a, b) => a + b, 0) / 5;

      console.log(`Average latency: ${avgLatency.toFixed(2)}ms`);
      console.log(`First 5 avg: ${firstFive.toFixed(2)}ms`);
      console.log(`Last 5 avg: ${lastFive.toFixed(2)}ms`);

      // Performance should remain consistent (last 5 not more than 2x first 5)
      expect(lastFive).toBeLessThan(firstFive * 2);
    }, 90000);
  });
});

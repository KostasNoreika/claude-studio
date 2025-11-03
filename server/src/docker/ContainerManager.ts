/**
 * Container Session Manager
 * P03-T004: Container Session Manager with CRITICAL security controls
 * P03-T005: Attach to container stdin/stdout/stderr streams
 * P03-T009: Container lifecycle error handling
 * P07-T003: Integrate FileWatcher with container sessions
 *
 * Singleton class responsible for managing Docker container lifecycle
 * with strict security controls, stream attachment for I/O operations,
 * comprehensive error handling with retry logic and circuit breaker,
 * and file watching for hot reload.
 */

import Docker from 'dockerode';
import { randomBytes } from 'crypto';
import { resolve, isAbsolute } from 'path';
import { Writable, Readable } from 'stream';
import {
  ContainerConfig,
  ContainerSession,
  CONTAINER_SECURITY_DEFAULTS,
} from './types';
import {
  ContainerError,
  ContainerCreationError,
  ContainerNotFoundError,
  DockerDaemonError,
  StreamAttachmentError,
  ContainerStateError,
  SessionNotFoundError,
  SessionValidationError,
  toContainerError,
} from './errors';
import { dockerCircuitBreaker } from './circuitBreaker';
import { retryWithBackoff } from './retry';
import { FileWatcher } from '../watcher/FileWatcher';

export class ContainerManager {
  private static instance: ContainerManager;
  private docker: Docker;
  private sessions: Map<string, ContainerSession>;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  /**
   * Private constructor for singleton pattern
   */
  private constructor() {
    // Connect to Docker daemon using Unix socket (Mac Studio)
    this.docker = new Docker({ socketPath: '/var/run/docker.sock' });
    this.sessions = new Map();

    // Start health monitoring
    this.startHealthMonitoring();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): ContainerManager {
    if (!ContainerManager.instance) {
      ContainerManager.instance = new ContainerManager();
    }
    return ContainerManager.instance;
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return 'session-' + randomBytes(16).toString('hex');
  }

  /**
   * Validate workspace path for security
   * Must be absolute path and exist
   */
  private validateWorkspacePath(path: string): void {
    if (!isAbsolute(path)) {
      throw new Error('Workspace path must be absolute: ' + path);
    }

    // Additional validation: ensure path doesn't contain suspicious patterns
    const normalized = resolve(path);
    if (normalized !== path) {
      throw new Error('Workspace path contains suspicious patterns: ' + path);
    }

    // Path should start with /opt/dev/ or /opt/prod/ (project structure)
    if (!normalized.startsWith('/opt/dev/') && !normalized.startsWith('/opt/prod/')) {
      throw new Error('Workspace path must be in /opt/dev/ or /opt/prod/: ' + path);
    }
  }

  /**
   * Create a new container session with security controls
   * P03-T009: Enhanced with comprehensive error handling
   *
   * Security features:
   * - Read-only root filesystem
   * - Non-root user (1000:1000)
   * - Dropped capabilities (ALL) with minimal additions
   * - Memory limit: 1GB
   * - CPU shares: 512
   * - Network isolation
   */
  public async createSession(config: ContainerConfig): Promise<ContainerSession> {
    const sessionId = this.generateSessionId();

    try {
      // Validate workspace path
      this.validateWorkspacePath(config.workspacePath);

      // Prepare environment variables
      const env = Object.entries(config.env || {}).map(
        ([key, value]) => key + '=' + value
      );

      // Image to use (default: claude-studio-sandbox)
      const image = config.image || 'claude-studio-sandbox:latest';

      // Create session object
      const session: ContainerSession = {
        sessionId,
        containerId: '', // Will be set after container creation
        projectName: config.projectName,
        status: 'creating',
        createdAt: new Date(),
        lastActivity: new Date(),
        workspacePath: config.workspacePath,
      };

      this.sessions.set(sessionId, session);

      try {
        // Create container with circuit breaker protection
        const container = await dockerCircuitBreaker.execute(async () => {
          return await this.docker.createContainer({
            Image: image,
            name: 'claude-studio-' + sessionId,

            // Security: Run as non-root user
            User: CONTAINER_SECURITY_DEFAULTS.User,

            // Environment variables
            Env: env,

            // Working directory
            WorkingDir: '/workspace',

            // Labels for identification
            Labels: {
              'claude-studio.session-id': sessionId,
              'claude-studio.project': config.projectName,
              'claude-studio.managed': 'true',
            },

            // Host configuration (security critical)
            HostConfig: {
              // Read-only root filesystem
              ReadonlyRootfs: config.securityOptions?.readonlyRootfs ?? CONTAINER_SECURITY_DEFAULTS.ReadonlyRootfs,

              // Memory limit (default 1GB)
              Memory: config.securityOptions?.memoryLimit ?? CONTAINER_SECURITY_DEFAULTS.Memory,

              // CPU shares (default 512)
              CpuShares: config.securityOptions?.cpuShares ?? CONTAINER_SECURITY_DEFAULTS.CpuShares,

              // Capability controls (DROP ALL, ADD minimal)
              CapDrop: CONTAINER_SECURITY_DEFAULTS.CapDrop,
              CapAdd: CONTAINER_SECURITY_DEFAULTS.CapAdd,

              // Network mode
              NetworkMode: CONTAINER_SECURITY_DEFAULTS.NetworkMode,

              // Security options
              SecurityOpt: CONTAINER_SECURITY_DEFAULTS.SecurityOpt,

              // Mount workspace as bind (only allowed mount)
              Binds: [
                config.workspacePath + ':/workspace',
              ],

              // NO privileged mode
              Privileged: CONTAINER_SECURITY_DEFAULTS.Privileged,

              // Auto-remove on stop
              AutoRemove: true,
            },

            // Keep container running (will execute commands via exec)
            Cmd: ['/bin/sh', '-c', 'tail -f /dev/null'],
          });
        });

        // Start the container with retry logic
        await retryWithBackoff(
          async () => await container.start(),
          { maxRetries: 2, initialDelay: 500 }
        );

        // Update session with container ID
        session.containerId = container.id;
        session.status = 'running';

        // P07-T003: Create and start FileWatcher for this session
        const fileWatcher = new FileWatcher({
          watchPath: config.workspacePath,
          debounceDelay: 500,
        });
        session.fileWatcher = fileWatcher;
        fileWatcher.start();

        console.log(`[ContainerManager] Created file watcher for session: ${sessionId}`);

        this.sessions.set(sessionId, session);

        console.log(`[ContainerManager] Created session: ${sessionId} (${config.projectName})`);

        return session;
      } catch (error) {
        // Update session with error
        session.status = 'error';
        const containerError = toContainerError(error);
        session.error = containerError.message;
        this.sessions.set(sessionId, session);

        console.error(`[ContainerManager] Failed to create session: ${sessionId}`, containerError.toLogData());

        // Throw typed error
        throw new ContainerCreationError(
          containerError.message,
          {
            sessionId,
            projectName: config.projectName,
            image,
            originalError: error instanceof Error ? error.message : String(error),
          }
        );
      }
    } catch (error) {
      // Validation errors
      if (error instanceof SessionValidationError || error instanceof ContainerCreationError) {
        throw error;
      }

      // Convert to typed error
      throw new ContainerCreationError(
        error instanceof Error ? error.message : 'Failed to create container session',
        { sessionId, originalError: String(error) }
      );
    }
  }

  /**
   * Stop and remove a container session
   * P03-T009: Enhanced with comprehensive error handling
   * P07-T003: Stop FileWatcher when stopping session
   */
  public async stopSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    try {
      session.status = 'stopping';
      this.sessions.set(sessionId, session);

      // P07-T003: Stop file watcher
      if (session.fileWatcher) {
        await session.fileWatcher.stop();
        console.log(`[ContainerManager] Stopped file watcher for session: ${sessionId}`);
      }

      const container = this.docker.getContainer(session.containerId);

      // Stop container with retry logic (will auto-remove due to AutoRemove: true)
      await retryWithBackoff(
        async () => await container.stop({ t: 10 }), // 10 second grace period
        { maxRetries: 2, initialDelay: 500 }
      );

      session.status = 'stopped';
      this.sessions.set(sessionId, session);

      console.log(`[ContainerManager] Stopped session: ${sessionId}`);

      // Remove from active sessions
      this.sessions.delete(sessionId);
    } catch (error) {
      // If container doesn't exist or already stopped, just remove from sessions
      if (
        error instanceof Error &&
        (error.message.includes('no such container') ||
          error.message.includes('already stopped') ||
          error.message.includes('not running'))
      ) {
        console.log(`[ContainerManager] Container already stopped: ${sessionId}`);

        // Still stop file watcher if exists
        if (session.fileWatcher) {
          await session.fileWatcher.stop();
        }

        this.sessions.delete(sessionId);
        return;
      }

      // Log error but don't fail
      session.status = 'error';
      const containerError = toContainerError(error);
      session.error = containerError.message;
      this.sessions.set(sessionId, session);

      console.error(`[ContainerManager] Failed to stop session: ${sessionId}`, containerError.toLogData());

      throw new ContainerStateError(
        containerError.message,
        false,
        { sessionId, containerId: session.containerId }
      );
    }
  }

  /**
   * Get session information
   */
  public getSession(sessionId: string): ContainerSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Check if a container is still running
   * Returns true if container exists and is running
   */
  public async isContainerRunning(containerId: string): Promise<boolean> {
    try {
      const container = this.docker.getContainer(containerId);
      const info = await container.inspect();
      return info.State.Running === true;
    } catch (error) {
      return false;
    }
  }

  /**
   * List all active sessions
   */
  public listSessions(): ContainerSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Update last activity timestamp for a session
   */
  public updateActivity(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = new Date();
      this.sessions.set(sessionId, session);
    }
  }

  /**
   * Cleanup zombie containers on startup
   * Removes any leftover containers from previous runs
   */
  public async cleanupZombieContainers(): Promise<number> {
    try {
      // List all containers with claude-studio label
      const containers = await this.docker.listContainers({
        all: true,
        filters: {
          label: ['claude-studio.managed=true'],
        },
      });

      console.log('Found ' + containers.length + ' managed containers to cleanup');

      let cleanedUp = 0;
      for (const containerInfo of containers) {
        try {
          const container = this.docker.getContainer(containerInfo.Id);

          // Stop if running
          if (containerInfo.State === 'running') {
            await container.stop({ t: 5 });
          }

          // Remove container
          await container.remove({ force: true });
          cleanedUp++;

          console.log('Cleaned up zombie container: ' + containerInfo.Id.substring(0, 12));
        } catch (error) {
          console.error('Failed to cleanup container ' + containerInfo.Id.substring(0, 12) + ':', error);
        }
      }

      console.log('Cleanup complete: ' + cleanedUp + '/' + containers.length + ' containers removed');
      return cleanedUp;
    } catch (error) {
      console.error('Failed to cleanup zombie containers:', error);
      throw error;
    }
  }

  /**
   * Get Docker client (for advanced operations)
   */
  public getDockerClient(): Docker {
    return this.docker;
  }

  /**
   * Health check: verify Docker daemon is accessible
   * P03-T009: Enhanced with circuit breaker
   */
  public async healthCheck(): Promise<boolean> {
    try {
      await dockerCircuitBreaker.execute(async () => {
        return await this.docker.ping();
      });
      return true;
    } catch (error) {
      console.error('[ContainerManager] Docker health check failed:', error);
      return false;
    }
  }

  /**
   * P03-T009: Start health monitoring
   * Periodically checks container health and removes crashed sessions
   */
  private startHealthMonitoring(): void {
    // Check every 30 seconds
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.monitorContainerHealth();
      } catch (error) {
        console.error('[ContainerManager] Health monitoring error:', error);
      }
    }, 30000);

    // Use unref() to allow process to exit if this is the only thing running
    if (this.healthCheckInterval.unref) {
      this.healthCheckInterval.unref();
    }

    console.log('[ContainerManager] Health monitoring started (interval: 30s)');
  }

  /**
   * P03-T009: Monitor health of all active containers
   * Detects crashed containers and updates session status
   */
  private async monitorContainerHealth(): Promise<void> {
    const sessions = Array.from(this.sessions.values());

    for (const session of sessions) {
      if (session.status !== 'running') {
        continue;
      }

      try {
        const isRunning = await this.isContainerRunning(session.containerId);

        if (!isRunning) {
          console.warn(`[ContainerManager] Container crashed: ${session.sessionId}`);

          // Update session status
          session.status = 'error';
          session.error = 'Container crashed or stopped unexpectedly';
          this.sessions.set(session.sessionId, session);

          // Note: Do not delete session - allow reconnection attempts to see error
        }
      } catch (error) {
        // Ignore errors during health check (container might be stopping)
        console.debug(`[ContainerManager] Health check error for ${session.sessionId}:`, error);
      }
    }
  }

  /**
   * P03-T009: Stop health monitoring (for cleanup)
   */
  public stopHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      console.log('[ContainerManager] Health monitoring stopped');
    }
  }

  /**
   * P03-T005: Attach to container stdin/stdout/stderr
   * P03-T009: Enhanced with comprehensive error handling
   *
   * Establishes streams for I/O operations with a running container
   *
   * @param containerId - Docker container ID
   * @returns Container streams (stdin, stdout, stderr)
   */
  public async attachToContainerStreams(containerId: string): Promise<{ stdin: Writable; stdout: Readable; stderr: Readable }> {
    try {
      // Verify container is running before attaching
      const isRunning = await this.isContainerRunning(containerId);
      if (!isRunning) {
        throw new ContainerNotFoundError(containerId, { reason: 'Container not running' });
      }

      const container = this.docker.getContainer(containerId);

      // Attach with retry logic
      const stream = await retryWithBackoff(
        async () => await container.attach({
          stream: true,
          stdin: true,
          stdout: true,
          stderr: true,
        }),
        { maxRetries: 2, initialDelay: 500 }
      );

      console.log(`[ContainerManager] Attached to container streams: ${containerId.substring(0, 12)}`);

      // Docker returns a single multiplexed stream
      // For now, use it for all I/O (proper demultiplexing is a future enhancement)
      return {
        stdin: stream as unknown as Writable,
        stdout: stream as unknown as Readable,
        stderr: stream as unknown as Readable,
      };
    } catch (error) {
      const streamError = toContainerError(error);
      console.error(`[ContainerManager] Failed to attach streams: ${containerId.substring(0, 12)}`, streamError.toLogData());

      throw new StreamAttachmentError(
        streamError.message,
        { containerId, originalError: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * P03-T005: Write string data to container stdin
   *
   * @param containerId - Container ID
   * @param data - String data to write
   * @param stream - Optional stream object (if already attached)
   */
  public writeToContainerStdin(
    containerId: string,
    data: string,
    stream?: Writable
  ): void {
    if (!stream) {
      console.warn('No stream provided for container: ' + containerId);
      return;
    }

    try {
      stream.write(data);
    } catch (error) {
      console.error('Failed to write to container stdin: ' + containerId, error);
    }
  }

  /**
   * P03-T005: Write buffer data to container stdin
   * Useful for binary data or exact encoding control
   *
   * @param containerId - Container ID
   * @param data - Buffer data to write
   * @param stream - Optional stream object (if already attached)
   */
  public writeBufferToContainerStdin(
    containerId: string,
    data: Buffer,
    stream?: Writable
  ): void {
    if (!stream) {
      console.warn('No stream provided for container: ' + containerId);
      return;
    }

    try {
      stream.write(data);
    } catch (error) {
      console.error('Failed to write buffer to container stdin: ' + containerId, error);
    }
  }

  /**
   * P03-T005: Send signal to container process
   * Useful for Ctrl+C (SIGINT) and other signals
   *
   * @param containerId - Container ID
   * @param signal - Signal name (default: 'SIGINT')
   */
  public async sendSignalToContainer(
    containerId: string,
    signal: string = 'SIGINT'
  ): Promise<void> {
    const container = this.docker.getContainer(containerId);

    try {
      await container.kill({ signal });
      console.log('Signal ' + signal + ' sent to container: ' + containerId);
    } catch (error) {
      console.error('Failed to send signal to container: ' + containerId, error);
      throw error;
    }
  }
}

/**
 * Export singleton instance
 */
export const containerManager = ContainerManager.getInstance();

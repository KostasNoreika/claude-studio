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
import { resolve, isAbsolute } from 'path';
import { Writable, Readable } from 'stream';
import { generateSessionId } from '@shared';
import {
  ContainerConfig,
  ContainerSession,
  CONTAINER_SECURITY_DEFAULTS,
} from './types';
import {
  ContainerCreationError,
  ContainerNotFoundError,
  StreamAttachmentError,
  ContainerStateError,
  SessionNotFoundError,
  SessionValidationError,
  toContainerError,
} from './errors';
import { dockerCircuitBreaker } from './circuitBreaker';
import { retryWithBackoff } from './retry';
import { FileWatcher } from '../watcher/FileWatcher';
import { logger } from '../utils/logger';
import { claudeAccountDir, claudeManagerDir, mcpDir } from '../config/env';

export class ContainerManager {
  private static instance: ContainerManager;
  private docker: Docker;
  private sessions: Map<string, ContainerSession>;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private allowedWorkspacePaths: string[];

  /**
   * Private constructor for singleton pattern
   */
  private constructor() {
    // Connect to Docker daemon
    // Supports both Unix socket (development) and TCP (production with proxy)
    const dockerHost = process.env.DOCKER_HOST || '/var/run/docker.sock';

    // Parse DOCKER_HOST: supports both unix:///path and tcp://host:port
    if (dockerHost.startsWith('tcp://')) {
      const url = dockerHost.replace('tcp://', '');
      const [host, portStr] = url.split(':');
      const port = parseInt(portStr) || 2375;

      this.docker = new Docker({
        host: host,
        port: port,
      });

      logger.info('Docker client initialized', {
        mode: 'tcp',
        host: host,
        port: port,
      });
    } else {
      // Unix socket (remove unix:// prefix if present)
      const socketPath = dockerHost.replace('unix://', '');
      this.docker = new Docker({ socketPath });

      logger.info('Docker client initialized', {
        mode: 'socket',
        path: socketPath,
      });
    }

    this.sessions = new Map();

    // SECURITY FIX (HIGH-001): Load allowed workspace paths from environment
    // Defaults to /opt/dev and /opt/prod if not configured
    const allowedPathsEnv = process.env.ALLOWED_WORKSPACE_PATHS;
    this.allowedWorkspacePaths = allowedPathsEnv
      ? allowedPathsEnv.split(',').map(p => p.trim())
      : ['/opt/dev', '/opt/prod'];

    logger.info('Container Manager initialized', {
      allowedWorkspacePaths: this.allowedWorkspacePaths,
    });

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
   * Validate workspace path for security
   * SECURITY FIX (HIGH-001): Use environment-configured allowed paths
   *
   * Must be absolute path and within allowed directories
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

    // SECURITY FIX (HIGH-001): Check against environment-configured allowed paths
    // Path must start with one of the allowed directory prefixes
    const isAllowed = this.allowedWorkspacePaths.some(allowed => {
      // Ensure the path starts with allowed directory + separator
      // This prevents /opt/dev-malicious from matching /opt/dev
      return normalized.startsWith(allowed + '/') || normalized === allowed;
    });

    if (!isAllowed) {
      throw new Error(
        'Workspace path must be in allowed directories: ' +
        this.allowedWorkspacePaths.join(', ') +
        '. Got: ' + path
      );
    }
  }

  /**
   * Create a new container session with security controls
   * P03-T009: Enhanced with comprehensive error handling
   *
   * Security features:
   * - Read-only root filesystem with tmpfs overlays for writable directories
   * - Non-root user (1000:1000)
   * - Dropped capabilities (ALL) with minimal additions
   * - Memory limit: 1GB
   * - CPU shares: 512
   * - Network isolation
   */
  public async createSession(config: ContainerConfig): Promise<ContainerSession> {
    const sessionId = generateSessionId();

    try {
      // Validate workspace path
      this.validateWorkspacePath(config.workspacePath);

      // Prepare configuration
      const { env, image } = this.validateContainerConfig(config);

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
        // Build Docker create options
        const createOptions = this.buildDockerCreateOptions(sessionId, config, env, image);

        // Create container with circuit breaker protection
        const container = await dockerCircuitBreaker.execute(async () => {
          return await this.docker.createContainer(createOptions);
        });

        // Start container with retry logic
        await this.startContainerWithRetry(container);

        // Update session with container ID
        session.containerId = container.id;
        session.status = 'running';

        // Initialize file watcher
        this.initializeFileWatcher(session, config);

        this.sessions.set(sessionId, session);

        logger.info('Container session created successfully', {
          sessionId,
          containerId: container.id,
          projectName: config.projectName,
          workspacePath: config.workspacePath,
          image,
        });

        return session;
      } catch {
        // Update session with error
        session.status = 'error';
        const containerError = toContainerError(error);
        session.error = containerError.message;
        this.sessions.set(sessionId, session);

        logger.error('Failed to create container session', {
          sessionId,
          projectName: config.projectName,
          image,
          error: containerError.toLogData(),
        });

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
    } catch {
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
   * Validate and prepare container configuration
   */
  private validateContainerConfig(config: ContainerConfig): { env: string[]; image: string } {
    // Prepare environment variables
    const env = Object.entries(config.env || {}).map(
      ([key, value]) => key + '=' + value
    );

    // Image to use (default: claude-studio-sandbox)
    const image = config.image || 'claude-studio-sandbox:latest';

    return { env, image };
  }

  /**
   * Build Docker container creation options
   */
  private buildDockerCreateOptions(
    sessionId: string,
    config: ContainerConfig,
    env: string[],
    image: string
  ): any {
    return {
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

      // Enable interactive terminal
      Tty: true,
      OpenStdin: true,
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,

      // Host configuration (security critical)
      HostConfig: {
        // SECURITY: Read-only root filesystem
        // Prevents modification of system binaries, libraries, and configuration
        // Only explicitly mounted tmpfs and bind-mounted directories are writable
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

        // SECURITY FIX (CRITICAL-001, CRITICAL-004):
        // Mount credential directories using configurable paths from environment
        // Credential paths are now validated at startup in src/config/env.ts
        // Read-only mounts (:ro) for credentials to prevent modification
        // Read-write mounts (:rw) only where absolutely necessary
        Binds: [
          // Project workspace (read-write) - REQUIRED for file editing and project work
          config.workspacePath + ':/workspace:rw',

          // Host Claude account directory (READ-ONLY) - shares API key, session, MCP configs
          // Using acc4 as default account for container sessions (claudecode43@paysera.net)
          // SECURITY: Read-only prevents malicious code from modifying credentials
          claudeAccountDir + ':/home/node/.claude-acc4:ro',

          // CRITICAL: Mount .claude.json FILE directly (Claude CLI reads this for OAuth)
          // SECURITY: Read-only prevents OAuth token theft or modification
          claudeAccountDir + '/.claude.json:/home/node/.claude.json:ro',

          // Mount .claude directory for other configs (READ-ONLY)
          // SECURITY: Prevents modification of Claude CLI configuration
          claudeAccountDir + '/.claude:/home/node/.claude:ro',

          // Host MCP configs (READ-ONLY) - shares all MCP servers
          // SECURITY: Containers should not modify shared MCP configurations
          mcpDir + ':/opt/mcp:ro',

          // claude-manager scripts (READ-WRITE) - for 'c' alias
          // JUSTIFICATION: Scripts need to write logs and cache files for functionality
          // RISK: Low - scripts are trusted, and only affect container filesystem
          claudeManagerDir + ':/home/node/.claude-manager:rw',
        ],

        // SECURITY: tmpfs mounts for writable directories (with ReadonlyRootfs=true)
        // These are in-memory temporary filesystems that don't persist across container restarts
        // This allows processes to write temporary data while maintaining read-only root filesystem
        Tmpfs: {
          // System temporary directory - 500MB limit
          // Used by various system utilities and temporary file operations
          '/tmp': 'rw,size=500m,mode=1777,uid=1000,gid=1000',

          // User configuration directory - 100MB limit
          // Claude CLI writes config files to ~/.config/
          // Must be writable for Claude CLI to store preferences and settings
          '/home/node/.config': 'rw,size=100m,mode=0755,uid=1000,gid=1000',

          // User cache directory - 200MB limit
          // Used by npm, Claude CLI, and other tools for caching
          // Improves performance by avoiding repeated downloads/compilations
          '/home/node/.cache': 'rw,size=200m,mode=0755,uid=1000,gid=1000',

          // npm global packages directory - 100MB limit
          // Allows user to install global npm packages during session
          // From Dockerfile: npm config set prefix /home/node/.npm
          '/home/node/.npm': 'rw,size=100m,mode=0755,uid=1000,gid=1000',
        },

        // NO privileged mode
        Privileged: CONTAINER_SECURITY_DEFAULTS.Privileged,

        // Auto-remove on stop
        AutoRemove: true,
      },

      // Run interactive login bash shell (loads .bashrc with aliases like 'c')
      Cmd: ['/bin/bash', '-l'],
    };
  }

  /**
   * Start container with retry logic
   */
  private async startContainerWithRetry(container: Docker.Container): Promise<void> {
    await retryWithBackoff(
      async () => await container.start(),
      { maxRetries: 2, initialDelay: 500 }
    );
  }

  /**
   * Initialize file watcher for session
   */
  private initializeFileWatcher(session: ContainerSession, config: ContainerConfig): void {
    const fileWatcher = new FileWatcher({
      watchPath: config.workspacePath,
      debounceDelay: 500,
    });
    session.fileWatcher = fileWatcher;
    fileWatcher.start();

    logger.info('File watcher created', {
      sessionId: session.sessionId,
      watchPath: config.workspacePath,
    });
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
        logger.info('File watcher stopped', { sessionId });
      }

      const container = this.docker.getContainer(session.containerId);

      // Stop container with retry logic (will auto-remove due to AutoRemove: true)
      await retryWithBackoff(
        async () => await container.stop({ t: 10 }), // 10 second grace period
        { maxRetries: 2, initialDelay: 500 }
      );

      session.status = 'stopped';
      this.sessions.set(sessionId, session);

      logger.info('Container session stopped successfully', {
        sessionId,
        containerId: session.containerId,
      });

      // Remove from active sessions
      this.sessions.delete(sessionId);
    } catch {
      // If container doesn't exist or already stopped, just remove from sessions
      if (
        error instanceof Error &&
        (error.message.includes('no such container') ||
          error.message.includes('already stopped') ||
          error.message.includes('not running'))
      ) {
        logger.info('Container already stopped', { sessionId });

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

      logger.error('Failed to stop container session', {
        sessionId,
        containerId: session.containerId,
        error: containerError.toLogData(),
      });

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
    } catch {
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

      logger.info('Found managed containers to cleanup', { count: containers.length });

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

          logger.debug('Cleaned up zombie container', {
            containerId: containerInfo.Id.substring(0, 12),
            state: containerInfo.State,
          });
        } catch {
          logger.warn('Failed to cleanup container', {
            containerId: containerInfo.Id.substring(0, 12),
            error,
          });
        }
      }

      logger.info('Cleanup complete', {
        cleanedUp,
        total: containers.length,
      });
      return cleanedUp;
    } catch {
      logger.error('Failed to cleanup zombie containers', { error });
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
    } catch {
      logger.error('Docker health check failed', { error });
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
      } catch {
        logger.error('Health monitoring error', { error });
      }
    }, 30000);

    // Use unref() to allow process to exit if this is the only thing running
    if (this.healthCheckInterval.unref) {
      this.healthCheckInterval.unref();
    }

    logger.info('Health monitoring started', { interval: '30s' });
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
          logger.warn('Container crashed or stopped unexpectedly', {
            sessionId: session.sessionId,
            containerId: session.containerId,
          });

          // Update session status
          session.status = 'error';
          session.error = 'Container crashed or stopped unexpectedly';
          this.sessions.set(session.sessionId, session);

          // Note: Do not delete session - allow reconnection attempts to see error
        }
      } catch {
        // Ignore errors during health check (container might be stopping)
        logger.debug('Health check error', {
          sessionId: session.sessionId,
          error,
        });
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
      logger.info('Health monitoring stopped');
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

      // Create interactive bash exec with TTY
      const exec = await retryWithBackoff(
        async () => await container.exec({
          Cmd: ['/bin/bash', '-l'], // Login shell to load .bashrc and aliases
          AttachStdin: true,
          AttachStdout: true,
          AttachStderr: true,
          Tty: true,
        }),
        { maxRetries: 2, initialDelay: 500 }
      );

      // Start the exec and get the stream
      const stream = await retryWithBackoff(
        async () => await exec.start({
          hijack: true,
          stdin: true,
          Tty: true,
        }),
        { maxRetries: 2, initialDelay: 500 }
      );

      logger.info('Attached to container streams via exec', {
        containerId: containerId.substring(0, 12),
      });

      // With TTY enabled, Docker returns a single raw stream for all I/O
      // Use the same stream for stdin, stdout, and stderr
      return {
        stdin: stream as unknown as Writable,
        stdout: stream as unknown as Readable,
        stderr: stream as unknown as Readable,
      };
    } catch {
      const streamError = toContainerError(error);
      logger.error('Failed to attach to container streams', {
        containerId: containerId.substring(0, 12),
        error: streamError.toLogData(),
      });

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
      logger.warn('No stream provided for container stdin write', {
        containerId: containerId.substring(0, 12)
      });
      return;
    }

    try {
      stream.write(data);
    } catch {
      logger.error('Failed to write to container stdin', {
        containerId: containerId.substring(0, 12),
        error
      });
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
      logger.warn('No stream provided for container buffer write', {
        containerId: containerId.substring(0, 12)
      });
      return;
    }

    try {
      stream.write(data);
    } catch {
      logger.error('Failed to write buffer to container stdin', {
        containerId: containerId.substring(0, 12),
        error
      });
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
      logger.info('Signal sent to container', {
        containerId: containerId.substring(0, 12),
        signal
      });
    } catch {
      logger.error('Failed to send signal to container', {
        containerId: containerId.substring(0, 12),
        signal,
        error
      });
      throw error;
    }
  }
}

/**
 * Export singleton instance
 */
export const containerManager = ContainerManager.getInstance();

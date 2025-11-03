/**
 * Container Session Management Types
 * P03-T004: Container Session Manager
 * P03-T009: Container lifecycle error handling
 */

/**
 * Error codes for container operations
 */
export enum ContainerErrorCode {
  CONTAINER_CREATION_FAILED = 'CONTAINER_CREATION_FAILED',
  CONTAINER_NOT_FOUND = 'CONTAINER_NOT_FOUND',
  DOCKER_DAEMON_ERROR = 'DOCKER_DAEMON_ERROR',
  STREAM_ATTACHMENT_FAILED = 'STREAM_ATTACHMENT_FAILED',
  CONTAINER_EXECUTION_FAILED = 'CONTAINER_EXECUTION_FAILED',
  CONTAINER_STATE_ERROR = 'CONTAINER_STATE_ERROR',
  SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',
  SESSION_VALIDATION_FAILED = 'SESSION_VALIDATION_FAILED',
}

/**
 * Structured error information for client
 */
export interface ContainerErrorInfo {
  code: ContainerErrorCode;
  message: string;
  retryable: boolean;
  timestamp: string;
  context?: Record<string, unknown>;
}

export interface ContainerConfig {
  /**
   * Project name (for labeling and tracking)
   */
  projectName: string;

  /**
   * Absolute path to project workspace
   */
  workspacePath: string;

  /**
   * Docker image to use for the container
   * Default: claude-studio-sandbox
   */
  image?: string;

  /**
   * Environment variables to pass to container
   */
  env?: Record<string, string>;

  /**
   * Additional security constraints (optional)
   */
  securityOptions?: {
    memoryLimit?: number; // bytes, default 1GB
    cpuShares?: number; // default 512
    readonlyRootfs?: boolean; // default true
  };
}

export interface ContainerSession {
  /**
   * Unique session identifier
   */
  sessionId: string;

  /**
   * Docker container ID
   */
  containerId: string;

  /**
   * Project name
   */
  projectName: string;

  /**
   * Container status
   */
  status: 'creating' | 'running' | 'stopping' | 'stopped' | 'error';

  /**
   * Timestamp when session was created
   */
  createdAt: Date;

  /**
   * Timestamp of last activity
   */
  lastActivity: Date;

  /**
   * Workspace path mounted in container
   */
  workspacePath: string;

  /**
   * Error message if status is 'error'
   */
  error?: string;

  /**
   * File watcher instance for this session (P07-T003)
   * Internal use only - not serialized
   */
  fileWatcher?: any; // Import type causes circular dependency
}

/**
 * Security configuration for containers
 * CRITICAL: These are the mandatory security constraints
 */
export const CONTAINER_SECURITY_DEFAULTS = {
  /**
   * Read-only root filesystem (true)
   * Prevents container from modifying its own filesystem
   */
  ReadonlyRootfs: true,

  /**
   * Drop all capabilities, add only required ones
   */
  CapDrop: ['ALL'],
  CapAdd: ['CHOWN', 'DAC_OVERRIDE'], // Minimal capabilities for file operations

  /**
   * Run as non-root user
   * UID:GID = 1000:1000
   */
  User: '1000:1000',

  /**
   * Memory limit: 1GB
   */
  Memory: 1073741824,

  /**
   * CPU shares: 512 (half of default 1024)
   */
  CpuShares: 512,

  /**
   * Network mode: bridge (isolated)
   */
  NetworkMode: 'bridge',

  /**
   * No privileged mode
   */
  Privileged: false,

  /**
   * Security options
   */
  SecurityOpt: ['no-new-privileges'],
} as const;

/**
 * Custom Error Classes for Container Lifecycle Management
 * P03-T009: Container lifecycle error handling
 * P09-T003: Enhanced with HTTP status codes
 *
 * Provides typed error classes for different failure scenarios
 * to enable proper error handling and user-friendly error messages.
 */

/**
 * Base class for all container-related errors
 */
export abstract class ContainerError extends Error {
  public readonly code: string;
  public readonly retryable: boolean;
  public readonly statusCode: number;
  public readonly context: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    retryable: boolean = false,
    context: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.retryable = retryable;
    this.context = context;
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Convert to user-friendly error message (without sensitive details)
   */
  public toUserMessage(): string {
    return this.message;
  }

  /**
   * Get structured error data for logging
   */
  public toLogData(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      retryable: this.retryable,
      context: this.context,
      stack: this.stack,
    };
  }
}

/**
 * Error thrown when container creation fails
 */
export class ContainerCreationError extends ContainerError {
  constructor(message: string, context: Record<string, unknown> = {}) {
    super(message, 'CONTAINER_CREATION_FAILED', 500, false, context);
  }

  public toUserMessage(): string {
    if (this.message.includes('No such image')) {
      return 'Container image not available. Please check image configuration.';
    }
    if (this.message.includes('no space left')) {
      return 'Insufficient disk space to create container.';
    }
    if (this.message.includes('memory')) {
      return 'Insufficient memory to create container.';
    }
    return 'Failed to create container. Please try again.';
  }
}

/**
 * Error thrown when container is not found
 */
export class ContainerNotFoundError extends ContainerError {
  constructor(containerId: string, context: Record<string, unknown> = {}) {
    super(
      `Container not found: ${containerId}`,
      'CONTAINER_NOT_FOUND',
      404,
      false,
      { containerId, ...context }
    );
  }

  public toUserMessage(): string {
    return 'Container session has ended. Please start a new session.';
  }
}

/**
 * Error thrown when Docker daemon is unreachable
 */
export class DockerDaemonError extends ContainerError {
  constructor(message: string, context: Record<string, unknown> = {}) {
    super(message, 'DOCKER_DAEMON_ERROR', 503, true, context);
  }

  public toUserMessage(): string {
    return 'Docker service is temporarily unavailable. Please try again later.';
  }
}

/**
 * Error thrown when stream attachment fails
 */
export class StreamAttachmentError extends ContainerError {
  constructor(message: string, context: Record<string, unknown> = {}) {
    super(message, 'STREAM_ATTACHMENT_FAILED', 500, false, context);
  }

  public toUserMessage(): string {
    return 'Failed to connect to container. Please restart your session.';
  }
}

/**
 * Error thrown when container execution fails
 */
export class ContainerExecutionError extends ContainerError {
  constructor(message: string, context: Record<string, unknown> = {}) {
    super(message, 'CONTAINER_EXECUTION_FAILED', 500, false, context);
  }

  public toUserMessage(): string {
    return 'Command execution failed. Please check your input.';
  }
}

/**
 * Error thrown when container start/stop operations fail
 */
export class ContainerStateError extends ContainerError {
  constructor(message: string, retryable: boolean = false, context: Record<string, unknown> = {}) {
    super(message, 'CONTAINER_STATE_ERROR', 500, retryable, context);
  }

  public toUserMessage(): string {
    if (this.message.includes('already stopped')) {
      return 'Container has already been stopped.';
    }
    if (this.message.includes('not running')) {
      return 'Container is not running. Please start a new session.';
    }
    return 'Container is in an invalid state. Please restart your session.';
  }
}

/**
 * Error thrown when session is not found
 */
export class SessionNotFoundError extends ContainerError {
  constructor(sessionId: string, context: Record<string, unknown> = {}) {
    super(
      `Session not found: ${sessionId}`,
      'SESSION_NOT_FOUND',
      404,
      false,
      { sessionId, ...context }
    );
  }

  public toUserMessage(): string {
    return 'Session not found. It may have expired. Please start a new session.';
  }
}

/**
 * Error thrown when session validation fails
 */
export class SessionValidationError extends ContainerError {
  constructor(message: string, context: Record<string, unknown> = {}) {
    super(message, 'SESSION_VALIDATION_FAILED', 400, false, context);
  }

  public toUserMessage(): string {
    return 'Invalid session. Please start a new session.';
  }
}

/**
 * Utility to detect if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof ContainerError) {
    return error.retryable;
  }

  // Check Docker-specific error messages for transient failures
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('econnrefused') ||
      message.includes('timeout') ||
      message.includes('temporarily unavailable') ||
      message.includes('connection reset') ||
      message.includes('socket hang up')
    );
  }

  return false;
}

/**
 * Utility to convert unknown errors to ContainerError
 */
export function toContainerError(error: unknown, defaultMessage: string = 'Unknown error'): ContainerError {
  if (error instanceof ContainerError) {
    return error;
  }

  if (error instanceof Error) {
    const message = error.message;

    // Classify error based on message
    if (message.includes('No such image') || message.includes('pull access denied')) {
      return new ContainerCreationError(message);
    }
    if (message.includes('no such container') || message.includes('container not found')) {
      return new ContainerNotFoundError('unknown', { originalError: message });
    }
    if (message.includes('connect ECONNREFUSED') || message.includes('Cannot connect to the Docker daemon')) {
      return new DockerDaemonError(message);
    }
    if (message.includes('attach') || message.includes('stream')) {
      return new StreamAttachmentError(message);
    }
    if (message.includes('already stopped') || message.includes('not running')) {
      return new ContainerStateError(message);
    }

    // Generic execution error
    return new ContainerExecutionError(message);
  }

  // Unknown error type
  return new ContainerExecutionError(defaultMessage, { originalError: String(error) });
}

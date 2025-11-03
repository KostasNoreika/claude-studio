/**
 * Unit tests for Container Error Classes
 * P03-T009: Container lifecycle error handling
 */

import {
  ContainerError,
  ContainerCreationError,
  ContainerNotFoundError,
  DockerDaemonError,
  StreamAttachmentError,
  ContainerExecutionError,
  ContainerStateError,
  SessionNotFoundError,
  isRetryableError,
  toContainerError,
} from '../../docker/errors';

describe('Container Error Classes', () => {
  describe('ContainerCreationError', () => {
    it('should create error with correct properties', () => {
      const error = new ContainerCreationError('Image not found', { image: 'test:latest' });

      expect(error.name).toBe('ContainerCreationError');
      expect(error.code).toBe('CONTAINER_CREATION_FAILED');
      expect(error.retryable).toBe(false);
      expect(error.context).toEqual({ image: 'test:latest' });
    });

    it('should convert to user-friendly message for image errors', () => {
      const error = new ContainerCreationError('No such image: test:latest');
      expect(error.toUserMessage()).toBe('Container image not available. Please check image configuration.');
    });

    it('should convert to user-friendly message for disk space errors', () => {
      const error = new ContainerCreationError('no space left on device');
      expect(error.toUserMessage()).toBe('Insufficient disk space to create container.');
    });

    it('should convert to user-friendly message for memory errors', () => {
      const error = new ContainerCreationError('insufficient memory');
      expect(error.toUserMessage()).toBe('Insufficient memory to create container.');
    });
  });

  describe('ContainerNotFoundError', () => {
    it('should create error with containerId', () => {
      const error = new ContainerNotFoundError('abc123');

      expect(error.name).toBe('ContainerNotFoundError');
      expect(error.code).toBe('CONTAINER_NOT_FOUND');
      expect(error.retryable).toBe(false);
      expect(error.context).toHaveProperty('containerId', 'abc123');
    });

    it('should have user-friendly message', () => {
      const error = new ContainerNotFoundError('abc123');
      expect(error.toUserMessage()).toBe('Container session has ended. Please start a new session.');
    });
  });

  describe('DockerDaemonError', () => {
    it('should be retryable', () => {
      const error = new DockerDaemonError('Connection refused');
      expect(error.retryable).toBe(true);
    });

    it('should have user-friendly message', () => {
      const error = new DockerDaemonError('Connection refused');
      expect(error.toUserMessage()).toBe('Docker service is temporarily unavailable. Please try again later.');
    });
  });

  describe('StreamAttachmentError', () => {
    it('should not be retryable', () => {
      const error = new StreamAttachmentError('Container not running');
      expect(error.retryable).toBe(false);
    });
  });

  describe('ContainerStateError', () => {
    it('should support custom retryable flag', () => {
      const error1 = new ContainerStateError('Already stopped', false);
      expect(error1.retryable).toBe(false);

      const error2 = new ContainerStateError('Network issue', true);
      expect(error2.retryable).toBe(true);
    });

    it('should have user-friendly message for "already stopped"', () => {
      const error = new ContainerStateError('Container already stopped');
      expect(error.toUserMessage()).toBe('Container has already been stopped.');
    });

    it('should have user-friendly message for "not running"', () => {
      const error = new ContainerStateError('Container is not running');
      expect(error.toUserMessage()).toBe('Container is not running. Please start a new session.');
    });
  });

  describe('isRetryableError', () => {
    it('should identify retryable ContainerError', () => {
      const error = new DockerDaemonError('Connection refused');
      expect(isRetryableError(error)).toBe(true);
    });

    it('should identify non-retryable ContainerError', () => {
      const error = new ContainerNotFoundError('abc123');
      expect(isRetryableError(error)).toBe(false);
    });

    it('should identify retryable connection errors', () => {
      const error = new Error('connect ECONNREFUSED 127.0.0.1:2375');
      expect(isRetryableError(error)).toBe(true);
    });

    it('should identify retryable timeout errors', () => {
      const error = new Error('Request timeout');
      expect(isRetryableError(error)).toBe(true);
    });

    it('should identify non-retryable errors', () => {
      const error = new Error('No such image');
      expect(isRetryableError(error)).toBe(false);
    });
  });

  describe('toContainerError', () => {
    it('should pass through ContainerError unchanged', () => {
      const original = new ContainerNotFoundError('abc123');
      const converted = toContainerError(original);
      expect(converted).toBe(original);
    });

    it('should convert "No such image" to ContainerCreationError', () => {
      const error = new Error('No such image: test:latest');
      const converted = toContainerError(error);
      expect(converted).toBeInstanceOf(ContainerCreationError);
    });

    it('should convert "no such container" to ContainerNotFoundError', () => {
      const error = new Error('no such container: abc123');
      const converted = toContainerError(error);
      expect(converted).toBeInstanceOf(ContainerNotFoundError);
    });

    it('should convert Docker daemon errors', () => {
      const error = new Error('Cannot connect to the Docker daemon');
      const converted = toContainerError(error);
      expect(converted).toBeInstanceOf(DockerDaemonError);
    });

    it('should convert stream errors', () => {
      const error = new Error('Failed to attach to container');
      const converted = toContainerError(error);
      expect(converted).toBeInstanceOf(StreamAttachmentError);
    });

    it('should convert state errors', () => {
      const error = new Error('Container already stopped');
      const converted = toContainerError(error);
      expect(converted).toBeInstanceOf(ContainerStateError);
    });

    it('should handle unknown errors', () => {
      const error = new Error('Unknown error');
      const converted = toContainerError(error);
      expect(converted).toBeInstanceOf(ContainerExecutionError);
    });

    it('should handle non-Error objects', () => {
      const error = 'String error';
      const converted = toContainerError(error);
      expect(converted).toBeInstanceOf(ContainerExecutionError);
      expect(converted.context).toHaveProperty('originalError', 'String error');
    });
  });

  describe('Error logging', () => {
    it('should produce structured log data', () => {
      const error = new ContainerCreationError('Test error', { sessionId: 'test-123' });
      const logData = error.toLogData();

      expect(logData).toHaveProperty('name', 'ContainerCreationError');
      expect(logData).toHaveProperty('message', 'Test error');
      expect(logData).toHaveProperty('code', 'CONTAINER_CREATION_FAILED');
      expect(logData).toHaveProperty('retryable', false);
      expect(logData).toHaveProperty('context', { sessionId: 'test-123' });
      expect(logData).toHaveProperty('stack');
    });
  });
});

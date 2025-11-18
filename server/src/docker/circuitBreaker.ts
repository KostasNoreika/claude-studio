/**
 * Circuit Breaker Pattern Implementation
 * P03-T009: Container lifecycle error handling
 *
 * Prevents cascading failures by stopping calls to a failing service
 * after a threshold is reached, giving it time to recover.
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Too many failures, requests fail fast
 * - HALF_OPEN: Testing if service has recovered
 */

import { logger } from '../utils/logger';

export enum CircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerOptions {
  /**
   * Number of failures before opening circuit
   * Default: 5
   */
  failureThreshold?: number;

  /**
   * Time in ms to wait before attempting recovery (HALF_OPEN)
   * Default: 30000 (30 seconds)
   */
  resetTimeout?: number;

  /**
   * Number of successful requests in HALF_OPEN before closing circuit
   * Default: 2
   */
  successThreshold?: number;

  /**
   * Time window in ms for counting failures
   * Default: 60000 (60 seconds)
   */
  monitoringWindow?: number;

  /**
   * Optional callback when state changes
   */
  onStateChange?: (oldState: CircuitBreakerState, newState: CircuitBreakerState) => void;
}

interface FailureRecord {
  timestamp: number;
  error: Error;
}

/**
 * Circuit Breaker for Docker API calls
 *
 * Usage:
 * ```typescript
 * const breaker = new CircuitBreaker({ failureThreshold: 3 });
 *
 * try {
 *   const result = await breaker.execute(async () => {
 *     return await docker.listContainers();
 *   });
 * } catch (error) {
 *   // Handle error
 * }
 * ```
 */
export class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private nextAttemptTime: number = 0;
  private failures: FailureRecord[] = [];

  private readonly failureThreshold: number;
  private readonly resetTimeout: number;
  private readonly successThreshold: number;
  private readonly monitoringWindow: number;
  private readonly onStateChange?: (oldState: CircuitBreakerState, newState: CircuitBreakerState) => void;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeout = options.resetTimeout ?? 30000;
    this.successThreshold = options.successThreshold ?? 2;
    this.monitoringWindow = options.monitoringWindow ?? 60000;
    this.onStateChange = options.onStateChange;
  }

  /**
   * Execute a function with circuit breaker protection
   */
  public async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check circuit state
    if (this.state === CircuitBreakerState.OPEN) {
      // Check if it's time to attempt recovery
      if (Date.now() >= this.nextAttemptTime) {
        this.transitionTo(CircuitBreakerState.HALF_OPEN);
      } else {
        throw new Error('Circuit breaker is OPEN. Service temporarily unavailable.');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error as Error);
      throw error;
    }
  }

  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this.transitionTo(CircuitBreakerState.CLOSED);
        this.reset();
      }
    } else if (this.state === CircuitBreakerState.CLOSED) {
      // Reset failure count on success
      this.reset();
    }
  }

  /**
   * Handle failed execution
   */
  private onFailure(error: Error): void {
    const now = Date.now();

    // Add failure record
    this.failures.push({ timestamp: now, error });

    // Clean up old failures outside monitoring window
    this.failures = this.failures.filter(
      (f) => now - f.timestamp < this.monitoringWindow
    );

    this.failureCount = this.failures.length;

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      // Failed during recovery, reopen circuit
      this.transitionTo(CircuitBreakerState.OPEN);
      this.nextAttemptTime = now + this.resetTimeout;
    } else if (this.state === CircuitBreakerState.CLOSED) {
      // Check if threshold exceeded
      if (this.failureCount >= this.failureThreshold) {
        this.transitionTo(CircuitBreakerState.OPEN);
        this.nextAttemptTime = now + this.resetTimeout;
      }
    }
  }

  /**
   * Transition to new state
   */
  private transitionTo(newState: CircuitBreakerState): void {
    const oldState = this.state;
    if (oldState !== newState) {
      this.state = newState;
      logger.info('Circuit breaker state transition', {
        oldState,
        newState
      });

      if (this.onStateChange) {
        this.onStateChange(oldState, newState);
      }
    }
  }

  /**
   * Reset circuit breaker counters
   */
  private reset(): void {
    this.failureCount = 0;
    this.successCount = 0;
    this.failures = [];
  }

  /**
   * Get current circuit breaker state
   */
  public getState(): CircuitBreakerState {
    return this.state;
  }

  /**
   * Get current failure count
   */
  public getFailureCount(): number {
    return this.failureCount;
  }

  /**
   * Manually reset circuit breaker (for testing or admin operations)
   */
  public manualReset(): void {
    this.transitionTo(CircuitBreakerState.CLOSED);
    this.reset();
  }

  /**
   * Get circuit breaker metrics
   */
  public getMetrics(): {
    state: CircuitBreakerState;
    failureCount: number;
    successCount: number;
    nextAttemptTime: number | null;
  } {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      nextAttemptTime: this.state === CircuitBreakerState.OPEN ? this.nextAttemptTime : null,
    };
  }
}

/**
 * Global circuit breaker for Docker operations
 * Singleton instance shared across the application
 */
export const dockerCircuitBreaker = new CircuitBreaker({
  failureThreshold: 5,
  resetTimeout: 30000,
  successThreshold: 2,
  monitoringWindow: 60000,
  onStateChange: (oldState, newState) => {
    logger.warn('Docker circuit breaker state change', { oldState, newState });
  },
});

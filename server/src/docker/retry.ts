/**
 * Retry Logic with Exponential Backoff
 * P03-T009: Container lifecycle error handling
 *
 * Provides retry functionality for transient failures
 * with configurable max attempts and exponential backoff.
 */

import { isRetryableError } from './errors';

export interface RetryOptions {
  /**
   * Maximum number of retry attempts
   * Default: 3
   */
  maxRetries?: number;

  /**
   * Initial delay in ms before first retry
   * Default: 1000 (1 second)
   */
  initialDelay?: number;

  /**
   * Maximum delay in ms between retries
   * Default: 10000 (10 seconds)
   */
  maxDelay?: number;

  /**
   * Backoff multiplier for exponential backoff
   * Default: 2
   */
  backoffMultiplier?: number;

  /**
   * Custom function to determine if error is retryable
   * Default: uses isRetryableError
   */
  isRetryable?: (error: unknown) => boolean;

  /**
   * Callback on each retry attempt
   */
  onRetry?: (error: Error, attempt: number, nextDelay: number) => void;
}

/**
 * Execute a function with retry logic
 *
 * @param fn - Async function to execute
 * @param options - Retry configuration
 * @returns Promise resolving to function result
 * @throws Last error if all retries exhausted
 *
 * @example
 * ```typescript
 * const result = await retry(
 *   async () => await docker.ping(),
 *   { maxRetries: 3, initialDelay: 1000 }
 * );
 * ```
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    backoffMultiplier = 2,
    isRetryable = isRetryableError,
    onRetry,
  } = options;

  let lastError: Error | undefined;
  let delay = initialDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if we should retry
      const shouldRetry = attempt < maxRetries && isRetryable(error);

      if (!shouldRetry) {
        throw error;
      }

      // Calculate next delay with exponential backoff
      const nextDelay = Math.min(delay, maxDelay);

      // Call retry callback
      if (onRetry) {
        onRetry(lastError, attempt + 1, nextDelay);
      }

      // Log retry attempt
      console.log(
        `[Retry] Attempt ${attempt + 1}/${maxRetries} failed. Retrying in ${nextDelay}ms...`,
        { error: lastError.message }
      );

      // Wait before retrying
      await sleep(nextDelay);

      // Increase delay for next attempt
      delay = delay * backoffMultiplier;
    }
  }

  // All retries exhausted
  throw lastError || new Error('Unknown error during retry');
}

/**
 * Execute a function with retry logic, wrapping in circuit breaker
 *
 * @param fn - Async function to execute
 * @param retryOptions - Retry configuration
 * @returns Promise resolving to function result
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  retryOptions: RetryOptions = {}
): Promise<T> {
  return retry(fn, {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2,
    ...retryOptions,
  });
}

/**
 * Sleep helper function
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry decorator for class methods
 *
 * @example
 * ```typescript
 * class MyService {
 *   @Retry({ maxRetries: 3 })
 *   async fetchData() {
 *     // ...
 *   }
 * }
 * ```
 */
export function Retry(options: RetryOptions = {}) {
  return function (
    target: unknown,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: unknown[]) {
      return retry(
        async () => originalMethod.apply(this, args),
        options
      );
    };

    return descriptor;
  };
}

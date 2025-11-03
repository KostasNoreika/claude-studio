/**
 * Unit tests for Circuit Breaker
 * P03-T009: Container lifecycle error handling
 */

import { CircuitBreaker, CircuitBreakerState } from '../../docker/circuitBreaker';

describe('CircuitBreaker', () => {
  describe('Basic functionality', () => {
    it('should start in CLOSED state', () => {
      const breaker = new CircuitBreaker();
      expect(breaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('should execute successful functions', async () => {
      const breaker = new CircuitBreaker();
      const result = await breaker.execute(async () => 'success');
      expect(result).toBe('success');
    });

    it('should propagate errors from functions', async () => {
      const breaker = new CircuitBreaker();
      await expect(
        breaker.execute(async () => {
          throw new Error('Test error');
        })
      ).rejects.toThrow('Test error');
    });
  });

  describe('Circuit opening', () => {
    it('should open circuit after threshold failures', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 3 });

      // Cause 3 failures
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('Failure');
          });
        } catch (error) {
          // Expected
        }
      }

      expect(breaker.getState()).toBe(CircuitBreakerState.OPEN);
    });

    it('should fail fast when circuit is OPEN', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 2 });

      // Open the circuit
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('Failure');
          });
        } catch (error) {
          // Expected
        }
      }

      // Circuit should be OPEN
      expect(breaker.getState()).toBe(CircuitBreakerState.OPEN);

      // Next call should fail fast
      await expect(
        breaker.execute(async () => 'success')
      ).rejects.toThrow('Circuit breaker is OPEN');
    });
  });

  describe('Circuit recovery', () => {
    it('should transition to HALF_OPEN after reset timeout', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        resetTimeout: 100, // 100ms
        successThreshold: 1, // Only need 1 success to close
      });

      // Open the circuit
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('Failure');
          });
        } catch (error) {
          // Expected
        }
      }

      expect(breaker.getState()).toBe(CircuitBreakerState.OPEN);

      // Wait for reset timeout
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Next execution should transition to HALF_OPEN then CLOSED after success
      await breaker.execute(async () => 'success');

      expect(breaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('should close circuit after success threshold in HALF_OPEN', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        resetTimeout: 100,
        successThreshold: 2,
      });

      // Open the circuit
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('Failure');
          });
        } catch (error) {
          // Expected
        }
      }

      // Wait for reset timeout
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Execute success threshold number of successes
      for (let i = 0; i < 2; i++) {
        await breaker.execute(async () => 'success');
      }

      expect(breaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('should reopen circuit if failure occurs in HALF_OPEN', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        resetTimeout: 100,
      });

      // Open the circuit
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('Failure');
          });
        } catch (error) {
          // Expected
        }
      }

      // Wait for reset timeout
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Fail during HALF_OPEN
      try {
        await breaker.execute(async () => {
          throw new Error('Failure');
        });
      } catch (error) {
        // Expected
      }

      expect(breaker.getState()).toBe(CircuitBreakerState.OPEN);
    });
  });

  describe('Metrics', () => {
    it('should track failure count', async () => {
      const breaker = new CircuitBreaker();

      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('Failure');
          });
        } catch (error) {
          // Expected
        }
      }

      expect(breaker.getFailureCount()).toBe(3);
    });

    it('should reset failure count after success in CLOSED', async () => {
      const breaker = new CircuitBreaker();

      // Cause failures
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('Failure');
          });
        } catch (error) {
          // Expected
        }
      }

      // Success
      await breaker.execute(async () => 'success');

      expect(breaker.getFailureCount()).toBe(0);
    });

    it('should provide metrics', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 2 });

      // Cause failures to open circuit
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('Failure');
          });
        } catch (error) {
          // Expected
        }
      }

      const metrics = breaker.getMetrics();
      expect(metrics.state).toBe(CircuitBreakerState.OPEN);
      expect(metrics.failureCount).toBe(2);
      expect(metrics.nextAttemptTime).toBeGreaterThan(Date.now());
    });
  });

  describe('Manual reset', () => {
    it('should allow manual reset', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 2 });

      // Open circuit
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('Failure');
          });
        } catch (error) {
          // Expected
        }
      }

      expect(breaker.getState()).toBe(CircuitBreakerState.OPEN);

      // Manual reset
      breaker.manualReset();

      expect(breaker.getState()).toBe(CircuitBreakerState.CLOSED);
      expect(breaker.getFailureCount()).toBe(0);
    });
  });

  describe('State change callback', () => {
    it('should call onStateChange callback', async () => {
      const stateChanges: Array<[CircuitBreakerState, CircuitBreakerState]> = [];

      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        onStateChange: (oldState, newState) => {
          stateChanges.push([oldState, newState]);
        },
      });

      // Open circuit
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('Failure');
          });
        } catch (error) {
          // Expected
        }
      }

      expect(stateChanges).toContainEqual([CircuitBreakerState.CLOSED, CircuitBreakerState.OPEN]);
    });
  });
});

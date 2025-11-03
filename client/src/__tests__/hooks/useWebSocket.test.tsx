/**
 * Tests for useWebSocket Hook
 *
 * Tests the React hook that manages WebSocket connection lifecycle.
 * Covers initialization, state management, and cleanup.
 *
 * Note: These tests run in a jsdom environment where WebSocket connections
 * will fail (no server). This is expected behavior for unit tests.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useWebSocket } from '../../hooks/useWebSocket';

describe('useWebSocket', () => {
  // Track rendered hooks for cleanup
  const rendered: Array<ReturnType<typeof renderHook>> = [];

  afterEach(() => {
    // Clean up all hooks
    rendered.forEach((r) => {
      try {
        r.unmount();
      } catch (e) {
        // Ignore cleanup errors
      }
    });
    rendered.length = 0;
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize and start connecting', () => {
      const hook = renderHook(() => useWebSocket());
      rendered.push(hook);
      const { result } = hook;

      // The hook immediately starts connecting on mount
      // In test environment without server, will be 'connecting' or 'error'
      expect(['disconnected', 'connecting', 'error']).toContain(result.current.connectionStatus);
      expect(result.current.isConnected).toBe(false);
      expect(result.current.sessionId).toBeNull();
      expect(result.current.lastMessage).toBeNull();
    });

    it('should provide send function', () => {
      const hook = renderHook(() => useWebSocket());
      rendered.push(hook);
      const { result } = hook;

      expect(typeof result.current.send).toBe('function');
    });

    it('should provide sendTerminalInput function', () => {
      const hook = renderHook(() => useWebSocket());
      rendered.push(hook);
      const { result } = hook;

      expect(typeof result.current.sendTerminalInput).toBe('function');
    });
  });

  describe('Return Interface', () => {
    it('should return all required properties', () => {
      const hook = renderHook(() => useWebSocket());
      rendered.push(hook);
      const { result } = hook;

      // Check all properties exist
      expect(result.current).toHaveProperty('send');
      expect(result.current).toHaveProperty('sendTerminalInput');
      expect(result.current).toHaveProperty('connectionStatus');
      expect(result.current).toHaveProperty('lastMessage');
      expect(result.current).toHaveProperty('sessionId');
      expect(result.current).toHaveProperty('isConnected');
    });

    it('should have correct types for all properties', () => {
      const hook = renderHook(() => useWebSocket());
      rendered.push(hook);
      const { result } = hook;

      expect(typeof result.current.send).toBe('function');
      expect(typeof result.current.sendTerminalInput).toBe('function');
      expect(typeof result.current.connectionStatus).toBe('string');
      expect(result.current.lastMessage === null || typeof result.current.lastMessage === 'object').toBe(true);
      expect(result.current.sessionId === null || typeof result.current.sessionId === 'string').toBe(true);
      expect(typeof result.current.isConnected).toBe('boolean');
    });
  });

  describe('Derived State', () => {
    it('should derive isConnected from connectionStatus', () => {
      const hook = renderHook(() => useWebSocket());
      rendered.push(hook);
      const { result } = hook;

      // Initially not connected (will be 'connecting' or 'error' in test env)
      expect(['disconnected', 'connecting', 'error']).toContain(result.current.connectionStatus);

      // isConnected should be false unless status is 'connected'
      if (result.current.connectionStatus === 'connected') {
        expect(result.current.isConnected).toBe(true);
      } else {
        expect(result.current.isConnected).toBe(false);
      }
    });
  });

  describe('Custom URL', () => {
    it('should accept custom WebSocket URL', () => {
      const customUrl = 'ws://127.0.0.1:9999';
      const hook = renderHook(() => useWebSocket(customUrl));
      rendered.push(hook);
      const { result } = hook;

      // Should initialize without errors
      expect(result.current).toBeDefined();
      // Connection state can be 'disconnected', 'connecting', or 'error' at initialization
      expect(['disconnected', 'connecting', 'error']).toContain(result.current.connectionStatus);
    });
  });

  describe('Function Stability', () => {
    it('should provide stable send function reference', () => {
      const hook = renderHook(() => useWebSocket());
      rendered.push(hook);
      const { result, rerender } = hook;

      const firstSend = result.current.send;
      rerender();
      const secondSend = result.current.send;

      // Should be the same reference due to useCallback
      expect(firstSend).toBe(secondSend);
    });

    it('should provide stable sendTerminalInput function reference', () => {
      const hook = renderHook(() => useWebSocket());
      rendered.push(hook);
      const { result, rerender } = hook;

      const firstSendTerminalInput = result.current.sendTerminalInput;
      rerender();
      const secondSendTerminalInput = result.current.sendTerminalInput;

      // Should be the same reference due to useCallback
      expect(firstSendTerminalInput).toBe(secondSendTerminalInput);
    });
  });

  describe('Cleanup', () => {
    it('should clean up on unmount without errors', () => {
      const hook = renderHook(() => useWebSocket());
      // Don't add to rendered array - we'll unmount manually

      // Should not throw when unmounting
      expect(() => hook.unmount()).not.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should handle send when not connected', () => {
      const hook = renderHook(() => useWebSocket());
      rendered.push(hook);
      const { result } = hook;

      // Should not throw when calling send before connection
      // (will log a warning to console)
      expect(() => {
        result.current.send({
          type: 'heartbeat',
          timestamp: new Date().toISOString(),
        });
      }).not.toThrow();
    });

    it('should handle sendTerminalInput when not connected', () => {
      const hook = renderHook(() => useWebSocket());
      rendered.push(hook);
      const { result } = hook;

      // Should not throw when calling sendTerminalInput before connection
      // (will log a warning to console)
      expect(() => {
        result.current.sendTerminalInput('test command');
      }).not.toThrow();
    });
  });
});

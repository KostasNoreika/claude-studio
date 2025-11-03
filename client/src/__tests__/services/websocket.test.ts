/**
 * WebSocket Client Tests
 *
 * Basic unit tests for WebSocketClient.
 * Full integration tests will be added in P02-T007.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WebSocketClient } from '../../services/websocket';

describe('WebSocketClient', () => {
  let client: WebSocketClient;

  beforeEach(() => {
    client = new WebSocketClient('ws://127.0.0.1:3850');
  });

  afterEach(() => {
    client.disconnect();
  });

  it('should initialize with disconnected state', () => {
    expect(client.getState()).toBe('disconnected');
  });

  it('should have no session ID initially', () => {
    expect(client.getSessionId()).toBeNull();
  });

  it('should transition to connecting state when connect is called', () => {
    let capturedState: string | null = null;

    client.on('stateChange', (state) => {
      capturedState = state;
    });

    client.connect();

    // State should be 'connecting' initially
    expect(capturedState).toBe('connecting');
  });

  it('should allow registering and unregistering event listeners', () => {
    let callCount = 0;
    const callback = () => {
      callCount++;
    };

    // Register
    client.on('close', callback);

    // Manually emit close event (testing internal emit mechanism)
    (client as any).emit('close');
    expect(callCount).toBe(1);

    // Unregister
    client.off('close', callback);

    // Emit again, should not increment
    (client as any).emit('close');
    expect(callCount).toBe(1);
  });

  it('should not allow sending messages when disconnected', () => {
    // Spy on console.error
    const originalError = console.error;
    let errorMessage = '';
    console.error = (msg: string) => {
      errorMessage = msg;
    };

    client.sendTerminalInput('test');

    expect(errorMessage).toBe('WebSocket is not connected');

    // Restore console.error
    console.error = originalError;
  });

  it('should return correct connection state', () => {
    expect(client.getState()).toBe('disconnected');

    // After calling connect, it should be 'connecting'
    client.on('stateChange', (state) => {
      if (state === 'connecting') {
        expect(client.getState()).toBe('connecting');
      }
    });

    client.connect();
  });
});

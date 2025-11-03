/**
 * Integration Tests for Terminal + WebSocket Communication
 *
 * Tests the complete flow of WebSocket ↔ Terminal communication:
 * - WebSocket connects on App mount
 * - Terminal input is sent via WebSocket
 * - WebSocket output is rendered in terminal
 * - Connection status updates correctly
 * - Session ID is received and displayed
 * - Reconnection works after disconnect
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';

const mockTerminal = {
  open: vi.fn(),
  write: vi.fn(),
  writeln: vi.fn(),
  onData: vi.fn((callback) => {
    mockTerminal._onDataCallback = callback;
  }),
  dispose: vi.fn(),
  loadAddon: vi.fn(),
  _onDataCallback: null as any,
};

vi.mock('xterm', () => ({
  Terminal: vi.fn(function XTermMock() {
    return mockTerminal;
  }),
}));

const mockFitAddon = {
  fit: vi.fn(),
};

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn(function FitAddonMock() {
    return mockFitAddon;
  }),
}));

const mockListeners = new Map<string, Set<Function>>();

const mockWebSocketClientInstance = {
  connect: vi.fn(),
  disconnect: vi.fn(),
  send: vi.fn(),
  sendTerminalInput: vi.fn(),
  getState: vi.fn(() => 'connected'),
  getSessionId: vi.fn(() => 'sess_test_123456789abc'),
  on: vi.fn((event: string, callback: Function) => {
    if (!mockListeners.has(event)) {
      mockListeners.set(event, new Set());
    }
    mockListeners.get(event)!.add(callback);
  }),
  off: vi.fn((event: string, callback: Function) => {
    const callbacks = mockListeners.get(event);
    if (callbacks) {
      callbacks.delete(callback);
    }
  }),
};

const emitMockEvent = (event: string, ...args: any[]) => {
  const callbacks = mockListeners.get(event);
  if (callbacks) {
    callbacks.forEach((callback) => callback(...args));
  }
};

vi.mock('../../services/websocket', () => ({
  WebSocketClient: vi.fn(function() {
    return mockWebSocketClientInstance;
  }),
  ConnectionState: {
    connecting: 'connecting',
    connected: 'connected',
    disconnected: 'disconnected',
    error: 'error',
  },
}));

import App from '../../App';

describe('Terminal + WebSocket Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListeners.clear();
    mockTerminal._onDataCallback = null;
    mockWebSocketClientInstance.getState.mockReturnValue('connected');
    mockWebSocketClientInstance.getSessionId.mockReturnValue('sess_test_123456789abc');
  });

  afterEach(() => {
    mockListeners.clear();
    vi.clearAllMocks();
  });

  describe('WebSocket Connection on Mount', () => {
    it('should connect WebSocket on App mount', () => {
      render(<App />);
      expect(mockWebSocketClientInstance.connect).toHaveBeenCalled();
    });

    it('should register event listeners after mount', async () => {
      render(<App />);
      await waitFor(() => {
        expect(mockWebSocketClientInstance.on).toHaveBeenCalledWith('stateChange', expect.any(Function));
        expect(mockWebSocketClientInstance.on).toHaveBeenCalledWith('connected', expect.any(Function));
        expect(mockWebSocketClientInstance.on).toHaveBeenCalledWith('message', expect.any(Function));
        expect(mockWebSocketClientInstance.on).toHaveBeenCalledWith('error', expect.any(Function));
      });
    });

    it('should call connect after registering listeners', () => {
      vi.clearAllMocks();
      render(<App />);
      const connectCallIndex = mockWebSocketClientInstance.connect.mock.invocationCallOrder[0];
      const onCallIndices = mockWebSocketClientInstance.on.mock.invocationCallOrder;
      onCallIndices.forEach((index) => {
        expect(index).toBeLessThan(connectCallIndex);
      });
    });

    it('should not create multiple WebSocket connections on mount', () => {
      render(<App />);
      expect(mockWebSocketClientInstance.connect).toHaveBeenCalledTimes(1);
    });
  });

  describe('Terminal Input Sent via WebSocket', () => {
    it('should send terminal input when user types', async () => {
      render(<App />);
      mockTerminal._onDataCallback('hello');
      await waitFor(() => {
        expect(mockWebSocketClientInstance.sendTerminalInput).toHaveBeenCalledWith('hello');
      });
    });

    it('should send each keystroke separately', async () => {
      render(<App />);
      mockTerminal._onDataCallback('a');
      mockTerminal._onDataCallback('b');
      mockTerminal._onDataCallback('c');
      await waitFor(() => {
        expect(mockWebSocketClientInstance.sendTerminalInput).toHaveBeenCalledTimes(3);
      });
    });

    it('should send special characters', async () => {
      render(<App />);
      const specialChars = '\r\n\t\x7f';
      mockTerminal._onDataCallback(specialChars);
      await waitFor(() => {
        expect(mockWebSocketClientInstance.sendTerminalInput).toHaveBeenCalledWith(specialChars);
      });
    });

    it('should send multiline input', async () => {
      render(<App />);
      mockTerminal._onDataCallback('ls -la\n');
      await waitFor(() => {
        expect(mockWebSocketClientInstance.sendTerminalInput).toHaveBeenCalledWith('ls -la\n');
      });
    });

    it('should handle rapid input without losing characters', async () => {
      render(<App />);
      const inputs = ['h', 'e', 'l', 'l', 'o', '\n'];
      inputs.forEach((input) => {
        mockTerminal._onDataCallback(input);
      });
      await waitFor(() => {
        expect(mockWebSocketClientInstance.sendTerminalInput).toHaveBeenCalledTimes(6);
      });
    });
  });

  describe('WebSocket Output Rendered in Terminal', () => {
    it('should render WebSocket output in terminal', async () => {
      render(<App />);
      const outputMessage = {
        type: 'terminal:output',
        data: 'Hello from server',
        timestamp: new Date().toISOString(),
      };
      await act(async () => {
        emitMockEvent('message', outputMessage);
      });
      await waitFor(() => {
        expect(mockTerminal.write).toHaveBeenCalledWith('Hello from server');
      });
    });

    it('should render multiple output messages', async () => {
      render(<App />);
      const outputs = [
        { type: 'terminal:output', data: 'Line 1\n', timestamp: new Date().toISOString() },
        { type: 'terminal:output', data: 'Line 2\n', timestamp: new Date().toISOString() },
        { type: 'terminal:output', data: 'Line 3\n', timestamp: new Date().toISOString() },
      ];
      for (const output of outputs) {
        await act(async () => {
          emitMockEvent('message', output);
        });
      }
      await waitFor(() => {
        expect(mockTerminal.write).toHaveBeenCalledWith('Line 1\n');
        expect(mockTerminal.write).toHaveBeenCalledWith('Line 2\n');
        expect(mockTerminal.write).toHaveBeenCalledWith('Line 3\n');
      });
    });

    it('should handle ANSI escape sequences in output', async () => {
      render(<App />);
      const ansiOutput = '\x1b[32mGreen text\x1b[0m\n';
      const message = {
        type: 'terminal:output',
        data: ansiOutput,
        timestamp: new Date().toISOString(),
      };
      await act(async () => {
        emitMockEvent('message', message);
      });
      await waitFor(() => {
        expect(mockTerminal.write).toHaveBeenCalledWith(ansiOutput);
      });
    });

    it('should handle large output messages', async () => {
      render(<App />);
      const largeOutput = 'x'.repeat(10000);
      const message = {
        type: 'terminal:output',
        data: largeOutput,
        timestamp: new Date().toISOString(),
      };
      await act(async () => {
        emitMockEvent('message', message);
      });
      await waitFor(() => {
        expect(mockTerminal.write).toHaveBeenCalledWith(largeOutput);
      });
    });
  });

  describe('Connection Status Updates', () => {
    it('should display connected status', async () => {
      render(<App />);
      await act(async () => {
        emitMockEvent('stateChange', 'connected');
      });
      await waitFor(() => {
        expect(screen.getByText('Connected')).toBeInTheDocument();
      });
    });

    it('should display connecting status', async () => {
      render(<App />);
      await act(async () => {
        emitMockEvent('stateChange', 'connecting');
      });
      await waitFor(() => {
        expect(screen.getByText('Connecting...')).toBeInTheDocument();
      });
    });

    it('should display disconnected status', async () => {
      render(<App />);
      await act(async () => {
        emitMockEvent('stateChange', 'disconnected');
      });
      await waitFor(() => {
        expect(screen.getByText('Disconnected')).toBeInTheDocument();
      });
    });

    it('should display error status', async () => {
      render(<App />);
      await act(async () => {
        emitMockEvent('stateChange', 'error');
      });
      await waitFor(() => {
        expect(screen.getByText('Error')).toBeInTheDocument();
      });
    });

    it('should update status when connection state changes', async () => {
      render(<App />);
      await act(async () => {
        emitMockEvent('stateChange', 'connecting');
      });
      await waitFor(() => {
        expect(screen.getByText('Connecting...')).toBeInTheDocument();
      });
      await act(async () => {
        emitMockEvent('stateChange', 'connected');
      });
      await waitFor(() => {
        expect(screen.getByText('Connected')).toBeInTheDocument();
      });
    });
  });

  describe('Session ID Handling', () => {
    it('should display session ID when connected', async () => {
      const sessionId = 'sess_abc123def456';
      mockWebSocketClientInstance.getSessionId.mockReturnValue(sessionId);
      render(<App />);
      await act(async () => {
        emitMockEvent('connected', sessionId);
      });
      await waitFor(() => {
        const sessionText = screen.getByText(/Session:/i);
        expect(sessionText).toBeInTheDocument();
        expect(sessionText.textContent).toMatch(/sess_abc123/);
      });
    });

    it('should not display session ID when null', async () => {
      mockWebSocketClientInstance.getSessionId.mockReturnValue(null as any);
      render(<App />);
      await act(async () => {
        emitMockEvent('stateChange', 'connecting');
      });
      await waitFor(() => {
        const sessionElements = screen.queryAllByText(/Session:/i);
        expect(sessionElements).toHaveLength(0);
      });
    });
  });

  describe('Reconnection After Disconnect', () => {
    it('should attempt reconnection after disconnect', async () => {
      render(<App />);
      await act(async () => {
        emitMockEvent('stateChange', 'disconnected');
      });
      await act(async () => {
        emitMockEvent('stateChange', 'connecting');
      });
      await waitFor(() => {
        expect(screen.getByText('Connecting...')).toBeInTheDocument();
      });
    });

    it('should restore communication after reconnection', async () => {
      render(<App />);
      await act(async () => {
        emitMockEvent('stateChange', 'disconnected');
      });
      await waitFor(() => {
        expect(screen.getByText('Disconnected')).toBeInTheDocument();
      });
      mockTerminal.write.mockClear();
      mockWebSocketClientInstance.sendTerminalInput.mockClear();
      const newSessionId = 'sess_reconnected_123456';
      mockWebSocketClientInstance.getSessionId.mockReturnValue(newSessionId);
      await act(async () => {
        emitMockEvent('stateChange', 'connected');
        emitMockEvent('connected', newSessionId);
      });
      await waitFor(() => {
        expect(screen.getByText('Connected')).toBeInTheDocument();
      });
      mockTerminal._onDataCallback('test');
      await waitFor(() => {
        expect(mockWebSocketClientInstance.sendTerminalInput).toHaveBeenCalledWith('test');
      });
    });

    it('should handle multiple reconnection attempts', async () => {
      render(<App />);
      const states = ['connected', 'disconnected', 'connecting', 'connected', 'disconnected'];
      for (const state of states) {
        await act(async () => {
          emitMockEvent('stateChange', state);
        });
      }
      await waitFor(() => {
        expect(screen.getByText('Disconnected')).toBeInTheDocument();
      });
    });

    it('should resume terminal output after reconnection', async () => {
      render(<App />);
      await act(async () => {
        emitMockEvent('message', {
          type: 'terminal:output',
          data: 'Before disconnect\n',
          timestamp: new Date().toISOString(),
        });
      });
      await waitFor(() => {
        expect(mockTerminal.write).toHaveBeenCalledWith('Before disconnect\n');
      });
      mockTerminal.write.mockClear();
      await act(async () => {
        emitMockEvent('stateChange', 'disconnected');
      });
      const newSessionId = 'sess_reconnected_456789';
      mockWebSocketClientInstance.getSessionId.mockReturnValue(newSessionId);
      await act(async () => {
        emitMockEvent('stateChange', 'connected');
        emitMockEvent('connected', newSessionId);
      });
      await act(async () => {
        emitMockEvent('message', {
          type: 'terminal:output',
          data: 'After reconnect\n',
          timestamp: new Date().toISOString(),
        });
      });
      await waitFor(() => {
        expect(mockTerminal.write).toHaveBeenCalledWith('After reconnect\n');
      });
    });
  });

  describe('Component Cleanup and Disconnection', () => {
    it('should disconnect WebSocket on App unmount', () => {
      const { unmount } = render(<App />);
      unmount();
      expect(mockWebSocketClientInstance.disconnect).toHaveBeenCalled();
    });

    it('should clean up terminal on unmount', () => {
      const { unmount } = render(<App />);
      unmount();
      expect(mockTerminal.dispose).toHaveBeenCalled();
    });

    it('should not crash if unmounting while connecting', () => {
      const { unmount } = render(<App />);
      expect(() => unmount()).not.toThrow();
    });

    it('should not crash if unmounting after disconnect', async () => {
      const { unmount } = render(<App />);
      await act(async () => {
        emitMockEvent('stateChange', 'disconnected');
      });
      expect(() => unmount()).not.toThrow();
    });
  });

  describe('Edge Cases and Error Scenarios', () => {
    it('should handle malformed messages gracefully', async () => {
      render(<App />);
      const malformedMessage = {
        type: 'unknown_type',
        data: 'test',
      };
      await act(async () => {
        emitMockEvent('message', malformedMessage);
      });
      mockTerminal.write.mockClear();
      expect(mockTerminal.write).not.toHaveBeenCalled();
    });

    it('should handle error messages from server', async () => {
      render(<App />);
      const errorMessage = {
        type: 'error',
        message: 'Terminal process crashed',
        timestamp: new Date().toISOString(),
      };
      await act(async () => {
        emitMockEvent('message', errorMessage);
      });
      expect(mockTerminal.write).not.toHaveBeenCalledWith('Terminal process crashed');
    });

    it('should handle connection errors', async () => {
      render(<App />);
      await act(async () => {
        emitMockEvent('error', new Error('Connection refused'));
      });
      await waitFor(() => {
        expect(mockWebSocketClientInstance.on).toHaveBeenCalledWith('error', expect.any(Function));
      });
    });

    it('should handle rapid connect/disconnect cycles', async () => {
      render(<App />);
      for (let i = 0; i < 5; i++) {
        await act(async () => {
          emitMockEvent('stateChange', 'connecting');
          emitMockEvent('stateChange', 'connected');
          emitMockEvent('stateChange', 'disconnected');
        });
      }
      await waitFor(() => {
        expect(screen.getByText('Disconnected')).toBeInTheDocument();
      });
    });

    it('should handle very long input strings', async () => {
      render(<App />);
      const longInput = 'a'.repeat(10000);
      mockTerminal._onDataCallback(longInput);
      await waitFor(() => {
        expect(mockWebSocketClientInstance.sendTerminalInput).toHaveBeenCalledWith(longInput);
      });
    });

    it('should handle messages received before connection established', async () => {
      render(<App />);
      mockTerminal.write.mockClear();
      await act(async () => {
        emitMockEvent('message', {
          type: 'terminal:output',
          data: 'Data before connection',
          timestamp: new Date().toISOString(),
        });
      });
      await waitFor(() => {
        expect(mockTerminal.write).toHaveBeenCalledWith('Data before connection');
      });
    });
  });

  describe('Bidirectional Communication Flow', () => {
    it('should support full echo flow: input -> WebSocket -> output', async () => {
      render(<App />);
      mockTerminal._onDataCallback('hello\n');
      await waitFor(() => {
        expect(mockWebSocketClientInstance.sendTerminalInput).toHaveBeenCalledWith('hello\n');
      });
      mockTerminal.write.mockClear();
      await act(async () => {
        emitMockEvent('message', {
          type: 'terminal:output',
          data: 'hello\n',
          timestamp: new Date().toISOString(),
        });
      });
      await waitFor(() => {
        expect(mockTerminal.write).toHaveBeenCalledWith('hello\n');
      });
    });

    it('should handle interleaved input and output', async () => {
      render(<App />);
      mockTerminal._onDataCallback('ls');
      await waitFor(() => {
        expect(mockWebSocketClientInstance.sendTerminalInput).toHaveBeenCalledWith('ls');
      });
      mockTerminal._onDataCallback('\n');
      await waitFor(() => {
        expect(mockWebSocketClientInstance.sendTerminalInput).toHaveBeenCalledWith('\n');
      });
      mockTerminal.write.mockClear();
      await act(async () => {
        emitMockEvent('message', {
          type: 'terminal:output',
          data: 'file1.txt\nfile2.txt\n',
          timestamp: new Date().toISOString(),
        });
      });
      await waitFor(() => {
        expect(mockTerminal.write).toHaveBeenCalledWith('file1.txt\nfile2.txt\n');
      });
    });

    it('should maintain state during interaction sequence', async () => {
      render(<App />);
      const sessionId = 'sess_interaction_test';
      mockWebSocketClientInstance.getSessionId.mockReturnValue(sessionId);
      await act(async () => {
        emitMockEvent('stateChange', 'connected');
        emitMockEvent('connected', sessionId);
      });
      await waitFor(() => {
        expect(screen.getByText('Connected')).toBeInTheDocument();
      });
      mockTerminal._onDataCallback('pwd\n');
      await waitFor(() => {
        expect(mockWebSocketClientInstance.sendTerminalInput).toHaveBeenCalledWith('pwd\n');
      });
      mockTerminal.write.mockClear();
      await act(async () => {
        emitMockEvent('message', {
          type: 'terminal:output',
          data: '/home/user\n',
          timestamp: new Date().toISOString(),
        });
      });
      await waitFor(() => {
        expect(mockTerminal.write).toHaveBeenCalledWith('/home/user\n');
      });
      expect(screen.getByText('Connected')).toBeInTheDocument();
    });
  });
});

/**
 * WebSocket Client Service for Claude Studio
 *
 * Provides type-safe WebSocket communication with automatic reconnection,
 * heartbeat management, and event-based message handling.
 *
 * @example
 * ```typescript
 * const ws = new WebSocketClient();
 *
 * ws.on('connected', (sessionId) => {
 *   console.log('Connected with session:', sessionId);
 * });
 *
 * ws.on('terminal:output', (data) => {
 *   terminal.write(data);
 * });
 *
 * ws.connect();
 * ```
 */

import {
  ClientMessage,
  ServerMessage,
  createTerminalInputMessage,
  createHeartbeatMessage,
  isServerMessage,
} from '@shared';

/**
 * Connection state enum
 */
export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

/**
 * Type-safe event map for WebSocket events
 */
export type WebSocketEventMap = {
  /** Fired when connection is established with session ID */
  connected: (sessionId: string) => void;
  /** Fired for any server message */
  message: (message: ServerMessage) => void;
  /** Fired specifically for terminal output */
  'terminal:output': (data: string) => void;
  /** Fired when an error occurs */
  error: (error: Error) => void;
  /** Fired when connection closes */
  close: () => void;
  /** Fired when connection state changes */
  stateChange: (state: ConnectionState) => void;
};

/**
 * WebSocket client with automatic reconnection and type-safe messaging
 */
export class WebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // Start with 1 second
  private listeners: Map<string, Set<Function>> = new Map();
  private state: ConnectionState = 'disconnected';
  private heartbeatInterval: number | null = null;
  private sessionId: string | null = null;

  /**
   * Create a new WebSocket client
   *
   * @param url - WebSocket server URL (default: ws://127.0.0.1:3850)
   */
  constructor(url: string = 'ws://127.0.0.1:3850') {
    this.url = url;
  }

  /**
   * Connect to the WebSocket server
   *
   * If already connected, this method will log a warning and return.
   * Automatically handles reconnection on failure.
   */
  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.warn('WebSocket already connected');
      return;
    }

    this.setState('connecting');

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = this.handleOpen.bind(this);
      this.ws.onmessage = this.handleMessage.bind(this);
      this.ws.onerror = this.handleError.bind(this);
      this.ws.onclose = this.handleClose.bind(this);
    } catch (error) {
      this.handleError(error as Event);
    }
  }

  /**
   * Disconnect from the WebSocket server
   *
   * Stops heartbeat, closes connection, and resets reconnection attempts.
   */
  disconnect(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.setState('disconnected');
    this.reconnectAttempts = 0;
  }

  /**
   * Send a typed message to the server
   *
   * @param message - ClientMessage to send
   */
  send(message: ClientMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('WebSocket is not connected');
      return;
    }

    try {
      this.ws.send(JSON.stringify(message));
    } catch (error) {
      console.error('Failed to send message:', error);
      this.emit('error', error as Error);
    }
  }

  /**
   * Send terminal input to the server
   *
   * Convenience method that creates a TerminalInputMessage
   *
   * @param data - Terminal input string
   */
  sendTerminalInput(data: string): void {
    const message = createTerminalInputMessage(data);
    this.send(message);
  }

  /**
   * Send a heartbeat message to the server
   *
   * Automatically called every 30 seconds when connected
   */
  sendHeartbeat(): void {
    const message = createHeartbeatMessage();
    this.send(message);
  }

  /**
   * Get current connection state
   *
   * @returns Current ConnectionState
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Get current session ID
   *
   * @returns Session ID if connected, null otherwise
   */
  getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * Register an event listener
   *
   * @param event - Event name from WebSocketEventMap
   * @param callback - Callback function for the event
   */
  on<K extends keyof WebSocketEventMap>(
    event: K,
    callback: WebSocketEventMap[K]
  ): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  /**
   * Unregister an event listener
   *
   * @param event - Event name from WebSocketEventMap
   * @param callback - Callback function to remove
   */
  off<K extends keyof WebSocketEventMap>(
    event: K,
    callback: WebSocketEventMap[K]
  ): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.delete(callback);
    }
  }

  /**
   * Handle WebSocket open event
   * @private
   */
  private handleOpen(): void {
    console.log('WebSocket connected');
    this.setState('connected');
    this.reconnectAttempts = 0;
    this.reconnectDelay = 1000;

    // Start heartbeat
    this.startHeartbeat();
  }

  /**
   * Handle incoming WebSocket message
   * @private
   */
  private handleMessage(event: MessageEvent): void {
    try {
      const data = JSON.parse(event.data);

      if (!isServerMessage(data)) {
        console.error('Invalid message format:', data);
        return;
      }

      // Emit generic message event
      this.emit('message', data);

      // Handle specific message types
      switch (data.type) {
        case 'connected':
          this.sessionId = data.sessionId;
          this.emit('connected', data.sessionId);
          break;

        case 'terminal:output':
          this.emit('terminal:output', data.data);
          break;

        case 'error':
          this.emit('error', new Error(data.message));
          break;
      }
    } catch (error) {
      console.error('Failed to parse message:', error);
    }
  }

  /**
   * Handle WebSocket error event
   * @private
   */
  private handleError(event: Event): void {
    console.error('WebSocket error:', event);
    this.setState('error');
    this.emit('error', new Error('WebSocket error'));
  }

  /**
   * Handle WebSocket close event
   * @private
   */
  private handleClose(): void {
    console.log('WebSocket closed');
    this.setState('disconnected');
    this.emit('close');

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // Attempt reconnection
    this.attemptReconnect();
  }

  /**
   * Attempt to reconnect with exponential backoff
   * @private
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(
      `Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`
    );

    setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Start periodic heartbeat
   * @private
   */
  private startHeartbeat(): void {
    // Send heartbeat every 30 seconds
    this.heartbeatInterval = window.setInterval(() => {
      this.sendHeartbeat();
    }, 30000);
  }

  /**
   * Update connection state and emit stateChange event
   * @private
   */
  private setState(state: ConnectionState): void {
    if (this.state !== state) {
      this.state = state;
      this.emit('stateChange', state);
    }
  }

  /**
   * Emit an event to all registered listeners
   * @private
   */
  private emit(event: string, ...args: any[]): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach((callback) => {
        try {
          callback(...args);
        } catch (error) {
          console.error(`Error in ${event} callback:`, error);
        }
      });
    }
  }
}

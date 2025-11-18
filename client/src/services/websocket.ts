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
  /** Fired when authentication fails (401 Unauthorized) */
  authError: (error: Error) => void;
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
  private authToken: string | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // Start with 1 second
  private listeners: Map<string, Set<Function>> = new Map();
  private state: ConnectionState = 'disconnected';
  private heartbeatInterval: number | null = null;
  private sessionId: string | null = null;
  private shouldReconnect = true; // Flag to prevent reconnection on intentional disconnect
  private authFailed = false; // Flag to prevent reconnection on auth failure

  /**
   * Create a new WebSocket client
   *
   * @param url - WebSocket server URL (default: from VITE_WS_URL env or auto-detected from window.location)
   * @param token - Authentication token (default: from VITE_WS_AUTH_TOKEN env)
   */
  constructor(url?: string, token?: string) {
    // Auto-detect protocol based on page protocol (https -> wss, http -> ws)
    if (!url) {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      url = `${protocol}//${host}/ws`;
    }

    // Get authentication token from parameter or environment
    this.authToken = token || import.meta.env.VITE_WS_AUTH_TOKEN || null;

    // CRITICAL SECURITY FIX (CRITICAL-002): Enforce token presence in production
    // Remove hardcoded fallback token to prevent unauthorized access
    if (!this.authToken && import.meta.env.PROD) {
      throw new Error(
        'VITE_WS_AUTH_TOKEN must be set in production builds. ' +
        'Configure this environment variable with a secure token matching the server\'s WS_AUTH_TOKEN.'
      );
    }

    // Development-only fallback with explicit warning
    if (!this.authToken && !import.meta.env.PROD) {
      console.warn(
        '[WebSocket] No authentication token configured in development. ' +
        'Using default development token. Set VITE_WS_AUTH_TOKEN for production-like testing.'
      );
      this.authToken = 'dev-token-12345';
    }

    // Append authentication token to URL
    const urlObj = new URL(url, window.location.origin);
    urlObj.searchParams.set('token', this.authToken!);
    this.url = urlObj.toString();

    console.log('[WebSocket] Client created with URL:', url, '(token appended)');
  }

  /**
   * Connect to the WebSocket server
   *
   * If already connected, this method will log a warning and return.
   * Automatically handles reconnection on failure unless auth fails.
   */
  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.warn('WebSocket already connected');
      return;
    }

    // Don't reconnect if authentication previously failed
    if (this.authFailed) {
      console.error('[WebSocket] Cannot reconnect: authentication failed. Check WS_AUTH_TOKEN configuration.');
      return;
    }

    // Enable reconnection when explicitly connecting
    this.shouldReconnect = true;
    this.setState('connecting');

    try {
      console.log('[WebSocket] Attempting to connect to:', this.url);
      this.ws = new WebSocket(this.url);

      this.ws.onopen = this.handleOpen.bind(this);
      this.ws.onmessage = this.handleMessage.bind(this);
      this.ws.onerror = this.handleError.bind(this);
      this.ws.onclose = (event: CloseEvent) => this.handleClose(event);
    } catch (error) {
      console.error('[WebSocket] Connection error:', error);
      this.handleError(error as Event);
    }
  }

  /**
   * Disconnect from the WebSocket server
   *
   * Stops heartbeat, closes connection, and resets reconnection attempts.
   * Sets shouldReconnect to false to prevent automatic reconnection.
   */
  disconnect(): void {
    // Prevent automatic reconnection on intentional disconnect
    this.shouldReconnect = false;

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
      console.error('[WebSocket] Cannot send - not connected. State:', this.ws?.readyState);
      return;
    }

    try {
      const payload = JSON.stringify(message);
      console.log('[WebSocket] Sending message:', message.type, 'payload length:', payload.length);
      this.ws.send(payload);
    } catch (error) {
      console.error('[WebSocket] Failed to send message:', error);
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
    console.log('[WebSocket] sendTerminalInput called, data length:', data.length, 'charCode:', data.charCodeAt(0));
    const message = createTerminalInputMessage(data);
    console.log('[WebSocket] Created message:', message);
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
    console.log('[WebSocket] Connection opened successfully');
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
        console.error('[WebSocket] Invalid message format:', data);
        return;
      }

      console.log('[WebSocket] Message received:', data.type);

      // Emit generic message event
      this.emit('message', data);

      // Handle specific message types
      switch (data.type) {
        case 'connected':
          this.sessionId = data.sessionId;
          console.log('[WebSocket] Session ID received:', this.sessionId);
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
      console.error('[WebSocket] Failed to parse message:', error);
    }
  }

  /**
   * Handle WebSocket error event
   * @private
   */
  private handleError(event: Event): void {
    console.error('[WebSocket] Error event:', event);
    this.setState('error');
    this.emit('error', new Error('WebSocket error'));
  }

  /**
   * Handle WebSocket close event
   * @private
   */
  private handleClose(event: CloseEvent): void {
    console.log('[WebSocket] Connection closed. Code:', event.code, 'Reason:', event.reason);

    // Check for authentication failure (401 Unauthorized)
    // WebSocket close code 1008 indicates policy violation (used for auth failures)
    // Some servers may use 4401 (custom code for 401)
    if (event.code === 1008 || event.code === 4401 || event.reason?.includes('401') || event.reason?.includes('Unauthorized')) {
      this.authFailed = true;
      this.shouldReconnect = false;
      this.setState('error');

      const authError = new Error(
        'Authentication failed. Check WS_AUTH_TOKEN configuration. ' +
        'The token in VITE_WS_AUTH_TOKEN must match the server\'s WS_AUTH_TOKEN.'
      );

      console.error('[WebSocket] Authentication failed:', authError.message);
      this.emit('authError', authError);
      this.emit('error', authError);
      this.emit('close');
      return;
    }

    this.setState('disconnected');
    this.emit('close');

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // Only attempt reconnection if not intentionally disconnected and auth didn't fail
    if (this.shouldReconnect && !this.authFailed) {
      this.attemptReconnect();
    }
  }

  /**
   * Attempt to reconnect with exponential backoff
   * @private
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[WebSocket] Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(
      `[WebSocket] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`
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
      console.log('[WebSocket] State change:', this.state, '->', state);
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
          console.error(`[WebSocket] Error in ${event} callback:`, error);
        }
      });
    }
  }
}

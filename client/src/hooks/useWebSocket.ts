/**
 * useWebSocket Hook for Claude Studio
 *
 * Custom React hook that manages WebSocket connection lifecycle with React 19 support.
 * Provides type-safe messaging, automatic connection management, and stable references
 * to prevent unnecessary re-renders.
 *
 * Features:
 * - Automatic connection on mount
 * - Automatic cleanup on unmount
 * - React 19 concurrent features compatible
 * - Stable function references via useCallback
 * - Type-safe message handling
 *
 * @example
 * ```typescript
 * function App() {
 *   const {
 *     sendTerminalInput,
 *     connectionStatus,
 *     lastMessage,
 *     sessionId,
 *     isConnected,
 *   } = useWebSocket();
 *
 *   useEffect(() => {
 *     if (lastMessage?.type === 'terminal:output') {
 *       console.log('Terminal output:', lastMessage.data);
 *     }
 *   }, [lastMessage]);
 *
 *   return (
 *     <div>
 *       <div>Status: {connectionStatus}</div>
 *       <div>Session: {sessionId || 'Not connected'}</div>
 *     </div>
 *   );
 * }
 * ```
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { WebSocketClient, ConnectionState } from '../services/websocket';
import { ClientMessage, ServerMessage } from '@shared';

/**
 * Return type for useWebSocket hook
 *
 * Provides all necessary state and functions for WebSocket communication
 */
export interface UseWebSocketReturn {
  /** Send a typed message to the server */
  send: (message: ClientMessage) => void;
  /** Convenience method to send terminal input */
  sendTerminalInput: (data: string) => void;
  /** Current connection state */
  connectionStatus: ConnectionState;
  /** Last message received from server */
  lastMessage: ServerMessage | null;
  /** Current session ID (null if not connected) */
  sessionId: string | null;
  /** Derived state: true if connectionStatus === 'connected' */
  isConnected: boolean;
}

/**
 * Custom React hook for managing WebSocket connection
 *
 * This hook manages the complete lifecycle of a WebSocket connection:
 * - Creates connection on mount
 * - Cleans up on unmount
 * - Re-initializes if URL changes
 * - Provides stable function references
 *
 * Compatible with React 19 concurrent features and Strict Mode.
 *
 * @param url - WebSocket server URL (default: ws://127.0.0.1:3850)
 * @returns UseWebSocketReturn object with connection state and methods
 */
export function useWebSocket(url?: string): UseWebSocketReturn {
  // State management
  const [connectionStatus, setConnectionStatus] = useState<ConnectionState>('disconnected');
  const [lastMessage, setLastMessage] = useState<ServerMessage | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Use ref to maintain stable WebSocket instance across renders
  // This prevents re-creating the WebSocket on every render
  const wsRef = useRef<WebSocketClient | null>(null);

  // Initialize WebSocket connection
  useEffect(() => {
    // Create WebSocket client instance
    const ws = new WebSocketClient(url);
    wsRef.current = ws;

    // Set up event listeners
    // These listeners update React state when WebSocket events occur

    // Connection state changes
    ws.on('stateChange', (state) => {
      setConnectionStatus(state);
    });

    // Connection established with session ID
    ws.on('connected', (id) => {
      setSessionId(id);
    });

    // Message received from server
    ws.on('message', (message) => {
      setLastMessage(message);
    });

    // Error occurred
    ws.on('error', (error) => {
      console.error('WebSocket error in hook:', error);
    });

    // Connect to the server
    ws.connect();

    // Cleanup function: disconnect when component unmounts
    // This is critical for React 19 Strict Mode and prevents memory leaks
    return () => {
      ws.disconnect();
      wsRef.current = null;
    };
  }, [url]); // Re-initialize if URL changes

  /**
   * Send a typed message to the server
   *
   * Uses useCallback to provide a stable reference, preventing
   * unnecessary re-renders in child components that depend on this function.
   */
  const send = useCallback((message: ClientMessage) => {
    if (wsRef.current) {
      wsRef.current.send(message);
    } else {
      console.warn('WebSocket not initialized');
    }
  }, []);

  /**
   * Send terminal input to the server
   *
   * Convenience method that wraps the terminal:input message creation.
   * Uses useCallback for stable reference.
   */
  const sendTerminalInput = useCallback((data: string) => {
    if (wsRef.current) {
      wsRef.current.sendTerminalInput(data);
    } else {
      console.warn('WebSocket not initialized');
    }
  }, []);

  // Derived state: isConnected
  // Provides a boolean convenience property
  const isConnected = connectionStatus === 'connected';

  return {
    send,
    sendTerminalInput,
    connectionStatus,
    lastMessage,
    sessionId,
    isConnected,
  };
}

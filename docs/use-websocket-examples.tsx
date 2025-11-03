/**
 * Usage Examples for useWebSocket Hook
 *
 * This file demonstrates various ways to use the useWebSocket hook
 * in React components. These examples are for documentation purposes.
 */

import { useEffect } from 'react';
import { useWebSocket } from './useWebSocket';

/**
 * Example 1: Basic Usage
 *
 * Simple component that connects to WebSocket and displays connection status.
 */
export function BasicExample() {
  const { connectionStatus, sessionId, isConnected } = useWebSocket();

  return (
    <div>
      <h2>WebSocket Status</h2>
      <p>Connection: {connectionStatus}</p>
      <p>Connected: {isConnected ? 'Yes' : 'No'}</p>
      <p>Session ID: {sessionId || 'Not connected'}</p>
    </div>
  );
}

/**
 * Example 2: Sending Terminal Input
 *
 * Component that sends user input to the terminal via WebSocket.
 */
export function TerminalInputExample() {
  const { sendTerminalInput, isConnected } = useWebSocket();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const command = formData.get('command') as string;

    if (command && isConnected) {
      sendTerminalInput(command + '\n');
      e.currentTarget.reset();
    }
  };

  return (
    <div>
      <h2>Send Command</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          name="command"
          placeholder="Enter command..."
          disabled={!isConnected}
        />
        <button type="submit" disabled={!isConnected}>
          Send
        </button>
      </form>
      <p>{isConnected ? 'Ready to send' : 'Waiting for connection...'}</p>
    </div>
  );
}

/**
 * Example 3: Receiving Messages
 *
 * Component that listens for server messages and displays them.
 */
export function MessageListenerExample() {
  const { lastMessage, connectionStatus } = useWebSocket();

  useEffect(() => {
    if (lastMessage) {
      console.log('Received message:', lastMessage);

      // Handle different message types
      switch (lastMessage.type) {
        case 'terminal:output':
          console.log('Terminal output:', lastMessage.data);
          break;
        case 'connected':
          console.log('Connected with session:', lastMessage.sessionId);
          break;
        case 'error':
          console.error('Server error:', lastMessage.message);
          break;
      }
    }
  }, [lastMessage]);

  return (
    <div>
      <h2>Message Listener</h2>
      <p>Status: {connectionStatus}</p>
      {lastMessage && (
        <div>
          <h3>Last Message:</h3>
          <pre>{JSON.stringify(lastMessage, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

/**
 * Example 4: Custom URL
 *
 * Component that connects to a custom WebSocket URL.
 */
export function CustomUrlExample() {
  const customUrl = 'ws://127.0.0.1:9999';
  const { connectionStatus, isConnected } = useWebSocket(customUrl);

  return (
    <div>
      <h2>Custom URL Connection</h2>
      <p>URL: {customUrl}</p>
      <p>Status: {connectionStatus}</p>
      <p>Connected: {isConnected ? 'Yes' : 'No'}</p>
    </div>
  );
}

/**
 * Example 5: Full Terminal Component
 *
 * Complete example showing how to integrate with a terminal UI.
 */
export function FullTerminalExample() {
  const {
    sendTerminalInput,
    lastMessage,
    connectionStatus,
    sessionId,
    isConnected,
  } = useWebSocket();

  // Handle terminal output
  useEffect(() => {
    if (lastMessage?.type === 'terminal:output') {
      // In real implementation, this would write to xterm.js terminal
      console.log('[Terminal Output]', lastMessage.data);
    }
  }, [lastMessage]);

  const handleInput = (data: string) => {
    if (isConnected) {
      sendTerminalInput(data);
    }
  };

  return (
    <div className="terminal-container">
      <div className="terminal-header">
        <h2>Claude Studio Terminal</h2>
        <div className="status-bar">
          <span className={`status-indicator ${connectionStatus}`}>
            {connectionStatus}
          </span>
          <span className="session-id">Session: {sessionId || 'N/A'}</span>
        </div>
      </div>

      <div className="terminal-body">
        {/* Terminal UI component would go here (xterm.js) */}
        <div>Terminal output would be rendered here</div>
      </div>

      <div className="terminal-input">
        <input
          type="text"
          placeholder="Type command..."
          disabled={!isConnected}
          onKeyPress={(e) => {
            if (e.key === 'Enter') {
              handleInput(e.currentTarget.value + '\n');
              e.currentTarget.value = '';
            }
          }}
        />
      </div>
    </div>
  );
}

/**
 * Example 6: Handling Connection Errors
 *
 * Component that gracefully handles connection errors and reconnection.
 */
export function ErrorHandlingExample() {
  const { connectionStatus, lastMessage, isConnected } = useWebSocket();

  const statusColor = {
    connected: 'green',
    connecting: 'yellow',
    disconnected: 'gray',
    error: 'red',
  }[connectionStatus];

  return (
    <div>
      <h2>Connection Status</h2>
      <div style={{ padding: '1rem', backgroundColor: statusColor }}>
        <p>Status: {connectionStatus}</p>
        <p>Connected: {isConnected ? 'Yes' : 'No'}</p>
      </div>

      {connectionStatus === 'connecting' && (
        <p>Connecting to server...</p>
      )}

      {connectionStatus === 'error' && (
        <div>
          <p>Connection error occurred</p>
          <p>Attempting automatic reconnection...</p>
        </div>
      )}

      {lastMessage?.type === 'error' && (
        <div style={{ color: 'red' }}>
          <h3>Server Error:</h3>
          <p>{lastMessage.message}</p>
        </div>
      )}
    </div>
  );
}

/**
 * Example usage of WebSocketClient
 *
 * This file demonstrates the WebSocket client API.
 * NOT imported in the actual application - for reference only.
 */

import { WebSocketClient } from './websocket';

export function exampleUsage() {
  // Create WebSocket client
  const ws = new WebSocketClient('ws://127.0.0.1:3850');

  // ==========================================
  // Event Handlers
  // ==========================================

  // Connection established
  ws.on('connected', (sessionId) => {
    console.log(`Connected! Session ID: ${sessionId}`);
  });

  // Receive terminal output
  ws.on('terminal:output', (data) => {
    console.log('Terminal output:', data);
    // In real app: terminal.write(data)
  });

  // Connection state changes
  ws.on('stateChange', (state) => {
    console.log(`Connection state: ${state}`);

    switch (state) {
      case 'connecting':
        console.log('Attempting to connect...');
        break;
      case 'connected':
        console.log('Successfully connected!');
        break;
      case 'disconnected':
        console.log('Disconnected from server');
        break;
      case 'error':
        console.log('Connection error occurred');
        break;
    }
  });

  // Error handling
  ws.on('error', (error) => {
    console.error('WebSocket error:', error.message);
  });

  // Connection closed
  ws.on('close', () => {
    console.log('Connection closed');
  });

  // Generic message handler (optional)
  ws.on('message', (message) => {
    console.log('Received message:', message.type);
  });

  // ==========================================
  // Connection Management
  // ==========================================

  // Connect to server
  ws.connect();

  // Check connection state
  console.log('Current state:', ws.getState()); // 'connecting'

  // After connected, get session ID
  setTimeout(() => {
    const sessionId = ws.getSessionId();
    console.log('Session ID:', sessionId);
  }, 1000);

  // ==========================================
  // Sending Messages
  // ==========================================

  // Send terminal input (once connected)
  setTimeout(() => {
    ws.sendTerminalInput('ls -la\n');
    ws.sendTerminalInput('pwd\n');
    ws.sendTerminalInput('echo "Hello from WebSocket"\n');
  }, 1500);

  // Manual heartbeat (normally automatic)
  setTimeout(() => {
    ws.sendHeartbeat();
  }, 2000);

  // ==========================================
  // Cleanup
  // ==========================================

  // Disconnect when done (e.g., on component unmount)
  setTimeout(() => {
    ws.disconnect();
  }, 5000);

  return ws;
}

/**
 * React Hook Example (for future use in P02-T004)
 */
export function useWebSocketExample() {
  // This will be implemented in P02-T004
  // const [ws] = useState(() => new WebSocketClient());
  //
  // useEffect(() => {
  //   ws.connect();
  //   return () => ws.disconnect();
  // }, []);
  //
  // return ws;
}

/**
 * WebSocket Server Setup
 *
 * Creates and configures the WebSocket server attached to the
 * HTTP server instance.
 */

import { WebSocketServer } from 'ws';
import { Server } from 'http';
import { handleConnection } from './handler';

/**
 * Setup WebSocket server attached to HTTP server
 *
 * @param httpServer - The HTTP server instance to attach to
 * @returns The configured WebSocketServer instance
 */
export function setupWebSocket(httpServer: Server): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer });

  // Handle async connection setup
  wss.on('connection', (ws) => {
    handleConnection(ws).catch((error) => {
      console.error('Error handling WebSocket connection:', error);
      ws.close();
    });
  });

  console.log('✅ WebSocket server ready');

  return wss;
}

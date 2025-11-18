/**
 * WebSocket Server Setup
 *
 * Creates and configures the WebSocket server attached to the
 * HTTP server instance with path-based routing and authentication.
 *
 * Production: Accepts connections on /ws path (wss://studio.noreika.lt/ws)
 * Development: Also accepts connections on root path for backward compatibility
 *
 * SECURITY: All connections require authentication token via query parameter
 * Example: ws://host:port?token=YOUR_TOKEN
 */

import { WebSocketServer } from 'ws';
import { Server } from 'http';
import { IncomingMessage } from 'http';
import { Socket } from 'net';
import { handleConnection } from './handler';
import { validateWebSocketAuth } from '../middleware/ws-auth';
import { wsAuthToken } from '../config/env';
import { logger } from '../utils/logger';

/**
 * Setup WebSocket server with path-based routing and authentication
 *
 * Security features:
 * - Token-based authentication for all connections
 * - Rate limiting to prevent brute force attacks
 * - IP-based tracking of failed attempts
 * - Comprehensive audit logging
 *
 * @param httpServer - The HTTP server instance to attach to
 * @returns The configured WebSocketServer instance
 */
export function setupWebSocket(httpServer: Server): WebSocketServer {
  // Create WebSocket server without auto-attaching to HTTP server
  const wss = new WebSocketServer({ noServer: true });

  // Handle async connection setup
  wss.on('connection', (ws) => {
    handleConnection(ws).catch((error) => {
      logger.error('Error handling WebSocket connection', { error });
      ws.close();
    });
  });

  // Manual upgrade handling for path-based routing with authentication
  httpServer.on('upgrade', (request: IncomingMessage, socket: Socket, head: Buffer) => {
    const url = request.url || '/';

    // Extract path without query parameters
    const path = url.split('?')[0];

    // Accept connections on /ws path (production) or root / (development)
    if (path === '/ws' || path === '/') {
      // SECURITY: Validate authentication token
      const authResult = validateWebSocketAuth(request, wsAuthToken);

      if (!authResult.ok) {
        // Authentication failed - reject connection
        logger.warn('WebSocket upgrade rejected', {
          path,
          code: authResult.code,
          message: authResult.message,
          ip: request.socket.remoteAddress,
        });

        // Send HTTP error response
        socket.write(
          `HTTP/1.1 ${authResult.code} ${authResult.code === 401 ? 'Unauthorized' : 'Too Many Requests'}\r\n` +
          `Content-Type: text/plain\r\n` +
          `Connection: close\r\n` +
          `\r\n` +
          `${authResult.message}\r\n`
        );
        socket.destroy();
        return;
      }

      // Authentication successful - upgrade to WebSocket
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      // Reject other paths
      logger.debug('WebSocket upgrade rejected: invalid path', { path });
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
    }
  });

  logger.info('WebSocket server initialized', {
    paths: ['/ws', '/'],
    authenticationEnabled: true,
    tokenConfigured: wsAuthToken.length > 0,
  });

  return wss;
}

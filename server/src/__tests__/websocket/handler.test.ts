/**
 * WebSocket Handler Tests
 *
 * Comprehensive test suite for WebSocket connection handling,
 * Docker container I/O, message routing, and protocol validation.
 */

import { WebSocket, WebSocketServer } from 'ws';
import { createServer, Server } from 'http';
import { handleConnection } from '../../websocket/handler';
import { containerManager } from '../../docker/ContainerManager';
import {
  ClientMessage,
  ServerMessage,
  createTerminalInputMessage,
  createHeartbeatMessage,
} from '@shared';

// Mock ContainerManager
jest.mock('../../docker/ContainerManager', () => ({
  containerManager: {
    createSession: jest.fn().mockResolvedValue({
      sessionId: 'test-session',
      containerId: 'container-123',
      projectName: 'test',
      status: 'running',
      createdAt: new Date(),
      lastActivity: new Date(),
      workspacePath: '/tmp',
    }),
    attachToContainerStreams: jest.fn().mockResolvedValue({
      stdin: { write: jest.fn(), destroy: jest.fn() },
      stdout: {
        on: jest.fn(),
        off: jest.fn(),
        removeListener: jest.fn(),
        removeAllListeners: jest.fn(),
      },
      stderr: {
        on: jest.fn(),
        off: jest.fn(),
        removeListener: jest.fn(),
        removeAllListeners: jest.fn(),
      },
    }),
    writeToContainerStdin: jest.fn(),
    stopSession: jest.fn().mockResolvedValue(undefined),
    getSession: jest.fn().mockReturnValue({
      sessionId: 'test-session',
      containerId: 'container-123',
      projectName: 'test',
      status: 'running',
      createdAt: new Date(),
      lastActivity: new Date(),
      workspacePath: '/tmp',
    }),
    updateActivity: jest.fn(),
    stopHealthMonitoring: jest.fn(),
  },
}));

describe('WebSocket Handler', () => {
  let server: Server;
  let wss: WebSocketServer;
  let port: number;

  beforeAll((done) => {
    // Create HTTP server for testing
    server = createServer();
    wss = new WebSocketServer({ server });

    // Handle async connection setup
    wss.on('connection', (ws) => {
      handleConnection(ws).catch((error) => {
        console.error('Error handling WebSocket connection:', error);
        ws.close();
      });
    });

    // Listen on random port (IPv4 only)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address && typeof address !== 'string') {
        port = address.port;
      }
      done();
    });
  });

  afterAll((done) => {
    // Close all connections first
    wss.clients.forEach((client) => {
      client.close();
    });

    // Then close server with timeout
    const timeout = setTimeout(() => {
      console.warn('Server close timeout, forcing shutdown');
      done();
    }, 2000);

    wss.close(() => {
      server.close(() => {
        clearTimeout(timeout);
        done();
      });
    });
  });

  describe('Connection', () => {
    it('should accept WebSocket connection', (done) => {
      const client = new WebSocket(`ws://127.0.0.1:${port}`);

      client.on('open', () => {
        expect(client.readyState).toBe(WebSocket.OPEN);
        client.close();
        done();
      });

      client.on('error', (error) => {
        done(error);
      });
    });

    it('should send connected message on connection', (done) => {
      const client = new WebSocket(`ws://127.0.0.1:${port}`);

      client.on('message', (data) => {
        const message = JSON.parse(data.toString()) as ServerMessage;

        expect(message.type).toBe('connected');
        expect(message).toHaveProperty('sessionId');
        expect(message).toHaveProperty('timestamp');

        if (message.type === 'connected') {
          expect(message.sessionId).toMatch(/^sess_\d+_[a-z0-9]+$/);
          expect(new Date(message.timestamp).getTime()).toBeLessThanOrEqual(
            Date.now()
          );
        }

        client.close();
        done();
      });

      client.on('error', (error) => {
        done(error);
      });
    });

    it('should generate unique session IDs for multiple connections', (done) => {
      const sessionIds = new Set<string>();
      let connectionsReceived = 0;
      const totalConnections = 3;

      const createConnection = () => {
        const client = new WebSocket(`ws://127.0.0.1:${port}`);

        client.on('message', (data) => {
          const message = JSON.parse(data.toString()) as ServerMessage;

          if (message.type === 'connected') {
            sessionIds.add(message.sessionId);
            connectionsReceived++;

            client.close();

            if (connectionsReceived === totalConnections) {
              expect(sessionIds.size).toBe(totalConnections);
              done();
            }
          }
        });

        client.on('error', (error) => {
          done(error);
        });
      };

      // Create multiple connections
      for (let i = 0; i < totalConnections; i++) {
        createConnection();
      }
    });
  });

  describe('Container I/O Functionality', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should write input to container stdin via containerManager', (done) => {
      const client = new WebSocket(`ws://127.0.0.1:${port}`);
      let messagesReceived = 0;

      client.on('message', (data) => {
        const message = JSON.parse(data.toString()) as ServerMessage;
        messagesReceived++;

        if (messagesReceived === 1) {
          // First message: connected
          expect(message.type).toBe('connected');

          // Send terminal input
          const inputMsg = createTerminalInputMessage('hello world');
          client.send(JSON.stringify(inputMsg));

          // Verify containerManager.writeToContainerStdin was called
          setTimeout(() => {
            expect(containerManager.writeToContainerStdin).toHaveBeenCalledWith(
              expect.any(String),
              'hello world',
              expect.any(Object)
            );
            client.close();
            done();
          }, 50);
        }
      });

      client.on('error', (error) => {
        done(error);
      });
    });

    it('should create container session on connection', (done) => {
      const client = new WebSocket(`ws://127.0.0.1:${port}`);

      client.on('message', (data) => {
        const message = JSON.parse(data.toString()) as ServerMessage;

        if (message.type === 'connected') {
          // Verify containerManager.createSession was called
          expect(containerManager.createSession).toHaveBeenCalledWith(
            expect.objectContaining({
              projectName: 'terminal-session',
              workspacePath: '/tmp',
              image: 'ubuntu:latest',
            })
          );
          client.close();
          done();
        }
      });

      client.on('error', (error) => {
        done(error);
      });
    });

    it('should stop container session on disconnect', (done) => {
      const client = new WebSocket(`ws://127.0.0.1:${port}`);

      client.on('message', (data) => {
        const message = JSON.parse(data.toString()) as ServerMessage;

        if (message.type === 'connected') {
          // Close connection
          client.close();
        }
      });

      client.on('close', () => {
        // Verify containerManager.stopSession was called
        setTimeout(() => {
          expect(containerManager.stopSession).toHaveBeenCalledWith(
            expect.any(String)
          );
          done();
        }, 50);
      });

      client.on('error', (error) => {
        done(error);
      });
    });

    it('should preserve data content when writing to container', (done) => {
      const client = new WebSocket(`ws://127.0.0.1:${port}`);
      const testData = 'ls -la\r\n';
      let messagesReceived = 0;

      client.on('message', (data) => {
        const message = JSON.parse(data.toString()) as ServerMessage;
        messagesReceived++;

        if (messagesReceived === 1) {
          const inputMsg = createTerminalInputMessage(testData);
          client.send(JSON.stringify(inputMsg));

          // Verify exact data was passed to container
          setTimeout(() => {
            expect(containerManager.writeToContainerStdin).toHaveBeenCalledWith(
              expect.any(String),
              testData,
              expect.any(Object)
            );
            client.close();
            done();
          }, 50);
        }
      });

      client.on('error', (error) => {
        done(error);
      });
    });

    it('should handle empty input data', (done) => {
      const client = new WebSocket(`ws://127.0.0.1:${port}`);
      let messagesReceived = 0;

      client.on('message', (data) => {
        const message = JSON.parse(data.toString()) as ServerMessage;
        messagesReceived++;

        if (messagesReceived === 1) {
          const inputMsg = createTerminalInputMessage('');
          client.send(JSON.stringify(inputMsg));

          setTimeout(() => {
            expect(containerManager.writeToContainerStdin).toHaveBeenCalledWith(
              expect.any(String),
              '',
              expect.any(Object)
            );
            client.close();
            done();
          }, 50);
        }
      });

      client.on('error', (error) => {
        done(error);
      });
    });

    it('should handle special characters in input', (done) => {
      const client = new WebSocket(`ws://127.0.0.1:${port}`);
      const specialChars = 'echo "test" && ls -l | grep .ts\n';
      let messagesReceived = 0;

      client.on('message', (data) => {
        const message = JSON.parse(data.toString()) as ServerMessage;
        messagesReceived++;

        if (messagesReceived === 1) {
          const inputMsg = createTerminalInputMessage(specialChars);
          client.send(JSON.stringify(inputMsg));

          setTimeout(() => {
            expect(containerManager.writeToContainerStdin).toHaveBeenCalledWith(
              expect.any(String),
              specialChars,
              expect.any(Object)
            );
            client.close();
            done();
          }, 50);
        }
      });

      client.on('error', (error) => {
        done(error);
      });
    });
  });

  describe('Heartbeat Handling', () => {
    it('should handle heartbeat message without response', (done) => {
      const client = new WebSocket(`ws://127.0.0.1:${port}`);
      let messagesReceived = 0;
      let timeoutId: NodeJS.Timeout;

      client.on('message', (data) => {
        const message = JSON.parse(data.toString()) as ServerMessage;
        messagesReceived++;

        if (messagesReceived === 1) {
          expect(message.type).toBe('connected');

          // Send heartbeat
          const heartbeatMsg = createHeartbeatMessage();
          client.send(JSON.stringify(heartbeatMsg));

          // Wait to ensure no response
          timeoutId = setTimeout(() => {
            expect(messagesReceived).toBe(1); // Only connected message
            client.close();
            done();
          }, 100);
        } else {
          // Should not receive any other messages
          clearTimeout(timeoutId);
          client.close();
          done(new Error('Unexpected message after heartbeat'));
        }
      });

      client.on('error', (error) => {
        clearTimeout(timeoutId);
        done(error);
      });
    });

    it('should handle multiple heartbeats', (done) => {
      const client = new WebSocket(`ws://127.0.0.1:${port}`);
      let messagesReceived = 0;
      let heartbeatsSent = 0;
      const totalHeartbeats = 3;
      let timeoutId: NodeJS.Timeout;

      client.on('message', (data) => {
        const message = JSON.parse(data.toString()) as ServerMessage;
        messagesReceived++;

        if (messagesReceived === 1) {
          expect(message.type).toBe('connected');

          // Send multiple heartbeats
          const sendHeartbeat = () => {
            if (heartbeatsSent < totalHeartbeats) {
              const heartbeatMsg = createHeartbeatMessage();
              client.send(JSON.stringify(heartbeatMsg));
              heartbeatsSent++;
              setTimeout(sendHeartbeat, 20);
            } else {
              // Wait after last heartbeat
              timeoutId = setTimeout(() => {
                expect(messagesReceived).toBe(1); // Only connected message
                client.close();
                done();
              }, 100);
            }
          };

          sendHeartbeat();
        } else {
          // Should not receive any other messages
          clearTimeout(timeoutId);
          client.close();
          done(new Error('Unexpected message after heartbeats'));
        }
      });

      client.on('error', (error) => {
        clearTimeout(timeoutId);
        done(error);
      });
    });
  });

  describe('Error Handling', () => {
    it('should return error for invalid JSON', (done) => {
      const client = new WebSocket(`ws://127.0.0.1:${port}`);
      let messagesReceived = 0;

      client.on('message', (data) => {
        const message = JSON.parse(data.toString()) as ServerMessage;
        messagesReceived++;

        if (messagesReceived === 1) {
          // Send invalid JSON
          client.send('not valid json');
        } else if (messagesReceived === 2) {
          expect(message.type).toBe('error');
          if (message.type === 'error') {
            expect(message.message).toContain('parse');
            expect(message.timestamp).toBeDefined();
          }
          client.close();
          done();
        }
      });

      client.on('error', (error) => {
        done(error);
      });
    });

    it('should return error for invalid message type', (done) => {
      const client = new WebSocket(`ws://127.0.0.1:${port}`);
      let messagesReceived = 0;

      client.on('message', (data) => {
        const message = JSON.parse(data.toString()) as ServerMessage;
        messagesReceived++;

        if (messagesReceived === 1) {
          // Send invalid message type
          client.send(JSON.stringify({ type: 'invalid', data: 'test' }));
        } else if (messagesReceived === 2) {
          expect(message.type).toBe('error');
          if (message.type === 'error') {
            expect(message.message).toContain('Invalid');
            expect(message.timestamp).toBeDefined();
          }
          client.close();
          done();
        }
      });

      client.on('error', (error) => {
        done(error);
      });
    });

    it('should return error for malformed message object', (done) => {
      const client = new WebSocket(`ws://127.0.0.1:${port}`);
      let messagesReceived = 0;

      client.on('message', (data) => {
        const message = JSON.parse(data.toString()) as ServerMessage;
        messagesReceived++;

        if (messagesReceived === 1) {
          // Send message without type field
          client.send(JSON.stringify({ data: 'test' }));
        } else if (messagesReceived === 2) {
          expect(message.type).toBe('error');
          client.close();
          done();
        }
      });

      client.on('error', (error) => {
        done(error);
      });
    });

    it('should return error for non-object message', (done) => {
      const client = new WebSocket(`ws://127.0.0.1:${port}`);
      let messagesReceived = 0;

      client.on('message', (data) => {
        const message = JSON.parse(data.toString()) as ServerMessage;
        messagesReceived++;

        if (messagesReceived === 1) {
          // Send JSON string (not object)
          client.send(JSON.stringify('just a string'));
        } else if (messagesReceived === 2) {
          expect(message.type).toBe('error');
          client.close();
          done();
        }
      });

      client.on('error', (error) => {
        done(error);
      });
    });

    it('should return error for null message', (done) => {
      const client = new WebSocket(`ws://127.0.0.1:${port}`);
      let messagesReceived = 0;

      client.on('message', (data) => {
        const message = JSON.parse(data.toString()) as ServerMessage;
        messagesReceived++;

        if (messagesReceived === 1) {
          // Send null
          client.send(JSON.stringify(null));
        } else if (messagesReceived === 2) {
          expect(message.type).toBe('error');
          client.close();
          done();
        }
      });

      client.on('error', (error) => {
        done(error);
      });
    });
  });

  describe('Connection Lifecycle', () => {
    it('should handle connection close', (done) => {
      const client = new WebSocket(`ws://127.0.0.1:${port}`);

      client.on('open', () => {
        expect(client.readyState).toBe(WebSocket.OPEN);
        client.close();
      });

      client.on('close', () => {
        expect(client.readyState).toBe(WebSocket.CLOSED);
        done();
      });

      client.on('error', (error) => {
        done(error);
      });
    });

    it('should handle client-initiated close after messages', (done) => {
      const client = new WebSocket(`ws://127.0.0.1:${port}`);
      let messagesReceived = 0;

      client.on('message', (data) => {
        const message = JSON.parse(data.toString()) as ServerMessage;
        messagesReceived++;

        if (messagesReceived === 1) {
          // Send a message
          const inputMsg = createTerminalInputMessage('test');
          client.send(JSON.stringify(inputMsg));
        } else if (messagesReceived === 2) {
          // Received echo, now close
          client.close();
        }
      });

      client.on('close', () => {
        expect(messagesReceived).toBe(2);
        expect(client.readyState).toBe(WebSocket.CLOSED);
        done();
      });

      client.on('error', (error) => {
        done(error);
      });
    });

    it('should handle multiple sequential connections', (done) => {
      const testSequentialConnection = (index: number) => {
        const client = new WebSocket(`ws://127.0.0.1:${port}`);

        client.on('message', (data) => {
          const message = JSON.parse(data.toString()) as ServerMessage;
          expect(message.type).toBe('connected');
          client.close();
        });

        client.on('close', () => {
          if (index < 3) {
            testSequentialConnection(index + 1);
          } else {
            done();
          }
        });

        client.on('error', (error) => {
          done(error);
        });
      };

      testSequentialConnection(1);
    });
  });

  describe('Message Timestamp Validation', () => {
    it('should include valid ISO8601 timestamp in connected message', (done) => {
      const client = new WebSocket(`ws://127.0.0.1:${port}`);

      client.on('message', (data) => {
        const message = JSON.parse(data.toString()) as ServerMessage;

        if (message.type === 'connected') {
          // Validate ISO8601 format
          const timestamp = new Date(message.timestamp);
          expect(timestamp.toISOString()).toBe(message.timestamp);
          expect(timestamp.getTime()).toBeLessThanOrEqual(Date.now());
          expect(timestamp.getTime()).toBeGreaterThan(Date.now() - 5000); // Within last 5 seconds
        }

        client.close();
        done();
      });

      client.on('error', (error) => {
        done(error);
      });
    });

    it('should include valid ISO8601 timestamp in terminal output', (done) => {
      const client = new WebSocket(`ws://127.0.0.1:${port}`);
      let messagesReceived = 0;

      client.on('message', (data) => {
        const message = JSON.parse(data.toString()) as ServerMessage;
        messagesReceived++;

        if (messagesReceived === 1) {
          const inputMsg = createTerminalInputMessage('test');
          client.send(JSON.stringify(inputMsg));
        } else if (messagesReceived === 2) {
          if (message.type === 'terminal:output') {
            // Validate ISO8601 format
            const timestamp = new Date(message.timestamp);
            expect(timestamp.toISOString()).toBe(message.timestamp);
            expect(timestamp.getTime()).toBeLessThanOrEqual(Date.now());
            expect(timestamp.getTime()).toBeGreaterThan(Date.now() - 5000);
          }
          client.close();
          done();
        }
      });

      client.on('error', (error) => {
        done(error);
      });
    });

    it('should include valid ISO8601 timestamp in error messages', (done) => {
      const client = new WebSocket(`ws://127.0.0.1:${port}`);
      let messagesReceived = 0;

      client.on('message', (data) => {
        const message = JSON.parse(data.toString()) as ServerMessage;
        messagesReceived++;

        if (messagesReceived === 1) {
          client.send('invalid json');
        } else if (messagesReceived === 2) {
          if (message.type === 'error') {
            // Validate ISO8601 format
            const timestamp = new Date(message.timestamp);
            expect(timestamp.toISOString()).toBe(message.timestamp);
            expect(timestamp.getTime()).toBeLessThanOrEqual(Date.now());
            expect(timestamp.getTime()).toBeGreaterThan(Date.now() - 5000);
          }
          client.close();
          done();
        }
      });

      client.on('error', (error) => {
        done(error);
      });
    });
  });

  describe('Concurrent Connections', () => {
    it(
      'should handle multiple concurrent connections independently',
      (done) => {
        const clients: WebSocket[] = [];
        const messages: Map<number, ServerMessage[]> = new Map();
        let connectionsReady = 0;
        let clientsClosed = 0;
        const totalClients = 3;

        const createClient = (clientIndex: number) => {
          const client = new WebSocket(`ws://127.0.0.1:${port}`);
          clients.push(client);
          messages.set(clientIndex, []);

          client.on('message', (data) => {
            const message = JSON.parse(data.toString()) as ServerMessage;
            messages.get(clientIndex)!.push(message);

            if (message.type === 'connected') {
              connectionsReady++;

              if (connectionsReady === totalClients) {
                // All connected, send different messages to each
                clients[0].send(
                  JSON.stringify(createTerminalInputMessage('client 0'))
                );
                clients[1].send(
                  JSON.stringify(createTerminalInputMessage('client 1'))
                );
                clients[2].send(
                  JSON.stringify(createTerminalInputMessage('client 2'))
                );
              }
            } else if (message.type === 'terminal:output') {
              // Verify each client gets its own echo
              if (clientIndex === 0) {
                expect(message.data).toBe('client 0');
              } else if (clientIndex === 1) {
                expect(message.data).toBe('client 1');
              } else if (clientIndex === 2) {
                expect(message.data).toBe('client 2');
              }

              // Close this client
              client.close();
            }
          });

          client.on('close', () => {
            clientsClosed++;
            if (clientsClosed === totalClients) {
              done();
            }
          });

          client.on('error', (error) => {
            done(error);
          });
        };

        // Create multiple clients concurrently
        for (let i = 0; i < totalClients; i++) {
          createClient(i);
        }
      },
      10000
    ); // 10 second timeout for concurrent test
  });
});

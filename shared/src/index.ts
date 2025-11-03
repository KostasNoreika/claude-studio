/**
 * Shared types and utilities for Claude Studio
 *
 * This package provides type-safe definitions for WebSocket communication
 * between the terminal client and server.
 *
 * @packageDocumentation
 */

// Export all WebSocket message types
export * from './types';

// Re-export specific types for convenience
export type {
  // Client Messages
  TerminalInputMessage,
  HeartbeatMessage,
  ClientMessage,

  // Server Messages
  TerminalOutputMessage,
  ConnectedMessage,
  ErrorMessage,
  ServerMessage,
} from './types';

// Re-export utility functions
export {
  // Type Guards
  isClientMessage,
  isServerMessage,

  // Message Factories
  createTerminalInputMessage,
  createHeartbeatMessage,
  createTerminalOutputMessage,
  createConnectedMessage,
  createErrorMessage,
} from './types';

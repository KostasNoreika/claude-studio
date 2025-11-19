/**
 * Shared types and utilities for Claude Studio
 *
 * This package provides type-safe definitions for WebSocket communication
 * between the terminal client and server.
 *
 * @packageDocumentation
 */

// Export all WebSocket message types and utilities
export * from './types';

// Export type-safe error handling (ARCHITECTURE FIX: MEDIUM-001)
export * from './types/errors';

// Export utility functions
export * from './utils/id-generator';

// Export shared constants
export * from './constants';

// Export protocol versioning (NEW)
export * from './protocol/versions';

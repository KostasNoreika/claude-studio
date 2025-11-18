import { createServer } from 'http';
import { createApp } from './app';
import { config } from './config/env';
import { setupWebSocket } from './websocket';
import { containerManager } from './docker/ContainerManager';
import { startSessionCleanup } from './docker/session-cleanup';
import { logger } from './utils/logger';

// Always listen on 0.0.0.0 to allow Docker bridge containers to connect
// This is required for dev→prod bridge (studio.noreika.lt → dev servers)
const HOST = '0.0.0.0';

/**
 * Initialize Docker container manager
 * Performs health check and cleanup on startup
 */
async function initializeDockerManager(): Promise<void> {
  logger.info('Initializing Docker container manager...');

  // Health check
  const isHealthy = await containerManager.healthCheck();
  if (!isHealthy) {
    logger.error('Docker health check failed! Container management may not work.');
    return;
  }

  logger.info('Docker daemon is healthy');

  // Cleanup zombie containers from previous runs
  try {
    const cleanedUp = await containerManager.cleanupZombieContainers();
    if (cleanedUp > 0) {
      logger.info('Cleaned up zombie containers', { count: cleanedUp });
    }
  } catch (error) {
    logger.error('Failed to cleanup zombie containers', { error });
  }

  logger.info('Docker container manager initialized');
}

/**
 * Start the Express server with WebSocket support
 * P09-T006: Added session cleanup
 */
export async function start(): Promise<void> {
  // Initialize Docker manager first
  await initializeDockerManager();

  // Start session cleanup (30min timeout)
  startSessionCleanup();

  // Create Express app
  const app = createApp();

  // Create HTTP server from Express app
  const httpServer = createServer(app);

  // Attach WebSocket server
  setupWebSocket(httpServer);

  // Start listening
  httpServer.listen(config.port, HOST, () => {
    logger.info('Server started successfully', {
      host: HOST,
      port: config.port,
      httpUrl: `http://${HOST}:${config.port}`,
      healthCheckUrl: `http://${HOST}:${config.port}/api/health`,
      websocketUrl: `ws://${HOST}:${config.port}`,
      environment: config.nodeEnv,
      logLevel: config.logLevel,
    });
  });
}

// Start server if this file is run directly
if (require.main === module) {
  start();
}

// Export app for testing
export { createApp };

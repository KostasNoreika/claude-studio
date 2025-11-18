import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // Allow Docker containers to connect via host.docker.internal
    port: 3010, // Port for Docker bridge routing
    strictPort: true,
    cors: true,
    // Allow connections from production domain (via Traefik reverse proxy)
    allowedHosts: ['studio.noreika.lt', 'localhost', '127.0.0.1'],
    // HMR: use production config only in production, auto for dev
    hmr: process.env.NODE_ENV === 'production' ? {
      host: 'studio.noreika.lt',
      port: 80,
    } : true,
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
    proxy: {
      '/ws': {
        target: 'ws://127.0.0.1:3850',
        ws: true,
        changeOrigin: true,
      },
      '/api': {
        target: 'http://127.0.0.1:3850',
        changeOrigin: true,
      },
      '/preview': {
        target: 'http://127.0.0.1:3850',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, '../shared/src'),
    },
  },
  build: {
    // P09-T011: Performance optimization
    target: 'esnext',
    minify: 'esbuild',

    // Code splitting
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunks
          'react-vendor': ['react', 'react-dom'],
          'xterm-vendor': ['xterm', '@xterm/addon-fit'],
        },
      },
    },

    // Chunk size warnings
    chunkSizeWarningLimit: 1000,

    // Source maps for production debugging (disable in production if not needed)
    sourcemap: false,

    // CSS code splitting
    cssCodeSplit: true,
  },

  // Optimize dependencies
  optimizeDeps: {
    include: ['react', 'react-dom', 'xterm', '@xterm/addon-fit'],
  },
});

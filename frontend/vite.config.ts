import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 8040,
    host: true,
    allowedHosts: ['spark.local'],
    proxy: {
      '/api': {
        target: 'http://localhost:8041',
        changeOrigin: true,
        // Disable response buffering for SSE
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            // Don't buffer SSE responses
            if (proxyRes.headers['content-type']?.includes('text/event-stream')) {
              proxyRes.headers['X-Accel-Buffering'] = 'no';
              proxyRes.headers['Cache-Control'] = 'no-cache';
            }
          });
        },
      },
    },
  },
})

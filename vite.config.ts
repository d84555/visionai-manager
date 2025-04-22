
import { defineConfig, ConfigEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }: ConfigEnv) => ({
  server: {
    host: "::",
    port: 8080,
    proxy: {
      // Add proxying for WebSocket connections if needed
      '/api/ws': {
        target: 'ws://localhost:3001',
        ws: true,
      },
      // Add proxy for local FFmpeg access if needed
      '/api/ffmpeg': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      }
    }
  },
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Provide empty implementations for Node.js modules
      "path": 'path-browserify',
      "stream": 'stream-browserify',
      "fs": 'memfs',
      "crypto": 'crypto-browserify',
    }
  },
  build: {
    commonjsOptions: {
      transformMixedEsModules: true, // Handle both ES modules and CommonJS
    },
    rollupOptions: {
      external: [
        // Mark FFmpeg packages as external during build
        /@ffmpeg\/(ffmpeg|core|util)/
      ]
    },
  },
  define: {
    // Needed to fix "require is not defined" error
    global: 'globalThis',
  },
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/core', '@ffmpeg/util']
  },
}));

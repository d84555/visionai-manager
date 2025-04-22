
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    proxy: {
      // Add proxying for WebSocket connections if needed
      '/api/ws': {
        target: 'ws://localhost:3001',
        ws: true,
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
    },
  },
  build: {
    commonjsOptions: {
      transformMixedEsModules: true, // Handle both ES modules and CommonJS
    },
    rollupOptions: {
      output: {
        manualChunks: {
          ffmpeg: ['@ffmpeg/ffmpeg', '@ffmpeg/core'],
        },
      },
    },
  },
  define: {
    // Needed to fix "require is not defined" error
    global: 'globalThis',
  },
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/core']
  },
  // Handle Node.js modules that aren't available in browser
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Provide empty implementations for Node.js modules
      path: 'path-browserify',
      fs: false,
      crypto: false,
      'worker_threads': false,
      'perf_hooks': false,
      stream: 'stream-browserify',
      // Add alias for ws module
      ws: false
    }
  }
}));

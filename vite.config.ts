
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
      // Add proxying for WebSocket connections
      '/ws': {
        target: 'ws://localhost:8000',
        ws: true,
        changeOrigin: true,
      },
      // Add proxy for transcode endpoints - keep this without the /api prefix
      '/transcode': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path
      },
      // Add proxy for API endpoints (including model routes)
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
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
    sourcemap: true, // Always enable source maps for debugging
    minify: mode !== 'development', // Only minify in non-dev environments
  },
  define: {
    // Needed to fix "require is not defined" error
    global: 'globalThis',
  },
  optimizeDeps: {
    esbuildOptions: {
      // Enable source maps for dependencies too
      sourcemap: true
    }
  }
}));

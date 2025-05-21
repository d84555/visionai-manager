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
        rewrite: (path) => path,
        configure: (proxy, options) => {
          // Log proxy errors for debugging
          proxy.on('error', (err, req, res) => {
            console.error('Proxy error:', err);
          });
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log('Proxy request:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, res) => {
            console.log('Proxy response:', proxyRes.statusCode, req.url);
            
            // Add CORS headers for HLS files
            if (req.url?.endsWith('.m3u8') || req.url?.endsWith('.ts')) {
              proxyRes.headers['Access-Control-Allow-Origin'] = '*';
              proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, HEAD, OPTIONS';
              proxyRes.headers['Access-Control-Allow-Headers'] = 'Origin, X-Requested-With, Content-Type, Accept';
            }
          });
        }
      },
      // Add proxy for API endpoints (including model routes)
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      },
      // Add specific proxy for HLS streams if they're on a different origin
      '/hls': {
        target: 'http://localhost:8888', // Change this to your HLS server
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/hls/, '')
      },
      // Enhanced proxy for stream files
      '/transcode/stream': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        configure: (proxy, options) => {
          proxy.on('error', (err, req, res) => {
            console.error('Stream proxy error:', err);
          });
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log('Stream proxy request:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, res) => {
            console.log('Stream proxy response:', proxyRes.statusCode, req.url);
            
            // Add CORS headers for HLS files
            if (req.url?.endsWith('.m3u8') || req.url?.endsWith('.ts')) {
              proxyRes.headers['Access-Control-Allow-Origin'] = '*';
              proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, HEAD, OPTIONS';
              proxyRes.headers['Access-Control-Allow-Headers'] = 'Origin, X-Requested-With, Content-Type, Accept';
              proxyRes.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
            }
          });
        }
      },
      // Catch-all proxy for m3u8 files that aren't handled by other routes
      '/**/*.m3u8': {
        target: 'http://localhost:8000', // Fallback to API server
        changeOrigin: true,
        configure: (proxy, options) => {
          proxy.on('error', (err, req, res) => {
            console.error('M3U8 proxy error:', err);
          });
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log('M3U8 proxy request:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, res) => {
            console.log('M3U8 proxy response:', proxyRes.statusCode, req.url);
            // Add CORS headers for .m3u8 files
            proxyRes.headers['Access-Control-Allow-Origin'] = '*';
            proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, HEAD, OPTIONS';
            proxyRes.headers['Access-Control-Allow-Headers'] = 'Origin, X-Requested-With, Content-Type, Accept';
            proxyRes.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
          });
        }
      },
      // Add specific handler for .ts segment files
      '/**/*.ts': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        configure: (proxy, options) => {
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log('TS segment proxy request:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, res) => {
            console.log('TS segment proxy response:', proxyRes.statusCode, req.url);
            // Add CORS headers for .ts files
            proxyRes.headers['Access-Control-Allow-Origin'] = '*';
            proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, HEAD, OPTIONS';
            proxyRes.headers['Access-Control-Allow-Headers'] = 'Origin, X-Requested-With, Content-Type, Accept';
            proxyRes.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
          });
        }
      }
    },
    // Enhanced CORS settings to allow direct HLS stream loading
    cors: {
      origin: '*',
      methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization'],
      exposedHeaders: ['Content-Length', 'Content-Range'],
      preflightContinue: false,
      optionsSuccessStatus: 204,
      credentials: true
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
      "pg": path.resolve(__dirname, "./src/services/mock/pg-mock.ts"),  // Add mock for pg
    }
  },
  build: {
    commonjsOptions: {
      transformMixedEsModules: true, // Handle both ES modules and CommonJS
    },
    sourcemap: true, // Always enable source maps for debugging
    minify: mode !== 'development', // Only minify in non-dev environments
    rollupOptions: {
      // Ensure hls.js is properly bundled
      external: [],
      output: {
        manualChunks: {
          'hls': ['hls.js']
        }
      }
    }
  },
  define: {
    // Needed to fix "require is not defined" error
    global: 'globalThis',
  },
  optimizeDeps: {
    include: ['hls.js'] // Explicitly include hls.js in optimization
  }
}));

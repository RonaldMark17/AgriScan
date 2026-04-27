import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function faviconFallback() {
  const redirectToIcon = (_req, res) => {
    res.statusCode = 302;
    res.setHeader('Location', '/icons/icon.svg');
    res.end();
  };

  return {
    name: 'agriscan-favicon-fallback',
    configureServer(server) {
      server.middlewares.use('/favicon.ico', redirectToIcon);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/favicon.ico', redirectToIcon);
    },
  };
}

export default defineConfig({
  plugins: [react(), faviconFallback()],
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          http: ['axios'],
          icons: ['lucide-react'],
        },
      },
    },
  },
});

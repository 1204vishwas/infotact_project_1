import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.VITE_PROXY_TARGET || process.env.VITE_PROXY_TARGET || 'http://localhost:5000';
  const proxy = {
    '/api': {
      target,
      changeOrigin: true,
    },
    '/ws': {
      target,
      changeOrigin: true,
      ws: true,
    },
  };

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy,
    },
    preview: {
      port: 4173,
      proxy,
    },
  };
});

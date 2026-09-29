/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { aiEditProxy } from './server/viteAiPlugin';

export default defineConfig(({ mode }) => {
  // Server-only variables (no VITE_ prefix) stay out of the client bundle.
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), aiEditProxy(env)],
    // Relative base so the build works from any static host or a native wrapper.
    base: './',
    worker: { format: 'es' },
    test: {
      include: ['tests/**/*.test.ts'],
      environment: 'node',
    },
  };
});

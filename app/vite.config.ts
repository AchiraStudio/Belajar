import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// One Vite project, two targets: the web build and the Tauri shell both consume `dist/`
// (MIGRATION_PLAN X-3). The dev proxy lets `npm run dev` talk to `cargo run -p belajar-server`.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:8080' },
  },
  build: {
    // WebView floor from docs/TECHNICAL_RISKS.md R-H3: the CSS needs color-mix(), dvh and <dialog>.
    target: ['es2022', 'chrome111', 'safari16'],
    sourcemap: false,
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// One Vite project, two targets: the web build and the Tauri shell both consume `dist/`
// (MIGRATION_PLAN X-3). The dev proxy lets `npm run dev` talk to `cargo run -p stuby-server`.
//
// `--mode standalone` is for any bundle that is served by the Belajar server itself (the desktop
// app's embedded server, the Linux server): the UI must call the API on its own origin. It pins
// VITE_API_BASE_URL to "" so a developer's local app/.env (which points `npm run dev` at
// http://127.0.0.1:8080) can never leak into a bundle that is served from somewhere else.
export default defineConfig(({ mode, command }) => ({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:8080' },
  },
  // The dev server proxies /api (see `server.proxy`), so the UI must call its own origin there too.
  // Left at app/.env's http://127.0.0.1:8080 it would be cross-origin: the server sends no CORS headers
  // and its SameSite=Strict session cookie would not be sent, so login could never work.
  define: mode === 'standalone' || command === 'serve' ? { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify('') } : {},
  build: {
    // WebView floor from docs/TECHNICAL_RISKS.md R-H3: the CSS needs color-mix(), dvh and <dialog>.
    target: ['es2022', 'chrome111', 'safari16'],
    sourcemap: false,
  },
  test: {
    // Tests must not depend on a developer's local app/.env (it sets VITE_API_BASE_URL for dev).
    env: { VITE_API_BASE_URL: '' },
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
}));

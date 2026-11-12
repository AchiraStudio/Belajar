import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Relative base so the built `dist/` works from any sub-path (GitHub Pages, a folder on a server).
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5188, strictPort: false },
  build: { target: ['es2022', 'chrome111', 'safari16'], sourcemap: false },
});

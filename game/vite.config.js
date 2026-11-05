import { defineConfig } from 'vite';

// base './' keeps the build working from any sub-folder (CrazyGames, GitHub Pages, itch).
// allowedHosts: true is needed for the hosted preview iframe and for Codespaces URLs.
export default defineConfig({
  base: './',
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    allowedHosts: true
  },
  preview: {
    host: true,
    port: 4173,
    strictPort: true,
    allowedHosts: true
  }
});

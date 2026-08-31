import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import electron from "vite-plugin-electron";
import renderer from "vite-plugin-electron-renderer";

// Ministry app — thin shell over the shared @rekindle/* workspace packages.
//
// The `electron` plugins below are gated behind `mode === 'electron'` (only
// `vite build --mode electron`, used by the `build:electron`/`dist:win`
// scripts) — the plain web build and the Capacitor Android build both call
// `vite build` with no mode flag and are unaffected.
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8081, // rekindle uses 8080
    // Lets a Cloudflare quick tunnel (cloudflared tunnel --url http://localhost:8081)
    // reach this dev server for real-device testing — e.g. scanning a QR code that
    // encodes window.location.origin, which needs to actually be reachable from a
    // phone. Vite's default host-check otherwise 403s any unrecognized Host header.
    // Dev-only (this `server` block doesn't apply to `vite build`).
    allowedHosts: [".trycloudflare.com"],
  },
  plugins: [
    react(),
    ...(mode === 'electron' ? [
      electron([
        {
          entry: 'electron/main.ts',
          vite: { build: { outDir: 'dist-electron', rollupOptions: { external: ['electron'] } } },
        },
        {
          entry: 'electron/preload.ts',
          onstart(options) { options.reload(); },
          vite: { build: { outDir: 'dist-electron', rollupOptions: { external: ['electron'] } } },
        },
      ]),
      renderer(),
    ] : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    exclude: ['@supabase/supabase-js'],
  },
}));

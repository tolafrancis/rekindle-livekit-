import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import electron from "vite-plugin-electron";
import renderer from "vite-plugin-electron-renderer";

// https://vitejs.dev/config/
//
// The `electron` plugins below are gated behind `mode === 'electron'`
// (i.e. only `vite build --mode electron`, used by the `build:electron`/
// `dist:win` scripts). The plain web build (`npm run build`, used for the
// Cloudflare Pages deploy) and the Capacitor Android build both call
// `vite build` with no mode flag and are unaffected — wiring these plugins
// in unconditionally would risk changing how deps like @supabase/supabase-js
// (excluded from optimizeDeps below) get bundled for those targets too.
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false, // Disable error overlay that can cause refreshes
      protocol: 'ws',
    },
    watch: {
      // Reduce file watching sensitivity
      ignored: ['**/node_modules/**', '**/.git/**'],
      usePolling: false,
    },
  },
  plugins: [
    react({
      fastRefresh: true,
      babel: {
        plugins: []
      }
    }),
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
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    exclude: ['@supabase/supabase-js'],
  },
}));
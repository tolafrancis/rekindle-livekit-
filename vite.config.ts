import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
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
    })
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
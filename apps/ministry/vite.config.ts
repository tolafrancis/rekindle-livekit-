import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// Ministry app — thin shell over the shared @rekindle/* workspace packages.
export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8081, // rekindle uses 8080
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    exclude: ['@supabase/supabase-js'],
  },
}));

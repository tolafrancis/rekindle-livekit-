import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// Ministry app — thin shell over the shared @rekindle/* workspace packages.
export default defineConfig(() => ({
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

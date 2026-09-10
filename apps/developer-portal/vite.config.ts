import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// Standalone "Interactive Meetings API" developer portal — deliberately
// separate from the rekindle (consumer) and ministry apps (per product
// decision: sign-up for API access should not live inside either). A thin
// shell over the shared @rekindle/* workspace packages, same as those apps.
export default defineConfig({
  server: {
    host: "::",
    port: 8082, // rekindle=8080, ministry=8081
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
});

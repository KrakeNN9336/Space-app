import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// In dev the API runs in `wrangler dev` on :8787; Vite proxies /api to it.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://127.0.0.1:8787", changeOrigin: true },
    },
  },
});

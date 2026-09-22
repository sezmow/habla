import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The optional AI server (server/index.ts) runs on :8787. In dev, Vite proxies
// /api to it; if it isn't running, the app detects that and uses on-device features only.
// BASE_PATH lets the same build run at a domain root or under a subpath (GitHub Pages: /habla/).
export default defineConfig({
  base: process.env.BASE_PATH ?? "/",
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:8787" },
  },
  preview: {
    proxy: { "/api": "http://localhost:8787" },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});

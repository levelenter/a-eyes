import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  root: ".",
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    proxy: {
      // 開発時は Vite(5173) → Nodeサーバー(1420) へ /api をプロキシ
      "/api": {
        target: "http://127.0.0.1:1420",
        changeOrigin: true,
      },
    },
  },
});


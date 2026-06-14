import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";
import { memoryBoardDevPlugin } from "./vite-plugin-memory-board";

// https://vite.dev/config/
export default defineConfig({
  // dev server 内嵌中间件：standalone 模式下浏览器通过 /api/__memory_board/* 读取真实磁盘
  plugins: [react(), tailwindcss(), memoryBoardDevPlugin()],

  // Use relative paths so the built assets work inside a VS Code webview
  base: "./",

  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },

  build: {
    outDir: "dist",
    // Generate a single JS + CSS bundle for easier webview loading
    rollupOptions: {
      output: {
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name].[ext]",
      },
    },
  },
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [react()],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  // prevent Vite from obscuring rust errors
  clearScreen: false,

  // Tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/backend/**"],
    },
  },

  // Tauri environment variables
  envPrefix: [
    "VITE_",
    "TAURI_PLATFORM",
    "TAURI_ARCH",
    "TAURI_FAMILY",
    "TAURI_PLATFORM_VERSION",
    "TAURI_PLATFORM_TYPE",
    "TAURI_DEBUG",
  ],

  build: {
    target:
      // @ts-expect-error process is a nodejs global
      process.env.TAURI_PLATFORM == "windows" ? "chrome105" : "safari14",
    // @ts-expect-error process is a nodejs global
    minify: !process.env.TAURI_DEBUG ? "esbuild" : false,
    // @ts-expect-error process is a nodejs global
    sourcemap: !!process.env.TAURI_DEBUG,
  },
}));

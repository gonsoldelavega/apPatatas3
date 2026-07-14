import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  server: {
    proxy: {
      "/fixture-api": {
        target: "http://127.0.0.1:4199",
        rewrite: (path) => path.replace(/^\/fixture-api/, "")
      }
    }
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "FactuPapa Next",
        short_name: "FactuPapa",
        description: "Gestión diaria de clientes, proveedores, productos e importaciones.",
        theme_color: "#14213D",
        background_color: "#F7F6F1",
        display: "standalone",
        start_url: "/",
        scope: "/",
        lang: "es",
        icons: [
          { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }
        ]
      },
      workbox: {
        navigateFallback: "/index.html",
        runtimeCaching: []
      }
    })
  ],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./test/setup.ts",
    css: true
  }
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/icon-192.png", "icons/icon-512.png"],
      manifest: {
        name: "Voice Dojo",
        short_name: "Voice Dojo",
        description: "Character impression trainer — unlock iconic voices, earn XP, track your progress.",
        theme_color: "#060d14",
        background_color: "#060d14",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      },
      workbox: {
        // Cache app shell + assets
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        // Never cache Anthropic API calls
        navigateFallback: "/index.html",
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com/,
            handler: "StaleWhileRevalidate",
            options: { cacheName: "google-fonts-stylesheets" },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com/,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-webfonts",
              expiration: { maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          // API calls always go to network — never cache
          {
            urlPattern: /^https:\/\/api\.anthropic\.com/,
            handler: "NetworkOnly",
          },
        ],
      },
    }),
  ],
});

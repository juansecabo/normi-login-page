import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      // PWA desactivado. selfDestroying genera un SW que, al activarse,
      // desregistra cualquier SW previo y recarga los clientes hacia una página
      // SIN service worker. Esto rompe el loop de recarga del banner amarillo
      // en los navegadores que quedaron atascados (sin pedirles limpiar nada a
      // mano) y elimina toda la clase de bugs del SW. Los cambios futuros se
      // ven con un F5 normal, como en cualquier web.
      selfDestroying: true,
      registerType: "prompt",
      includeAssets: ["favicon.png", "apple-touch-icon.png"],
      manifest: {
        name: "Notas Normi - Plataforma de Gestión Académica",
        short_name: "Notas Normi",
        description: "Plataforma de gestión académica",
        theme_color: "#2D6A4F",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        icons: [
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "pwa-maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webp,woff2}"],
        // El usuario decide cuándo activar la nueva versión vía el banner amarillo
        // de UpdateBanner. NO skipWaiting / clientsClaim — el SW espera.
        skipWaiting: false,
        clientsClaim: false,
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));

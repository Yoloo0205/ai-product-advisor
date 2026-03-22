import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,          // port du front
    proxy: {
      // Toutes les requêtes /api/* seront redirigées vers Flask (port 5000)
      // Ça évite les problèmes de CORS en développement
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
    },
  },
});
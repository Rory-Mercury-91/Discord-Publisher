import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react(),

    // 🔍 Analyse visuelle du bundle (ouvre dist/stats.html après build)
    visualizer({
      filename: "dist/stats.html",
      open: true,
      gzipSize: true,
      brotliSize: true,
    }),
  ],

  build: {
    chunkSizeWarningLimit: 1000, // évite le warning 500kb

    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes("node_modules")) {
            // Séparation plus intelligente des vendors

            if (id.includes("react")) {
              return "vendor-react";
            }

            if (id.includes("@tauri-apps")) {
              return "vendor-tauri";
            }

            if (id.includes("lodash")) {
              return "vendor-lodash";
            }

            if (id.includes("date-fns")) {
              return "vendor-date";
            }

            // fallback pour le reste des dépendances
            return "vendor";
          }
        },
      },
    },
  },
});

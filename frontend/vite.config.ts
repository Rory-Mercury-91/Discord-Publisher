import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const supabaseUrl = (env.VITE_SUPABASE_URL || "").replace(/\/+$/, "") || "https://ffsdgocbhghyermqqwlv.supabase.co";

  return {
    plugins: [
      react(),
      visualizer({
        filename: "dist/stats.html",
        open: true,
        gzipSize: true,
        brotliSize: true,
      }),
    ],
    resolve: {
      dedupe: ["react", "react-dom"],
    },
    build: {
      chunkSizeWarningLimit: 1000,
    },
    server: {
      proxy: {
        "/functions": {
          target: supabaseUrl,
          changeOrigin: true,
          secure: true,
          configure(proxy) {
            proxy.on("proxyReq", (proxyReq) => {
              if (!proxyReq.getHeader("authorization") && env.VITE_SUPABASE_ANON_KEY) {
                proxyReq.setHeader("Authorization", `Bearer ${env.VITE_SUPABASE_ANON_KEY}`);
              }
            });
          },
        },
      },
    },
  };
});

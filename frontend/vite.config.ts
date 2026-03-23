import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const pkg = require("./package.json") as { version: string };

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());
  const backendPort = env.VITE_BACKEND_PORT || "8000";

  return {
    plugins: [react(), tailwindcss()],
    define: {
      // Exposes the version from package.json to the app at build time.
      // Use as: __APP_VERSION__ (string literal, no import needed).
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: `http://localhost:${backendPort}`,
          changeOrigin: true,
          // Backend already uses /api/v1 prefix — no rewrite needed
        },
      },
    },
  };
});

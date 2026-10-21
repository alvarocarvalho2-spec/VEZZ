import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { cpSync, mkdirSync, readFileSync } from "node:fs";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const local = env.VEZZ_DATA_MODE === "local";
  const headers = Object.fromEntries(
    JSON.parse(readFileSync("vercel.json", "utf8")).headers[0].headers.map(
      (h: { key: string; value: string }) => [h.key, h.value],
    ),
  );
  // React Fast Refresh injects a development-only inline preamble. Production
  // preview and deployments retain the original strict script policy.
  const devHeaders = {
    ...headers,
    "Content-Security-Policy": String(headers["Content-Security-Policy"])
      .replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
      .replace(
        "connect-src 'self'",
        "connect-src 'self' ws://127.0.0.1:* ws://localhost:*",
      ),
  };
  return {
    plugins: [
      react(),
      {
        name: "vezz-assets",
        closeBundle() {
          mkdirSync("dist/assets", { recursive: true });
          cpSync("assets", "dist/assets", { recursive: true });
        },
      },
    ],
    publicDir: false,
    define: { __VEZZ_LOCAL__: JSON.stringify(local) },
    server: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: true,
      headers: devHeaders,
      fs: {
        deny: ["**/.git/**", "**/.env", "**/.env.*", "**/*.{crt,pem,key}", "**/video-vezz/**"],
      },
    },
    preview: { host: "127.0.0.1", port: 4173, strictPort: true, headers },
    build: { target: "es2022", chunkSizeWarningLimit: 700 },
  };
});

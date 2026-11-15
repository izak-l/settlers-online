import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig(({ mode }) => {
  // Read the repo's .env / .env.local, but pass ONLY these values to the browser.
  // The rest of that env holds server secrets (database URL); never expose it wholesale.
  const env = loadEnv(mode, ROOT, "");
  return {
    plugins: [react()],
    define: {
      __SUPABASE_URL__: JSON.stringify(env["SUPABASE_URL"] ?? ""),
      __SUPABASE_KEY__: JSON.stringify(env["SUPABASE_ANON_KEY"] ?? ""),
      __SERVER_URL__: JSON.stringify(
        env["SERVER_URL"] ?? `http://localhost:${env["PORT"] ?? 3000}`,
      ),
      __DEV_AUTH__: JSON.stringify(mode === "development" && env["AUTH_MODE"] === "dev"),
    },
    server: { port: 5173, strictPort: true },
  };
});

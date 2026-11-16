import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));

/** Load the repo's .env.local then .env. Real environment variables always win; .env.local beats .env. */
export function loadEnvFiles(): void {
  for (const file of [".env.local", ".env"]) {
    const path = ROOT + file;
    if (existsSync(path)) process.loadEnvFile(path);
  }
}

const ConfigSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().int().default(3000),
  /** Allowed browser origins for Socket.IO, comma-separated (e.g. a custom domain and *.pages.dev). */
  WEB_ORIGIN: z
    .string()
    .default("http://localhost:5173")
    .transform((s) =>
      s
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean),
    ),
  DATABASE_URL: z.string().optional(),
  /** "dev" adds sign-in as any username, alongside Supabase. */
  AUTH_MODE: z.enum(["supabase", "dev"]).default("supabase"),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_JWT_SECRET: z.string().optional(),
  /** Save a state snapshot every N actions. */
  SNAPSHOT_EVERY: z.coerce.number().int().positive().default(25),
});

export type Config = z.infer<typeof ConfigSchema>;

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const config = ConfigSchema.parse(env);
  if (config.AUTH_MODE === "dev" && config.NODE_ENV === "production") {
    throw new Error("AUTH_MODE=dev is not allowed when NODE_ENV=production");
  }
  return config;
}

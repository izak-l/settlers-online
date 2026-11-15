import pg from "pg";
import { anyOf, devAuthenticator, type Authenticator } from "./auth";
import { loadEnvFiles, readConfig } from "./config";
import { migrate } from "./db/migrate";
import { startServer } from "./server";
import { MemoryStore } from "./store/memory";
import { PgStore } from "./store/postgres";
import type { Store } from "./store/types";

loadEnvFiles();
const config = readConfig();

let store: Store;
if (config.DATABASE_URL) {
  const pool = new pg.Pool({ connectionString: config.DATABASE_URL });
  await migrate(pool);
  store = new PgStore(pool);
} else {
  console.warn("DATABASE_URL is not set: games are kept in memory and lost on restart.");
  store = new MemoryStore();
}
// Supabase sign-in (step 4d) plugs in here.
const auths: Authenticator[] = [];
if (config.AUTH_MODE === "dev") auths.push(devAuthenticator);
const auth = anyOf(...auths);

const server = await startServer({ config, store, auth, port: config.PORT });
console.log(`Settlers server listening on ${server.url} (auth: ${config.AUTH_MODE})`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void server
      .close()
      .then(() => store.close())
      .finally(() => process.exit(0));
  });
}

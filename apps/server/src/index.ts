import { anyOf, devAuthenticator, type Authenticator } from "./auth";
import { loadEnvFiles, readConfig } from "./config";
import { startServer } from "./server";
import { MemoryStore } from "./store/memory";
import type { Store } from "./store/types";

loadEnvFiles();
const config = readConfig();

// Postgres (step 4c) and Supabase sign-in (step 4d) plug in here.
const store: Store = new MemoryStore();
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

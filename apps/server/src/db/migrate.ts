import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";
import { loadEnvFiles, readConfig } from "../config";

/**
 * The SQL migrations folder: next to the source by default, or MIGRATIONS_DIR (the bundled
 * production server lives elsewhere; see the Dockerfile).
 */
export function migrationsDir(env: NodeJS.ProcessEnv = process.env): string {
  const dir = env["MIGRATIONS_DIR"] ?? fileURLToPath(new URL("../../migrations/", import.meta.url));
  return dir.endsWith("/") ? dir : `${dir}/`;
}
const LOCK_ID = 727_274; // any constant; stops two processes migrating at once

/** Apply every migrations/*.sql not yet recorded, in name order, each in its own transaction. */
export async function migrate(
  pool: pg.Pool,
  log: (msg: string) => void = console.log,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("select pg_advisory_lock($1)", [LOCK_ID]);
    await client.query(
      "create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())",
    );
    const done = new Set(
      (await client.query<{ name: string }>("select name from schema_migrations")).rows.map(
        (r) => r.name,
      ),
    );
    const MIGRATIONS = migrationsDir();
    const files = (await readdir(MIGRATIONS)).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files) {
      if (done.has(file)) continue;
      const sql = await readFile(MIGRATIONS + file, "utf8");
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("insert into schema_migrations (name) values ($1)", [file]);
        await client.query("commit");
        log(`migrated ${file}`);
      } catch (err) {
        await client.query("rollback");
        throw err;
      }
    }
  } finally {
    await client.query("select pg_advisory_unlock($1)", [LOCK_ID]).catch(() => undefined);
    client.release();
  }
}

// `pnpm db:migrate`
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  loadEnvFiles();
  const { DATABASE_URL } = readConfig();
  if (!DATABASE_URL) throw new Error("DATABASE_URL is not set");
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  await migrate(pool);
  await pool.end();
}

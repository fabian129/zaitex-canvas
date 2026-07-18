// Lokal bevis-stack utan containers: embedded Postgres (npm) + canvas-migrationerna + seed.
// Används i sandboxar/lokal dev där varken Supabase-molnet eller Docker-registryn nås.
// Kör:  node scripts/local-stack.mjs          (startar och ligger kvar i förgrunden)
// Appen pekas om via .env.local:
//   NEXT_PUBLIC_SUPABASE_URL=http://localhost:3000/sb-local   (REST-shim i appen)
//   CANVAS_LOCAL_PG_URL=postgres://postgres:postgres@127.0.0.1:55432/postgres
//   CANVAS_LOCAL_MEDIA=1
//   CANVAS_VERB_KEY=lokal-dev-verbnyckel-byt-aldrig-i-prod

import EmbeddedPostgres from "embedded-postgres";
import { readFileSync, readdirSync, existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dataDir = path.join(root, ".local-pg");
const PORT = 55432;

const fresh = process.argv.includes("--fresh");
if (fresh && existsSync(dataDir)) rmSync(dataDir, { recursive: true, force: true });
const initial = !existsSync(dataDir);

const epg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "postgres",
  password: "postgres",
  port: PORT,
  persistent: true,
  // Sandboxen kör som root: initdb vägrar root, så en postgres-systemanvändare
  // skapas och databaskatalogen ägs av den.
  createPostgresUser: true,
});

if (initial) await epg.initialise();
await epg.start();
console.log(`[local-stack] Postgres uppe på :${PORT} (data: ${dataDir})`);

if (initial) {
  const client = new pg.Client({
    host: "127.0.0.1",
    port: PORT,
    user: "postgres",
    password: "postgres",
    database: "postgres",
  });
  await client.connect();
  const run = async (label, sql) => {
    console.log(`[local-stack] kör ${label}`);
    await client.query(sql);
  };
  await run("bootstrap", readFileSync(path.join(root, "scripts/local-bootstrap.sql"), "utf8"));
  const migDir = path.join(root, "supabase/migrations");
  for (const f of readdirSync(migDir).sort()) {
    if (f.endsWith(".sql")) await run(f, readFileSync(path.join(migDir, f), "utf8"));
  }
  await run("seed.sql", readFileSync(path.join(root, "supabase/seed.sql"), "utf8"));
  await client.end();
  console.log("[local-stack] schema + seed klart");
}

console.log("[local-stack] redo — Ctrl+C stoppar");
const stop = async () => {
  console.log("\n[local-stack] stoppar…");
  await epg.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
// håll processen vid liv
setInterval(() => {}, 60_000);

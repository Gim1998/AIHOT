// One-time, explicit provisioning. Never run migrations during a request or Vercel build.
// node --env-file=<private deployment env> scripts/prepare-vercel-db.ts
import { spawnSync } from "node:child_process";
import { PgBoss } from "pg-boss";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
for (const script of ["migrate.ts", "seed.ts"]) {
  const child = spawnSync(process.execPath, [new URL(script, import.meta.url).pathname], {
    stdio: "inherit", env: { ...process.env, COLLECT_ENABLED: "false", MODEL_CALLS_ENABLED: "false" },
  });
  if (child.status !== 0) process.exit(child.status ?? 1);
}
const boss = new PgBoss({ connectionString: process.env.DATABASE_URL, schema: "pgboss", schedule: false, supervise: false });
await boss.start();
await boss.stop();
console.log("Database and job schema ready; no collection or model calls performed.");

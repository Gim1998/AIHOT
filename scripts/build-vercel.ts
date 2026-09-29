// Assemble Node.js 24 functions from the existing SSR build and production dependencies.
// Explicit allowlist: no .env, Git metadata, screenshots, test databases, or local credentials.
import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, readdir, stat, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { API_OWNED_PATTERNS } from "@aihot/contracts/http-policy";
import { COLLECTION } from "@aihot/industry/collection";

const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, ".vercel/output");
const modules = execFileSync("npm", ["ls", "--omit=dev", "--all", "--parseable"], { cwd: root, encoding: "utf8" })
  .trim().split("\n").filter((file) => file.startsWith(path.join(root, "node_modules") + path.sep));
const workspaces: Record<string, string> = {
  api: "apps/api", backend: "packages/backend", contracts: "packages/contracts", industry: "industry", web: "apps/web", worker: "apps/worker",
};
const files = ["package.json", "packages/backend/package.json", "packages/backend/src", "packages/contracts/package.json", "packages/contracts/src",
  "apps/api/package.json", "apps/api/src", "apps/web/package.json", "apps/web/server.ts", "apps/web/build/server", "industry", "assets", "reference"];

async function bytes(directory: string): Promise<number> {
  let total = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const file = path.join(directory, entry.name);
    total += entry.isDirectory() ? await bytes(file) : (await stat(file)).size;
  }
  return total;
}

await mkdir(path.join(output, "functions"), { recursive: true });
await cp(path.join(root, "apps/web/build/client"), path.join(output, "static"), { recursive: true });
for (const name of ["web", "api", "cron"]) {
  const target = path.join(output, "functions", `${name}.func`);
  await mkdir(target, { recursive: true });
  for (const file of files) {
    const source = path.join(root, file);
    if (await stat(source).then(() => true, () => false)) await cp(source, path.join(target, file), { recursive: true });
  }
  for (const module of modules) {
    const relative = path.relative(root, module);
    if (relative.startsWith("node_modules/@aihot/")) continue;
    await cp(module, path.join(target, relative), { recursive: true, dereference: true });
  }
  const links = path.join(target, "node_modules/@aihot");
  await mkdir(links, { recursive: true });
  for (const [workspace, directory] of Object.entries(workspaces)) {
    // Unused workspace links are harmless; source packages resolve to their real repository layout.
    const link = path.join(links, workspace);
    if (!(await stat(link).then(() => true, () => false))) {
      await symlink(path.relative(links, path.join(target, directory)), link).catch((error: NodeJS.ErrnoException) => { if (error.code !== "EEXIST") throw error; });
    }
  }
  await cp(path.join(root, "deploy/vercel-handler.mjs"), path.join(target, "index.mjs"));
  await writeFile(path.join(target, ".vc-config.json"), JSON.stringify({
    runtime: "nodejs24.x", handler: "index.mjs", launcherType: "Nodejs", supportsResponseStreaming: true,
    maxDuration: name === "cron" ? 300 : 60,
  }, null, 2));
  const size = await bytes(target);
  if (size >= 250 * 1024 * 1024) throw new Error(`${name} exceeds the Vercel function size limit`);
  console.log(`${name}: ${(size / 1024 / 1024).toFixed(1)} MiB`);
}
const vercel = JSON.parse(await readFile(path.join(root, "vercel.json"), "utf8"));
if (JSON.stringify(vercel.crons.map((cron: { schedule: string }) => cron.schedule)) !== JSON.stringify(COLLECTION.utcSchedules)) throw new Error("Vercel cron schedules differ from the industry cadence");
await writeFile(path.join(output, "config.json"), JSON.stringify({
  version: 3,
  routes: [
    { src: "^/api/cron/collect$", dest: "/cron" },
    ...API_OWNED_PATTERNS.map((pattern) => ({ src: pattern.source, dest: "/api" })),
    { src: "^/assets/.*", headers: { "Cache-Control": "public, max-age=31536000, immutable" }, continue: true },
    { handle: "filesystem" },
    { src: "/.*", dest: "/web" },
  ],
}, null, 2));

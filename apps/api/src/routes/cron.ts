import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { runCollectionBatch } from "@aihot/backend/jobs/serverless";

export function registerCron(app: FastifyInstance) {
  app.get("/api/cron/collect", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const secret = process.env.CRON_SECRET ?? "";
    const expected = Buffer.from(`Bearer ${secret}`);
    const given = Buffer.from(req.headers.authorization ?? "");
    if (secret.length < 32 || given.length !== expected.length || !timingSafeEqual(given, expected)) return reply.code(401).send({ error: "Unauthorized" });
    if (process.env.COLLECT_ENABLED === "false") return { status: "disabled" };
    return runCollectionBatch();
  });
}

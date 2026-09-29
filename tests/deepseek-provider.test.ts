// Failure cases: legacy providers/overrides, missing credentials, key exfiltration via a custom
// endpoint or redirect, malformed JSON, provider errors echoing keys, and a cron deadline overrun.
import { Reply, stub, tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { z } from "zod";
import { config } from "@aihot/backend/config";
import { sql, closeDb } from "@aihot/backend/db";
import { chatJson, MODELS } from "@aihot/backend/providers/llm";
import { CAPABILITIES, modelFor } from "@aihot/backend/editorial/models";
import { embeddingsAvailable, ensureEmbeddings } from "@aihot/backend/providers/embeddings";
import { withinDeadline } from "@aihot/backend/lib/deadline";

let mode = "ok";
let body: Record<string, any>;
const provider = await stub(async (_hit, req) => {
  body = JSON.parse(req.body);
  if (mode === "error") return new Reply(401, { error: { message: "test-secret-should-not-leak" } });
  if (mode === "slow") await new Promise((resolve) => setTimeout(resolve, 200));
  return { choices: [{ message: { content: '{"answer":"ready"}' } }], usage: { prompt_tokens: 3, completion_tokens: 2 } };
});
process.env.DEEPSEEK_BASE_URL = provider.url;
process.env.DEEPSEEK_API_KEY = "test-secret-should-not-leak";
config.allowPrivateNetworkFetch = true;
const ask = () => chatJson({ model: "deepseek-flash", purpose: "deepseek-test", subject: tag(), promptVersion: tag(), system: "Return an answer.", user: "Ready?", schema: z.object({ answer: z.string() }) });
after(async () => { await provider.close(); await closeDb(); });

test("only DeepSeek Flash can be selected, even with stale stored choices", async () => {
  assert.deepEqual(Object.keys(MODELS), ["deepseek-flash"]);
  await sql`INSERT INTO settings(key,value) VALUES ('models.score', '{"model":"retired-model"}') ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value`;
  process.env.SCORE_MODEL = "retired-model";
  for (const key of Object.keys(CAPABILITIES) as Array<keyof typeof CAPABILITIES>) assert.equal(await modelFor(key), "deepseek-flash");
  assert.equal(embeddingsAvailable(), false);
  assert.equal((await ensureEmbeddings("article", [{ id: tag(), text: "No embedding provider" }])).size, 0);
  assert.equal(provider.hits(), 0);
});

test("one DeepSeek key produces JSON, usage receipts, and disabled thinking", async () => {
  const result = await ask();
  assert.deepEqual(result.data, { answer: "ready" });
  assert.equal(body.model, "deepseek-flash");
  assert.deepEqual(body.thinking, { type: "disabled" });
  assert.deepEqual(body.response_format, { type: "json_object" });
  assert.match(JSON.stringify(body.messages), /json/i);
  const [receipt] = await sql`SELECT service,model FROM receipts WHERE id=${result.receiptId}`;
  assert.equal(receipt!.service, "deepseek");
  assert.equal(receipt!.model, "deepseek-flash");
});

test("missing credentials and a non-DeepSeek endpoint are rejected before requests", async () => {
  const before = provider.hits();
  delete process.env.DEEPSEEK_API_KEY;
  await assert.rejects(ask(), /DEEPSEEK_API_KEY/);
  process.env.DEEPSEEK_API_KEY = "test-secret-should-not-leak";
  process.env.DEEPSEEK_BASE_URL = "https://example.org";
  await assert.rejects(ask(), /DeepSeek endpoint/);
  process.env.DEEPSEEK_BASE_URL = provider.url;
  assert.equal(provider.hits(), before);
});

test("provider error messages cannot echo credentials", async () => {
  mode = "error";
  await assert.rejects(ask(), (error: Error) => error.message.includes("HTTP 401") && !error.message.includes("test-secret"));
  mode = "ok";
});

test("model requests obey the invocation deadline", async () => {
  mode = "slow";
  const start = Date.now();
  await assert.rejects(withinDeadline(40, ask));
  assert.ok(Date.now() - start < 150);
});

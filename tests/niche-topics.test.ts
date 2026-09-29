// A new industry must replace the public topic directory without deleting its historical rows.
import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { sql, closeDb } from "@aihot/backend/db";
import { seedTopics, listTopics, loadTopic } from "@aihot/backend/publication/topics";
after(closeDb);
test("seeding the current industry hides retired topics and is repeatable", async () => {
  const retired = `old-industry-${tag()}`;
  await sql`INSERT INTO topics(slug,name,grp,tags,definition,related,position) VALUES (${retired},'Retired topic','field',ARRAY['old'],'old',ARRAY[]::text[],999)`;
  await seedTopics();
  await seedTopics();
  assert.equal(await loadTopic(retired), null);
  assert.equal((await sql`SELECT active FROM topics WHERE slug=${retired}`)[0]!.active, false);
  const topics = await listTopics();
  assert.equal(topics.length, 0);
});

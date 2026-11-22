// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/nl2sql/executor.setup.selftest.ts </dev/null
// The read-only executor's SETUP is one round trip (a SELECT of set_config(..., true) calls with bound parameters), not five SET LOCAL statements: the database is ~100 ms away, so each trip is felt.
// Proved identical to SET LOCAL on the real database (role, search path, timeouts, read-only state, refusals, reset after ROLLBACK); this test pins the shape of what is sent.

import { runReadOnly } from "./executor";
import type { SqlClient } from "./types";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => { if (cond) pass++; else { fail++; console.log(`FAIL ${name} ${extra}`); } };

interface Sent { text: string; params?: unknown[] }
const recording = (rows: Array<Record<string, unknown>> = [{ n: 1 }]) => {
  const sent: Sent[] = [];
  const client: SqlClient = {
    async query(text, params) {
      sent.push({ text, params });
      if (/^SELECT \* FROM \(/.test(text)) return { rows, fields: [{ name: "n" }] };
      return { rows: [] };
    },
  };
  return { client, sent };
};

(async () => {
  const a = recording();
  await runReadOnly(a.client, "SELECT 1 AS n", {});
  const texts = a.sent.map((s) => s.text);
  ok("the sequence is BEGIN READ ONLY, ONE setup query, the query itself, ROLLBACK (four trips, not eight)", texts.length === 4 && texts[0] === "BEGIN READ ONLY" && /^SELECT set_config\(/.test(texts[1]) && /^SELECT \* FROM \(/.test(texts[2]) && texts[3] === "ROLLBACK", texts.join(" | "));
  ok("no SET LOCAL statement is sent any more", !texts.some((t) => /^SET LOCAL/i.test(t)));
  const setup = a.sent[1];
  ok("every setting is transaction-local (the third argument is the literal true) and every name and value is a bound parameter", (setup.text.match(/set_config\(\$\d+, \$\d+, true\)/g) ?? []).length === 5 && !/nlq_reader|statement_timeout|search_path/.test(setup.text), setup.text);
  ok("the parameters are, in order: the timeouts, the role, then the search path", JSON.stringify(setup.params) === JSON.stringify(["statement_timeout", "5000", "lock_timeout", "1000", "idle_in_transaction_session_timeout", "15000", "role", "nlq_reader", "search_path", "nlq, pg_catalog"]), JSON.stringify(setup.params));

  const b = recording();
  await runReadOnly(b.client, "SELECT 1 AS n", { role: null, timeoutMs: 2500 });
  ok("with no role (the connection already logs in as the restricted role) there is no role setting, and the timeout given is used", !(b.sent[1].params ?? []).includes("role") && (b.sent[1].params ?? [])[1] === "2500" && (b.sent[1].text.match(/set_config/g) ?? []).length === 4);

  const c = recording();
  await runReadOnly(c.client, "SELECT 1 AS n", { role: 'x"; DROP TABLE y; --' });
  ok("a hostile role name travels as a value, never in the text", !/DROP/.test(c.sent[1].text) && (c.sent[1].params ?? []).includes('x"; DROP TABLE y; --'));

  // the ROLLBACK is sent even when the query fails
  const sent: string[] = [];
  const failing: SqlClient = { async query(text) { sent.push(text); if (/^SELECT \* FROM \(/.test(text)) throw new Error("boom"); return { rows: [] }; } };
  let threw = false;
  try { await runReadOnly(failing, "SELECT 1 AS n", {}); } catch { threw = true; }
  ok("a failing query still ends in ROLLBACK and the error reaches the caller", threw && sent[sent.length - 1] === "ROLLBACK");
  // text that could start a second statement is refused before anything is sent
  const d = recording();
  let refused = false;
  try { await runReadOnly(d.client, "SELECT 1; DROP TABLE x", {}); } catch { refused = true; }
  ok("a semicolon or comment is refused before any trip to the database", refused && d.sent.length === 0);

  console.log(`executor setup: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

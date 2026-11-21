// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/security/answerSql.selftest.ts
// The SQL of a model answer never leaves the server.
import { readFileSync } from "fs";
import { withoutSql } from "./answerSql";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => { if (cond) pass++; else { fail++; console.log(`FAIL ${name} ${extra}`); } };

const answer = { kind: "count", answer: "2 people found.", nl2sql: { logId: 7, sql: "SELECT ticket_no FROM nlq.employees WHERE name = 'X'", confidence: "high", attempts: 1, scope: null } };
const out = withoutSql(answer);
ok("the SQL is emptied", out.nl2sql.sql === "");
ok("...and nothing else of the block changes", out.nl2sql.logId === 7 && out.nl2sql.confidence === "high" && out.nl2sql.attempts === 1 && out.answer === "2 people found.");
ok("the answer given is not changed (a copy)", answer.nl2sql.sql.startsWith("SELECT"));
ok("no table or column name is left anywhere in the text that leaves", !/nlq\.|ticket_no|SELECT/.test(JSON.stringify(out)));
ok("an answer without a model block is returned as it is", JSON.stringify(withoutSql({ kind: "count", answer: "1" })) === JSON.stringify({ kind: "count", answer: "1" }));
ok("a block nested deeper is emptied too", (withoutSql({ a: [{ nl2sql: { sql: "SELECT 1" } }] }) as any).a[0].nl2sql.sql === "");
ok("null, text and numbers pass through", withoutSql(null) === null && withoutSql("x") === "x" && withoutSql(3) === 3);

// the search route really uses it, and the screen no longer draws the SQL or the model's "Understood as" line
const route = readFileSync("src/app/api/ai-search/route.ts", "utf8");
ok("the search route empties the SQL on its way out", /withoutSql\(/.test(route) && /from "@\/lib\/security\/answerSql"/.test(route));
const extras = readFileSync("src/components/Nl2SqlAnswerExtras.tsx", "utf8");
ok("the answer extras draw no SQL", !/SQL the model wrote|formatSqlForDisplay|<pre/.test(extras));
const modal = readFileSync("src/components/OmnibarModal.tsx", "utf8");
ok("the model's 'Understood as' line is not drawn (the other lookups keep theirs)", /analytics\.interpretation && !analytics\.nl2sql/.test(modal));
const log = readFileSync("src/lib/nl2sql/log.ts", "utf8");
ok("the SQL is written to the server log in development", /\[nl2sql\]/.test(log) && /NODE_ENV/.test(log));

console.log(`answerSql selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

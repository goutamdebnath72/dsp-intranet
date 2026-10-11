// src/lib/nl2sql/circularSources.selftest.ts
// Run:  npx tsx src/lib/nl2sql/circularSources.selftest.ts      (no database: the lookups are answered by stand-ins)
import { buildCircularSources, type RunQuery } from "./circularSources";

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) pass++;
  else {
    fail++;
    console.log(`  FAIL  ${label}${detail ? " -- " + detail : ""}`);
  }
};

const L3 = "Circular 003 (2024)";
const L9 = "Circular 009 (2024)";
const META = [
  { circular: L3, circular_id: 23, circular_title: "CIRCULAR-HEALTH CHECK UP OF NON-EXECUTIVE EMPLOYEES DURING THE MONTH OF JANUARY-2025" },
  { circular: L9, circular_id: 30, circular_title: "CIRCULAR-HEALTH CHECK-UP FOR NON-EXECUTIVE EMPLOYEES DURING THE MONTH OF DECEMBER-2024" },
];
const PAGES = [
  { circular: L3, ticket_no: "100001", name: "AMIT BANERJEE", page_number: 3 },
  { circular: L3, ticket_no: "100002", name: "RITA SEN", page_number: 4 },
  { circular: L3, ticket_no: "100099", name: "SOMEONE NOT IN THE ANSWER", page_number: 7 }, // must not add page 7
  { circular: L9, ticket_no: "100001", name: "AMIT BANERJEE", page_number: 8 },
  { circular: L3, ticket_no: null, name: "NO TICKET PERSON", page_number: 5 },
];
function fake(meta = META, pages = PAGES) {
  const seen: Array<{ sql: string; params: unknown[] }> = [];
  const run: RunQuery = async (sql, params) => {
    seen.push({ sql, params });
    if (/SELECT DISTINCT circular, circular_id/.test(sql)) return meta.filter((m) => (params[0] as string[]).includes(m.circular));
    if (/page_number IS NOT NULL/.test(sql)) return pages.filter((p) => (params[0] as string[]).includes(p.circular));
    return [];
  };
  return { run, seen };
}
const cols = ["ticket_no", "name", "department_code", "department", "checkup_date", "circular", "verified"];
const row = (ticket_no: string | null, name: string, circular: string) => ({ ticket_no, name, department_code: 1, department: "X", checkup_date: "2025-01-15", circular, verified: true });

(async () => {
  // 1. one schedule: one source, with the page(s) of the listed people only
  {
    const f = fake();
    const s = await buildCircularSources(cols, [row("100001", "AMIT BANERJEE", L3), row("100002", "RITA SEN", L3)], f.run);
    check("one circular: one source with its id, label, full title and the pages of the listed people (3 and 4), not the page of someone not in the answer (7)", s.length === 1 && s[0].circularId === 23 && s[0].label === L3 && /JANUARY-2025/.test(s[0].title) && s[0].pages.join() === "3,4", JSON.stringify(s));
  }
  // 2. two schedules: one source each, in the order they first appear
  {
    const s = await buildCircularSources(cols, [row("100001", "AMIT BANERJEE", L9), row("100001", "AMIT BANERJEE", L3)], fake().run);
    check("a person on two schedules: one source per circular, in the order the answer shows them (December first here), each with its own page", s.map((x) => x.circularId).join() === "30,23" && s[0].pages.join() === "8" && s[1].pages.join() === "3", JSON.stringify(s));
  }
  // 3. the same circular on many rows is one source
  {
    const s = await buildCircularSources(cols, [row("100001", "AMIT BANERJEE", L3), row("100002", "RITA SEN", L3), row("100001", "AMIT BANERJEE", L3)], fake().run);
    check("many rows of one circular give ONE source line (not one per row)", s.length === 1);
  }
  // 4. a person without a (shown) ticket is found by name
  {
    const s = await buildCircularSources(cols, [row(null, "NO TICKET PERSON", L3)], fake().run);
    check("a row with no ticket is placed by name (page 5)", s.length === 1 && s[0].pages.join() === "5", JSON.stringify(s));
  }
  // 5. what is not a health check-up answer, or has nothing to look up
  {
    const f = fake();
    check("an answer without a 'circular' column gets no source line and no lookup is made", (await buildCircularSources(["ticket_no", "name"], [row("100001", "A", L3)], f.run)).length === 0 && f.seen.length === 0);
    check("no rows: nothing", (await buildCircularSources(cols, [], f.run)).length === 0 && f.seen.length === 0);
    check("rows whose circular is empty: nothing", (await buildCircularSources(cols, [{ ...row("1", "A", L3), circular: null as unknown as string }], f.run)).length === 0);
  }
  // 6. things that go wrong never break the answer
  {
    const boom: RunQuery = async () => { throw new Error("connection lost"); };
    check("a failing lookup gives NO source line (and no error): the answer itself is unaffected", (await buildCircularSources(cols, [row("100001", "A", L3)], boom)).length === 0);
    check("a circular whose id cannot be found has no link (never a link without an id)", (await buildCircularSources(cols, [row("100001", "A", L3)], fake([], PAGES).run)).length === 0);
    const noPages = await buildCircularSources(cols, [row("100001", "AMIT BANERJEE", L3)], fake(META, []).run);
    check("pages unknown: the source line is still given (the viewer opens at the first page)", noPages.length === 1 && noPages[0].pages.length === 0);
    const junk = await buildCircularSources(cols, [row("100001", "AMIT BANERJEE", L3)], fake([{ circular: L3, circular_id: "abc" as unknown as number, circular_title: "T" }], PAGES).run);
    check("a circular id that is not a whole number is never used", junk.length === 0);
    const oddPage = await buildCircularSources(cols, [row("100001", "AMIT BANERJEE", L3)], fake(META, [{ circular: L3, ticket_no: "100001", name: "AMIT BANERJEE", page_number: 0 }, { circular: L3, ticket_no: "100001", name: "AMIT BANERJEE", page_number: 2.5 }]).run);
    check("a page that is not a positive whole number is ignored", oddPage.length === 1 && oddPage[0].pages.length === 0);
  }
  // 7. the lookups are parameterised and read only the check-up view
  {
    const f = fake();
    await buildCircularSources(cols, [row("100001", "AMIT BANERJEE", L3)], f.run);
    check("both lookups read only nlq.health_checkups, and the values travel as parameters (nothing from the answer is pasted into the SQL)", f.seen.length === 2 && f.seen.every((q) => /FROM nlq\.health_checkups/.test(q.sql) && !/public\./.test(q.sql) && !q.sql.includes(L3) && !q.sql.includes("100001") && !q.sql.includes("AMIT")), JSON.stringify(f.seen.map((q) => q.sql.slice(0, 60))));
  }
  console.log(`\ncircularSources selftest: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

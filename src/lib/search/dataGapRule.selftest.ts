/** Self-test of the data-gap routing rule. Run: npx tsx --tsconfig tsconfig.json src/lib/search/dataGapRule.selftest.ts (no database, no model). */
import { PLAIN_DATA_GAP, continueToCirculars, friendlyUnanswerable } from "./dataGapRule";
import { directoryWordIn, namesSomeone } from "./frontGate";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };

const WORDS = new Set(["sanjay", "debnath", "kumar", "mazumdar", "roy", "arup", "das"]);
const load = async () => WORDS;
const gap = { kind: "clarify", unanswerable: true };
const go = (q: string, p: { kind?: string; unanswerable?: boolean } | null = gap, ctx = { isNameShaped: false, deptMentioned: false }, loader: () => Promise<ReadonlySet<string>> = load) => continueToCirculars(p, q, loader, ctx);

(async () => {
  // ---- the case that started it: nobody is named, the data has no room column
  ok("THE CASE: the pathology room question goes on to the circulars", await go("which pathology room should non-executive employees report to for the health check-up in January 2026?"));
  ok("a question about a rule or a place with people-data words goes on", await go("where do executives collect the health check-up report"));
  ok("a general question the data cannot answer goes on", await go("what is the average salary of executives"));

  // ---- a particular person, ticket or department: the explanation is final
  ok("a salary of a NAMED person stays final (the directory word 'sanjay')", !(await go("what is the salary of sanjay debnath")));
  ok("a ticket number stays final", !(await go("which room is ticket 228757 to report to")));
  ok("a person's name as the whole question stays final", !(await go("sanjay debnath", gap, { isNameShaped: true, deptMentioned: false })));
  ok("a department stays final", !(await go("what is the budget of the c&it department", gap, { isNameShaped: false, deptMentioned: true })));
  ok("a plural surname ('mazumdars') counts as a person", !(await go("what is the salary of all mazumdars")));

  // ---- only a data gap goes on
  ok("a clarifying question is never sent on", !(await go("which sanjay?", { kind: "clarify" })));
  ok("an answer is never sent on", !(await go("how many executives are there", { kind: "count" })));
  ok("no payload: nothing to continue", !(await go("anything", null)));

  // ---- what it cannot judge keeps today's behaviour
  ok("the directory's name list unavailable: final", !(await go("which pathology room?", gap, { isNameShaped: false, deptMentioned: false }, async () => { throw new Error("db down"); })));
  ok("an empty name list: final", !(await go("which pathology room?", gap, { isNameShaped: false, deptMentioned: false }, async () => new Set<string>())));
  ok("a Hindi question is not judged: final", !(await go("स्वास्थ्य जांच कमरा कौन सा है")));
  ok("an empty question is final", !(await go("   ")));

  // ---- the shared test of the front-path gate
  ok("namesSomeone: a directory word", namesSomeone("salary of arup", { isNameShaped: false, directoryWords: WORDS }));
  ok("namesSomeone: a ticket-like number", namesSomeone("room for 228757", { isNameShaped: false, directoryWords: WORDS }));
  ok("namesSomeone: the people-data words alone do not name anyone", !namesSomeone("which room for non-executive employees health check-up", { isNameShaped: false, directoryWords: WORDS }));
  ok("namesSomeone: a year is not a ticket", !namesSomeone("health check-up in 2026", { isNameShaped: false, directoryWords: WORDS }));
  ok("directoryWordIn: finds a plural by its singular and reports the word as typed", directoryWordIn("all roys", WORDS) === "roys" && directoryWordIn("all roy", WORDS) === "roy" && directoryWordIn("all strangers", WORDS) === null);

  // ---- the explanation as shown
  ok("a plain explanation is kept", friendlyUnanswerable("This data does not include salary.") === "This data does not include salary.");
  ok("a message naming the view and the column is replaced", friendlyUnanswerable("The health_checkups view does not include a pathology-room column, so this information cannot be retrieved from the available data") === PLAIN_DATA_GAP);
  ok("a message with 'nlq.employees' is replaced", friendlyUnanswerable("nlq.employees has no salary field") === PLAIN_DATA_GAP);
  ok("an empty message becomes the plain one", friendlyUnanswerable("  ") === PLAIN_DATA_GAP);
  ok("a message with 'table' in ordinary words is replaced too (a reader does not need it)", friendlyUnanswerable("The table has no such field.") === PLAIN_DATA_GAP);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

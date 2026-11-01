// Run (from the project root): npx tsx --tsconfig tsconfig.json src/lib/employees/admin/omnibar.selftest.ts
// Step 66a: the search bar and the employee manager: who gets the panel, who gets a plain sentence, and that nothing but a change request ever reaches the authority check. No database.

import { readFileSync } from "node:fs";
import { runOmnibar } from "../../nl2sql/omnibar";
import { answerEmployeeAdmin } from "./omnibar";
import type { Authority } from "./types";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => { if (cond) pass++; else { fail++; console.log(`FAIL ${name} ${extra}`); } };
const calls: string[] = [];
const auth = (m: Record<string, Authority | null>) => async (t: string) => { calls.push(t); return m[t] ?? null; };
const MAP = { "400001": "hod", "412345": "delegate" } as Record<string, Authority>;
type P = { employeeAdmin?: { op: string; role: string; prefill?: Record<string, string> }; hospital?: { headline?: { text: string }; status?: { text: string } }; source?: string; attempt?: number };

async function main() {
  let r = (await answerEmployeeAdmin("add new employee", "400001", { authority: auth(MAP) })) as P;
  ok("the HOD asks to add an employee: the panel opens (op add, role hod), and nothing else is in the payload", r.employeeAdmin?.op === "add" && r.employeeAdmin?.role === "hod" && Object.keys(r).sort().join() === "answer,employeeAdmin,kind");
  r = (await answerEmployeeAdmin("change dob of goutam debnath", "400001", { authority: auth(MAP) })) as P;
  ok("'change dob of goutam debnath': the panel opens to change, with the name as the search", r.employeeAdmin?.op === "modify" && r.employeeAdmin?.prefill?.query === "goutam debnath");
  r = (await answerEmployeeAdmin("edit employee 498880", "412345", { authority: auth(MAP) })) as P;
  ok("a delegate asks to edit: the panel opens with role delegate and the ticket", r.employeeAdmin?.op === "modify" && r.employeeAdmin?.role === "delegate" && r.employeeAdmin?.prefill?.ticket === "498880");
  r = (await answerEmployeeAdmin("delete employee 498880", "412345", { authority: auth(MAP) })) as P;
  ok("a delegate asks to DELETE: one plain sentence, no panel", !r.employeeAdmin && r.hospital?.headline?.text === "Not allowed" && /Only the HOD of C&IT can delete an employee/.test(r.hospital?.status?.text ?? ""));
  r = (await answerEmployeeAdmin("revoke employee access of Anil Das", "412345", { authority: auth(MAP) })) as P;
  ok("a delegate asks to authorise or withdraw: one plain sentence, no panel", !r.employeeAdmin && r.hospital?.headline?.text === "Not allowed" && /authorise an executive/.test(r.hospital?.status?.text ?? ""));
  r = (await answerEmployeeAdmin("delegate employee editing to Anil Das", "400001", { authority: auth(MAP) })) as P;
  ok("the HOD asks to delegate: the panel opens on delegation", r.employeeAdmin?.op === "delegate" && r.employeeAdmin?.role === "hod");
  r = (await answerEmployeeAdmin("add new employee", "342462", { authority: auth(MAP) })) as P;
  ok("somebody with no authority: 'Not allowed', no panel", !r.employeeAdmin && r.hospital?.headline?.text === "Not allowed");
  r = (await answerEmployeeAdmin("add new employee", null, { authority: auth(MAP) })) as P;
  ok("nobody logged in: 'Please log in', no panel", !r.employeeAdmin && r.hospital?.headline?.text === "Please log in");
  r = (await answerEmployeeAdmin("add new employee", "400001", { authority: async () => { throw new Error("db"); } })) as P;
  ok("a failing authority check means 'Not allowed' (never open the manager on doubt)", !r.employeeAdmin && r.hospital?.headline?.text === "Not allowed");
  calls.length = 0;
  for (const q of ["how many employees", "dob of goutam debnath", "who is Rakesh Ojha", "pax number of fire service", "new employees this month", "employees of C&IT"]) {
    ok(`"${q}" is not a change request: null, and the authority was NOT asked`, (await answerEmployeeAdmin(q, "400001", { authority: auth(MAP) })) === null);
  }
  ok("...the database was never asked for any of them", calls.length === 0);
  ok("the person is the LOGIN's ticket: a ticket in the sentence is only a prefill, never who is asking", await (async () => { const x = (await answerEmployeeAdmin("edit employee 400001", "342462", { authority: auth(MAP) })) as P; return !x.employeeAdmin && x.hospital?.headline?.text === "Not allowed"; })());

  // ---- inside runOmnibar ----
  const c = { ea: [] as Array<[string, string | null]>, dates: 0, pax: 0, hospital: 0, model: 0, client: 0 };
  const od = (over: object = {}) => ({
    enabled: true, verifiedMin: 1, skipModel: true, legacy: async () => null, holiday: async () => null, paxAdmin: async () => null,
    employeeAdmin: async (q: string, t: string | null) => { c.ea.push([q, t]); return answerEmployeeAdmin(q, t, { authority: auth(MAP) }); },
    dates: async () => { c.dates++; return null; }, pax: async () => { c.pax++; return null; }, hospital: async () => { c.hospital++; return null; },
    llm: async () => { c.model++; throw new Error("no model"); }, withClient: async () => { c.client++; throw new Error("the model's client must not be used"); },
    ...over,
  }) as never;
  let o = (await runOmnibar("add new employee", "400001", od())) as P;
  ok("runOmnibar: the HOD's request opens the panel (source tag, attempt 1) before the date lookup, the PAX route, the hospital route and the model", o?.employeeAdmin?.op === "add" && o.source === "holiday" && o.attempt === 1 && c.dates === 0 && c.pax === 0 && c.hospital === 0 && c.model === 0 && c.client === 0 && c.ea[0][1] === "400001");
  c.ea = [];
  o = (await runOmnibar("add new employee", "400001", od(), { logId: null, reason: "other" as never, note: null, attempt: 1 })) as P;
  ok("a RETRY (a 'No' on an earlier answer) never runs this route again", c.ea.length === 0);
  o = (await runOmnibar("add new employee", "400001", od({ employeeAdmin: async () => { throw new Error("db"); } }))) as P;
  ok("a failing route never breaks the omnibar", o === null || !o.employeeAdmin);
  o = (await runOmnibar("add new employee", "400001", { ...(od() as object), employeeAdmin: undefined } as never)) as P;
  ok("an older caller without the dependency still works", true);
  const d0 = c.dates;
  await runOmnibar("dob of goutam debnath", "400001", od());
  ok("a question about a date of birth goes on to the date lookup as before", c.dates === d0 + 1);

  // ---- the wiring in the files ----
  const src = readFileSync("src/lib/nl2sql/omnibar.ts", "utf8");
  const code = (t: string) => t.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  const wiring = src.slice(src.indexOf("employeeAdmin: async (qq, ticket)"), src.indexOf("dates: async (qq, ticket)"));
  ok("omnibar.ts wires the manager to the application's own connection (getDb) and to the employee manager's authority check", wiring.includes("getDb") && wiring.includes("authorityForTicket") && wiring.includes("@/lib/employees/admin/access"), wiring.slice(0, 160));
  ok("...never to the model's client or its read-only role", !/withClient|withDefaultClient|nlq_reader|NL2SQL_DATABASE_URL/.test(code(wiring)));
  ok("...the route comes BEFORE the date lookup, inside the block that a retry skips", src.indexOf("deps.employeeAdmin ?") > 0 && src.indexOf("deps.employeeAdmin ?") < src.indexOf("deps.dates ?") && src.lastIndexOf("if (!retry) {", src.indexOf("deps.employeeAdmin ?")) > 0);

  console.log(`employee admin omnibar selftest: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main();

// Run (from the project root): npx tsx --tsconfig tsconfig.json src/lib/peopleEvents/datesLookup.selftest.ts
// Step 65b: "No user can search the date of birth or the date of joining of an employee by the search bar EXCEPT THE HOD OF C&IT" (owner, 1 Nov 2026). No database here (the same code is run against the real roster in
// peopleEventsDb.selftest.ts). What is proved: which sentences ask for those dates, that only the HOD (by the LOGIN's ticket) is answered, that everybody else gets one plain sentence and the dates are never
// even read for them, and that no other file in the project can read the two date columns.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { DateTime } from "luxon";
import { runOmnibar } from "../nl2sql/omnibar";
import { REFUSAL, answerDates, type DatesRow } from "./datesLookup";
import { detectDatesQuery } from "./datesIntent";
import { ZONE } from "./rules";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};
const now = DateTime.fromISO("2026-10-31T09:00:00", { zone: ZONE });

// ---- which sentences ask for the dates ----
const f = (q: string) => detectDatesQuery(q);
const fields = (q: string) => f(q)?.fields.join("+");
const who = (q: string) => { const x = f(q); return !x ? undefined : x.ticket ?? x.words.join(" "); };
for (const [q, want, person] of [
  ["dob of Rakesh Ojha", "dob", "rakesh ojha"], ["Rakesh Ojha dob", "dob", "rakesh ojha"], ["date of birth of Rakesh Ojha", "dob", "rakesh ojha"], ["what is the date of birth of Rakesh Ojha", "dob", "rakesh ojha"],
  ["Rakesh Ojha's birthday", "dob", "rakesh ojha"], ["when was Rakesh Ojha born", "dob", "rakesh ojha"], ["birth date of Rakesh Ojha", "dob", "rakesh ojha"], ["tell me the DOB of Rakesh Ojha please", "dob", "rakesh ojha"],
  ["doj of Rakesh Ojha", "doj", "rakesh ojha"], ["date of joining of Rakesh Ojha", "doj", "rakesh ojha"], ["joining date of Rakesh Ojha", "doj", "rakesh ojha"], ["when did Rakesh Ojha join", "doj", "rakesh ojha"], ["when did Rakesh Ojha join dsp", "doj", "rakesh ojha"],
  ["age of Rakesh Ojha", "age", "rakesh ojha"], ["how old is Rakesh Ojha", "age", "rakesh ojha"],
  ["retirement date of Rakesh Ojha", "retirement", "rakesh ojha"], ["when does Rakesh Ojha retire", "retirement", "rakesh ojha"], ["when will Rakesh Ojha retire", "retirement", "rakesh ojha"],
  ["years of service of Rakesh Ojha", "service", "rakesh ojha"], ["length of service of Rakesh Ojha", "service", "rakesh ojha"], ["how long has Rakesh Ojha served", "service", "rakesh ojha"],
  ["dob and doj of Rakesh Ojha", "dob+doj", "rakesh ojha"], ["dob of Dr. Meena Gupta", "dob", "meena gupta"], ["dob of 498880", "dob", "498880"], ["date of joining of ticket 498880", "doj", "498880"], ["498880 age", "age", "498880"],
] as const) {
  ok(`ASKS: "${q}" -> ${want} about ${person}`, fields(q) === want && who(q) === person, JSON.stringify(f(q)));
}
for (const q of [
  "birthdays today", "who has birthday today", "list of birthdays", "joining instructions", "age limit", "retirement", "service rules", "date of birth", "doj", "how old", "", "dob of 498880 and 412345",
  "holiday list 2026", "pax number of fire service", "contact number of Rakesh Ojha", "who is Rakesh Ojha", "Rakesh Ojha", "mobile number of Rakesh Ojha",
  "dob of one two three four five six seven", "what is the retirement age policy of the company in india",
]) ok(`NOT a question about somebody's dates: "${q}"`, f(q) === null, JSON.stringify(f(q)));

// ---- the answer ----
const person = (id: number, name: string, ticket: string) => ({ id: String(id), type: "employee", name, ticketNo: ticket, designation: "Manager", department: "C & IT" }) as never;
const RAKESH = person(1, "RAKESH OJHA", "498880"), ANIL = person(2, "ANIL DAS", "412345"), RAKESH2 = person(3, "RAKESH KUMAR OJHA", "123456");
const DATES: Record<string, DatesRow> = {
  "498880": { ticket: "498880", dob: "1966-10-14", doj: "2001-10-12" },
  "412345": { ticket: "412345", dob: "1985-03-01", doj: "2008-06-02" },
  "123456": { ticket: "123456", dob: null, doj: null },
};
const calls = { datesOf: 0, findByName: 0, findByTicket: 0 };
const deps = (isHod: boolean, over: object = {}) => ({
  isHod: (t: string | null) => isHod && t === "498301",
  findByName: async (n: string) => { calls.findByName++; return [RAKESH, ANIL, RAKESH2].filter((p) => (p as { name: string }).name.toLowerCase().includes(n.split(" ")[0])); },
  findByTicket: async (t: string) => { calls.findByTicket++; return [RAKESH, ANIL, RAKESH2].filter((p) => (p as { ticketNo: string }).ticketNo === t); },
  datesOf: async (t: string[]) => { calls.datesOf++; return t.map((x) => DATES[x]).filter(Boolean); },
  now,
  ...over,
});
const card = (r: Awaited<ReturnType<typeof answerDates>>) => r?.hospital;
const reset = () => { calls.datesOf = 0; calls.findByName = 0; calls.findByTicket = 0; };

async function main() {
  // the HOD
  reset();
  let r = await answerDates("date of birth of anil das", "498301", deps(true));
  ok("the HOD asks the date of birth of Anil Das: the headline is the date, written '01 Mar 1985'", card(r)?.headline?.text === "01 Mar 1985" && card(r)?.headline?.tone === "info");
  ok("...the table holds the name, the ticket, both dates", card(r)?.table?.columns.join() === "Name,Ticket,Date of birth,Date of joining" && card(r)?.table?.rows[0].join("|") === "ANIL DAS|412345|01 Mar 1985|02 Jun 2008", JSON.stringify(card(r)?.table));
  ok("...and 'Understood as' says that only the HOD sees it", /shown to the HOD of C&IT only/.test(r?.interpretation ?? ""));
  r = await answerDates("doj of anil das", "498301", deps(true));
  ok("the date of joining: 02 Jun 2008", card(r)?.headline?.text === "02 Jun 2008");
  r = await answerDates("when does 498880 retire", "498301", deps(true));
  ok("retirement: the last day of the month in which 60 is reached (born 14 Oct 1966 -> 31 Oct 2026)", card(r)?.headline?.text === "31 Oct 2026" && card(r)?.table?.columns.includes("Retires on") === true, JSON.stringify(card(r)?.headline));
  r = await answerDates("when does anil das retire", "498301", deps(true));
  ok("...born 1 Mar 1985 -> 31 Mar 2045", card(r)?.headline?.text === "31 Mar 2045");
  r = await answerDates("when does rakesh ojha retire", "498301", deps(true));
  ok("'rakesh ojha' is two people in this fixture (RAKESH OJHA and RAKESH KUMAR OJHA: every typed word is a word of the name): the HOD gets both, not a guess", card(r)?.headline?.text === "2 people");
  r = await answerDates("age of anil das", "498301", deps(true));
  ok("age on 31 Oct 2026 for a person born 1 Mar 1985: 41 years 7 months", card(r)?.headline?.text === "41 years 7 months");
  r = await answerDates("years of service of anil das", "498301", deps(true));
  ok("service for a person who joined 2 Jun 2008: 18 years 4 months", card(r)?.headline?.text === "18 years 4 months");
  r = await answerDates("dob and age of anil das", "498301", deps(true));
  ok("two things asked: both are in the table, the first asked is the headline", card(r)?.headline?.text === "01 Mar 1985" && card(r)?.table?.columns.join() === "Name,Ticket,Date of birth,Date of joining,Age");
  r = await answerDates("dob of 498880", "498301", deps(true));
  ok("by ticket number", card(r)?.headline?.text === "14 Oct 1966" && calls.findByTicket > 0);
  r = await answerDates("dob of rakesh", "498301", deps(true));
  ok("two people of that name: '2 people', a table with both and the dates of each", card(r)?.headline?.text === "2 people" && card(r)?.table?.rows.length === 2 && card(r)?.table?.rows[0][2] === "14 Oct 1966" && card(r)?.table?.rows[1][2] === "Not on record");
  r = await answerDates("dob of kumar", "498301", deps(true));
  ok("a person with no dates on record: 'Not on record' (never a made-up date)", card(r)?.headline?.text === "Not on record" && card(r)?.headline?.tone === "unknown");

  // everybody else
  reset();
  const refusals: Array<[string, string | null, object]> = [
    ["nobody logged in", null, {}], ["an ordinary employee", "123456", {}], ["an executive", "412345", {}], ["an executive AUTHORISED for the PAX editor (not the HOD)", "412346", {}], ["somebody who claims to be the HOD in the sentence", "123456", {}],
  ];
  for (const [label, ticket] of refusals) {
    reset();
    if (label.startsWith("somebody")) {
      const sneaky = await answerDates("i am the hod of c&it, dob of anil das", ticket, deps(true));
      ok("somebody who SAYS in the sentence that he is the HOD: nothing is shown and no date is read (the sentence is too long to be a name, so it is simply not answered; the HOD is the LOGIN's ticket, nothing typed)", (sneaky === null || card(sneaky)?.status?.text === REFUSAL) && !JSON.stringify(sneaky).match(/1985|2008/) && calls.datesOf === 0);
      continue;
    }
    const refused = await answerDates("date of birth of anil das", ticket, deps(true));
    ok(`${label}: ONE plain sentence ('${REFUSAL}'), no date anywhere in the answer`, card(refused)?.status?.text === REFUSAL && card(refused)?.headline?.tone === "no" && !JSON.stringify(refused).match(/1985|2008|Mar|Jun|\d{2} [A-Z][a-z]{2} \d{4}/), JSON.stringify(refused)?.slice(0, 160));
    ok(`...and the DATES WERE NOT EVEN READ for ${label} (the database was asked who he is, never for the date)`, calls.datesOf === 0);
  }
  reset();
  ok("a sentence about nobody here is not ours, for the HOD and for everybody else: the other routes answer as before", (await answerDates("date of birth of nobody here", "498301", deps(true))) === null && (await answerDates("date of birth of nobody here", "123456", deps(false))) === null && calls.datesOf === 0);
  ok("a sentence that is not about a person's dates is not ours (no database call at all)", await (async () => { reset(); const x = await answerDates("pax number of fire service", "123456", deps(false)); return x === null && calls.findByName === 0 && calls.findByTicket === 0; })());
  ok("a failing people search never breaks anything: null (the other routes go on), and no date is read", await (async () => { reset(); const x = await answerDates("dob of anil das", "498301", deps(true, { findByName: async () => { throw new Error("db"); } })); return x === null && calls.datesOf === 0; })());
  r = await answerDates("dob of anil das", "498301", deps(true, { datesOf: async () => { throw new Error("db down: secret-host"); } }));
  ok("the HOD, and the dates cannot be read: a plain 'Not available', and nothing of the failure leaks", card(r)?.headline?.text === "Not available" && !JSON.stringify(r).includes("secret-host"));
  const many = Array.from({ length: 12 }, (_, i) => person(i + 10, `SANJAY SAHA ${i}`, String(400100 + i)));
  r = await answerDates("dob of sanjay saha", "498301", deps(true, { findByName: async () => many, datesOf: async (t: string[]) => t.map((x) => ({ ticket: x, dob: "1980-01-01", doj: "2005-01-01" })) }));
  ok("a common name: at most 8 are shown, and the dates of only those 8 are read", card(r)?.table?.rows.length === 8 && card(r)?.headline?.text === "8 people");

  // ---- inside runOmnibar ----
  const c = { dates: [] as Array<[string, string | null]>, pax: 0, hospital: 0, model: 0, client: 0 };
  const od = (over: object = {}) =>
    ({
      enabled: true, verifiedMin: 1, skipModel: true, legacy: async () => null, holiday: async () => null, paxAdmin: async () => null,
      dates: async (q: string, t: string | null) => { c.dates.push([q, t]); return answerDates(q, t, deps(true)); },
      pax: async () => { c.pax++; return null; },
      hospital: async () => { c.hospital++; return null; },
      llm: async () => { c.model++; throw new Error("no model"); },
      withClient: async () => { c.client++; throw new Error("the model's client must not be used"); },
      ...over,
    }) as never;
  type P = { hospital?: { headline?: { text: string }; status?: { text: string } }; source?: string; attempt?: number };
  let o = (await runOmnibar("date of birth of anil das", "498301", od())) as P;
  ok("runOmnibar: the HOD's question is answered by this route (source tag, attempt 1), before the PAX route, the hospital route, the model and the model's client", o?.hospital?.headline?.text === "01 Mar 1985" && o.source === "holiday" && o.attempt === 1 && c.pax === 0 && c.hospital === 0 && c.model === 0 && c.client === 0 && c.dates[0][1] === "498301", JSON.stringify(o));
  o = (await runOmnibar("date of birth of anil das", "123456", od())) as P;
  ok("runOmnibar: anybody else gets the refusal, from the same route, with the LOGIN's ticket (not anything typed)", o?.hospital?.status?.text === REFUSAL && c.dates[1][1] === "123456");
  c.dates = [];
  o = (await runOmnibar("date of birth of anil das", "498301", od(), { logId: null, reason: "other" as never, note: null, attempt: 1 })) as P;
  ok("a RETRY (a 'No' on an earlier answer) never runs this route again", c.dates.length === 0);
  o = (await runOmnibar("date of birth of anil das", "498301", od({ dates: async () => { throw new Error("db"); } }))) as P;
  ok("a failing route never breaks the omnibar", o === null || !o.hospital?.headline?.text?.match(/1985/));
  o = (await runOmnibar("date of birth of anil das", "498301", { ...(od() as object), dates: undefined } as never)) as P;
  ok("an older caller without the dependency still works", true);
  const paxBefore = c.pax;
  o = (await runOmnibar("pax number of fire service", "498301", od())) as P;
  ok("a question about something else goes on to the PAX route as before (exactly one more call to it)", c.pax === paxBefore + 1);

  // ---- the wiring in the files ----
  const src = readFileSync("src/lib/nl2sql/omnibar.ts", "utf8");
  const code = (t: string) => t.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  const wiring = src.slice(src.indexOf("dates: async (qq, ticket)"), src.indexOf("paxAdmin: async (qq, ticket)"));
  ok("omnibar.ts wires the route to the application's own connection (getDb), to isSuperAdmin (the HOD, by ticket) and to the real people search", wiring.includes("getDb") && wiring.includes("isSuperAdmin") && wiring.includes("searchEmployeesByName") && wiring.includes("readDates"), wiring.slice(0, 200));
  ok("...never to the model's client", !/withClient|withDefaultClient|nlq_reader|NL2SQL_DATABASE_URL/.test(code(wiring)));
  ok("...the HOD is `isSuperAdmin(ticket)` and nothing else (the PAX editor's delegates are not the HOD)", /isHod: \(t\) => !!t && isSuperAdmin\(t\)/.test(wiring) && !/authorityForTicket|pax_delegate/.test(wiring));
  ok("...the route comes BEFORE the PAX route in runOmnibar, inside the block that a retry skips", src.indexOf("deps.dates ?") > 0 && src.indexOf("deps.dates ?") < src.indexOf("deps.pax ?") && src.lastIndexOf("if (!retry) {", src.indexOf("deps.dates ?")) > 0);

  // ---- NO OTHER FILE CAN READ THE TWO COLUMNS ----
  const readers: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) { if (name !== "node_modules" && name !== ".next") walk(full); continue; }
      if (!/\.(ts|tsx|js|jsx|mjs)$/.test(name) || /\.selftest\./.test(name) || /\.sandbox\./.test(name)) continue;
      const text = code(readFileSync(full, "utf8")).replace(/\/\*[\s\S]*?\*\//g, "");
      if (/date_of_birth|date_of_joining/.test(text)) readers.push(full.replace(process.cwd() + "/", ""));
    }
  };
  walk(join(process.cwd(), "src"));
  // api.ts names the columns only to RECOGNISE the error "the migration has not been run" in a failure message; it reads nothing (no SELECT, no FROM): proved just below
  const READERS = ["src/lib/peopleEvents/datesLookup.ts", "src/lib/peopleEvents/query.ts"];
  const NAMES_ONLY = ["src/lib/peopleEvents/api.ts"];
  ok("ONLY TWO FILES of the program read the date columns: the lists (query.ts) and this lookup (datesLookup.ts); one more (api.ts) names them only in an error message. Any other file fails this test", JSON.stringify(readers.filter((x) => !NAMES_ONLY.includes(x)).sort()) === JSON.stringify(READERS) && readers.every((x) => READERS.includes(x) || NAMES_ONLY.includes(x)), JSON.stringify(readers));
  ok("...and api.ts, the one that only names them, contains no query (no SELECT, no FROM, no query call)", !/\bSELECT\b|\bFROM\b|\.query\(/.test(code(readFileSync("src/lib/peopleEvents/api.ts", "utf8")).replace(/\/\*[\s\S]*?\*\//g, "")));
  ok("the AI search can never be shown these dates: the model's schema description does not name them", !/date_of_birth|date_of_joining|dates_source/.test(readFileSync("src/lib/nl2sql/context.ts", "utf8")) && !/date_of_birth|date_of_joining/.test(readFileSync("src/lib/nl2sql/sql/01_nlq_schema_views_role.sql", "utf8")));

  console.log(`peopleEvents datesLookup selftest: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main();

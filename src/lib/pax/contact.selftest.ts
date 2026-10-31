// Run (from the project root): npx tsx --tsconfig tsconfig.json src/lib/pax/contact.selftest.ts
// Step 63b: "pax number", "phone number" and "contact number" are ONE keyword; the SUBJECT decides what number is meant. A department or other non-human subject gives its PAX number; a person who is an executive
// (ticket 4xxxxx) gives his or her CUG mobile number, masked, with the existing card and Reveal button; a non-executive person is not answered here (the question goes on unchanged).
// The REAL route code (route.ts, people.ts, answer.ts, matcher.ts) runs with stand-ins for the two database reads. The people are INVENTED; the directory rows are the same invented fixture as pax.selftest.ts.

import { runOmnibar } from "../nl2sql/omnibar";
import type { EmployeeResult } from "../search/employeeSearch";
import { answerContact, type ContactDeps } from "./route";
import { buildPeopleAnswer, isExecutiveTicket, namedPeople, subjectWords } from "./people";
import type { PaxArea, PaxRow } from "./matcher";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};

const areaOf = (n: string): PaxArea => (/^4[0-2]\d{3}$/.test(n) ? "plant" : /^45\d{3}$|^5\d{4}$/.test(n) ? "outside" : "unclassified");
const mk = (label: string, number: string): PaxRow => {
  const m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(label);
  return { label, deptName: m ? m[1] : label, location: m ? m[2] : "", number, note: "", area: areaOf(number) };
};
const ROWS: PaxRow[] = [mk("Civil (A - Zone)", "40101"), mk("Fire Service", "42046"), mk("C & IT (Console)", "40511"), mk("Water Supply (Township)", "45401"), mk("PAX Complain (In Plant)", "40221"), mk("PAX Complain (Township)", "45221")];

const person = (name: string, ticketNo: string, over: Partial<EmployeeResult> = {}): EmployeeResult => ({
  id: `u-${ticketNo}`, type: "employee", name, ticketNo, sailPNo: null, designation: "Chief Manager", department: "Some Department",
  mobileMasked: "943479xxxx", emailMasked: "xxxxxx@sail.in", hasMobile: true, hasEmail: true, isExecutive: isExecutiveTicket(ticketNo), matchKind: "name-exact", score: 1, ...over,
});
const PEOPLE: EmployeeResult[] = [
  person("SANJAY KUMAR ROY", "412345"), person("SANJAY ROY", "123456", { designation: "Sr. Technician" }), // one executive, one non-executive of nearly the same name
  person("ANIL DAS", "498301", { hasMobile: false, mobileMasked: null }),
  person("RAJESH KUMAR", "450001"), person("RAJESH KUMAR SINGH", "450002"),
  person("MEENA GUPTA", "440777", { title: "Dr." }),
  person("BISWAJIT MONDAL", "234567", { designation: "Technician" }), // a non-executive only
  ...Array.from({ length: 12 }, (_, i) => person(`AMIT KUMAR ${["ALPHA", "BETA", "GAMMA", "DELTA", "EPSILON", "ZETA", "ETA", "THETA", "IOTA", "KAPPA", "LAMBDA", "MU"][i]}`, `46${String(1000 + i)}`)),
  person("SANJEY ROI", "499999"), // sounds alike, is NOT the typed name
];

const calls = { name: [] as string[], ticket: [] as string[], loadPax: 0 };
const deps = (over: Partial<ContactDeps> = {}): ContactDeps => ({
  loadPax: async () => { calls.loadPax++; return ROWS; },
  // like the real directory search: fuzzy, it returns everybody who sounds alike; the route must not trust it
  findByName: async (n) => { calls.name.push(n); return PEOPLE; },
  findByTicket: async (t) => { calls.ticket.push(t); return PEOPLE.filter((p) => p.ticketNo === t); },
  ...over,
});
const reset = () => { calls.name = []; calls.ticket = []; calls.loadPax = 0; };
type Pl = NonNullable<Awaited<ReturnType<typeof answerContact>>>;
const run = async (q: string, d: ContactDeps = deps()) => { reset(); return answerContact(q, d); };
const ph = (p: Pl | null) => p?.headline?.text;

async function main() {
  // ---- helpers ----
  ok("executive = a six-digit ticket that starts with 4", isExecutiveTicket("412345") && isExecutiveTicket(" 498301 ") && !isExecutiveTicket("123456") && !isExecutiveTicket("41234") && !isExecutiveTicket("4123456") && !isExecutiveTicket(null));
  ok("titles are not part of the name", JSON.stringify(subjectWords(["dr", "meena", "gupta"])) === JSON.stringify(["meena", "gupta"]));
  ok("a name needs EVERY typed word as a whole word: 'sanjay roy' = SANJAY KUMAR ROY and SANJAY ROY, not the sound-alike SANJEY ROI", namedPeople(["sanjay", "roy"], PEOPLE).map((p) => p.name).sort().join("|") === "SANJAY KUMAR ROY|SANJAY ROY");
  ok("...'sanjay roi' matches nobody (SANJEY ROI has 'sanjey'), 'san' is not a word of any name", namedPeople(["sanjay", "roi"], PEOPLE).length === 0 && namedPeople(["san"], PEOPLE).length === 0);
  ok("...nothing typed, or more than four words: nobody", namedPeople([], PEOPLE).length === 0 && namedPeople(["a", "b", "c", "d", "e"], PEOPLE).length === 0);
  ok("a person appears once even if the search returns him twice", namedPeople(["anil", "das"], [PEOPLE[2], PEOPLE[2]]).length === 1);

  // ---- an executive by name: the CUG number, masked ----
  let p = await run("contact number of sanjay roy");
  ok("'contact number of sanjay roy': ONE executive (the non-executive Sanjay Roy and the sound-alike Sanjey Roi are not shown); the headline is the MASKED CUG number", ph(p) === "943479xxxx" && p?.headline?.tone === "info" && p?.people?.length === 1 && p.people[0].ticketNo === "412345", JSON.stringify(p?.headline) + JSON.stringify(p?.people?.map((x) => x.name)));
  ok("...the cards are the existing person cards (id for Reveal, the number masked), the e-mail button is left off", p?.people?.[0].id === "u-412345" && p.people[0].mobileMasked === "943479xxxx" && p.people[0].hasMobile === true && p.people[0].hasEmail === false && p.people[0].emailMasked === null);
  ok("...no full number anywhere in the answer (10 digits never appear), the sentence says to press reveal and that it is logged", !/\d{10}/.test(JSON.stringify(p)) && /press reveal/i.test(p?.answer ?? "") && /logged/.test(p?.answer ?? ""));
  ok("...the non-executive with the same name is SAID, not shown", /1 non-executive employee with this name is not shown: CUG numbers are given for executives only/.test(p?.answer ?? ""));
  ok("...'Understood as' says it is the CUG mobile number of the executive", /CUG mobile number of the executive “sanjay roy”/.test(p?.interpretation ?? ""), p?.interpretation);
  ok("...the people list, not a count: kind count with count 1, no hospital card", p?.kind === "count" && p.count === 1 && !p.hospital);
  for (const q of ["phone number of sanjay roy", "pax number of sanjay roy", "sanjay roy contact number", "telephone of sanjay roy", "contact no of Sanjay Roy"]) {
    const x = await run(q);
    ok(`"${q}": the same executive, the same masked number (the aliases are one keyword)`, ph(x) === "943479xxxx" && x?.people?.[0].ticketNo === "412345", JSON.stringify(x?.headline));
  }
  // a title and a doctor
  p = await run("phone number of dr meena gupta");
  ok("a title is dropped: 'phone number of dr meena gupta' -> Meena Gupta, shown with her Dr.", ph(p) === "943479xxxx" && p?.people?.[0].title === "Dr." && /^Dr\. MEENA GUPTA: CUG mobile number/.test(p?.answer ?? ""), p?.answer);
  ok("...'phone number of doctor meena gupta' is the same", ph(await run("phone number of doctor meena gupta")) === "943479xxxx");
  // an executive by ticket
  p = await run("contact number of 412345");
  ok("by ticket: 'contact number of 412345' -> the same executive, masked", ph(p) === "943479xxxx" && p?.people?.[0].name === "SANJAY KUMAR ROY" && calls.ticket[0] === "412345" && calls.name.length === 0, JSON.stringify(p?.headline));
  ok("...'phone number of ticket 412345' and 'pax 412345' too", ph(await run("phone number of ticket 412345")) === "943479xxxx" && ph(await run("pax 412345")) === "943479xxxx");
  ok("a NON-EXECUTIVE ticket is not answered (no rule): null, and no lookup is made", (await run("contact number of 123456")) === null && calls.ticket.length === 0);
  ok("a ticket nobody holds: null", (await run("contact number of 412399")) === null);
  // no number on record, several people, too many
  p = await run("contact number of anil das");
  ok("an executive with no number on record: an amber 'No CUG number on record', the person is still shown", ph(p) === "No CUG number on record" && p?.headline?.tone === "unknown" && p?.people?.length === 1);
  p = await run("contact number of rajesh kumar");
  ok("two executives of one name: 'Rajesh Kumar' is both RAJESH KUMAR and RAJESH KUMAR SINGH (every typed word is a word of the name): 2 executives, 2 cards", ph(p) === "2 executives match" && p?.people?.length === 2 && p.count === 2, JSON.stringify(p?.headline));
  p = await run("phone number of kumar");
  ok("one common word: 'kumar' is many executives: the first 10 are shown, the total is said, the list is marked truncated", /^1\d executives match$/.test(ph(p) ?? "") && p?.people?.length === 10 && p.listTruncated === true && /first 10 are shown/.test(p.answer), JSON.stringify(p?.headline));
  // "phone number of departments": the same list as "pax number of departments", no person is looked up
  for (const q of ["phone number of departments", "contact number of all departments", "pax number of departments"]) {
    const x = await run(q);
    ok(`"${q}": the whole PAX list (the number of numbers is the headline, the table is the directory), and no person is looked up`, /^\d+ PAX numbers$/.test(x?.hospital?.headline?.text ?? "") && (x?.hospital?.table?.rows.length ?? 0) === ROWS.length && !x?.people && calls.name.length === 0, JSON.stringify(x?.hospital?.headline));
  }
  ok("...and a bare 'contact number' or 'phone number' is still not ours", (await run("contact number")) === null && (await run("phone number")) === null);

  // the department comes first
  p = await run("contact number of fire service");
  ok("a DEPARTMENT is answered by its PAX number, and no person is looked up", ph({ headline: p?.hospital?.headline } as never) === "42046" && !p?.people && calls.name.length === 0 && calls.loadPax === 1, JSON.stringify(p?.hospital?.headline));
  for (const q of ["phone number of fire service", "pax number of fire service", "fire service contact number"]) {
    const x = await run(q);
    ok(`"${q}" -> the PAX number 42046`, x?.hospital?.headline?.text === "42046" && !x.people);
  }
  p = await run("contact number of fire servise");
  ok("a spelling slip in a department: tried AFTER the person lookup, found, the correction said", p?.hospital?.headline?.text === "42046" && /Read “servise” as “service”/.test(p.interpretation ?? "") && calls.name.length === 1, JSON.stringify(p?.hospital?.headline));
  // what is not ours
  p = await run("contact number of biswajit mondal");
  ok("a NON-EXECUTIVE person with the weak cue is not answered: null (the other routes answer as before)", p === null && calls.name.length === 1);
  p = await run("pax number of biswajit mondal");
  ok("...with the word 'pax' it is an honest 'Not found' that says PAX belongs to departments and places", p?.hospital?.headline?.text === "Not found" && /not to individual people/.test(p.hospital.details?.[0]?.text ?? ""));
  ok("a sound-alike is not a match: 'contact number of sanjay roi' -> null", (await run("contact number of sanjay roi")) === null);
  ok("nothing found at all: 'contact number of water pump', 'contact number of mediclaim' -> null", (await run("contact number of water pump")) === null && (await run("contact number of mediclaim")) === null);
  ok("a sentence is no name: more than four words never runs the name search", (await run("contact number of one two three four five")) === null && calls.name.length === 0);
  ok("a question about the hospital, a mobile number, a circular: not ours, no lookup", (await run("hospital contact number")) === null && (await run("mobile number of sanjay roy")) === null && (await run("contact number in the circular on mediclaim")) === null && calls.name.length === 0);
  for (const q of ["pax numbers outside plant", "how many pax numbers", "pax not working", "pax", "pax 42046"]) {
    await run(q);
    ok(`"${q}": a list, a count, an area, a fault, a number never looks for a person`, calls.name.length === 0 && calls.ticket.length === 0, JSON.stringify(calls));
  }
  // robustness
  ok("a failing name search never breaks it: the directory answers or nothing does", (await run("contact number of fire service", deps({ findByName: async () => { throw new Error("db"); } })))?.hospital?.headline?.text === "42046" && (await run("contact number of sanjay roy", deps({ findByName: async () => { throw new Error("db"); } }))) === null);
  ok("a failing directory read: an executive is still found by name", ph(await run("contact number of sanjay roy", deps({ loadPax: async () => { throw new Error("db"); } }))) === "943479xxxx");
  ok("...and with the word pax a failing directory read says so plainly", (await run("pax fire service", deps({ loadPax: async () => { throw new Error("db"); } })))?.hospital?.headline?.text === "Not available");
  ok("buildPeopleAnswer: nobody who is an executive -> null", buildPeopleAnswer("x", [PEOPLE[1], PEOPLE[6]]) === null);

  // ---- inside runOmnibar ----
  const c = { hospital: 0, holiday: 0, model: 0, client: 0 };
  const od = (over: object = {}) =>
    ({
      enabled: true, verifiedMin: 1, skipModel: true, legacy: async () => null,
      holiday: async () => { c.holiday++; return null; },
      hospital: async () => { c.hospital++; return null; },
      pax: (q: string) => answerContact(q, deps()),
      llm: async () => { c.model++; throw new Error("no model"); },
      withClient: async () => { c.client++; throw new Error("the model's client must not be used"); },
      ...over,
    }) as never;
  type P = { kind: string; headline?: { text: string }; people?: Array<{ ticketNo: string; hasEmail: boolean }>; source?: string; attempt?: number; hospital?: { headline?: { text: string } } };
  let o = (await runOmnibar("contact number of sanjay roy", "U1", od())) as P;
  ok("runOmnibar: the executive's CUG answer comes from the route: masked headline, the card, source tag, attempt 1, no model, no model client, no hospital route", o?.headline?.text === "943479xxxx" && o.people?.length === 1 && o.source === "holiday" && o.attempt === 1 && c.model === 0 && c.client === 0 && c.hospital === 0, JSON.stringify(o));
  o = (await runOmnibar("phone number of fire service", "U1", od())) as P;
  ok("runOmnibar: a department gets its PAX card", o?.hospital?.headline?.text === "42046" && o.source === "holiday");
  c.hospital = 0;
  o = (await runOmnibar("contact number of biswajit mondal", "U1", od())) as P;
  ok("runOmnibar: a non-executive's question passes through the PAX route untouched (the hospital route is next, then nothing: the app goes on)", o === null && c.hospital === 1, JSON.stringify(o));

  console.log(`contact selftest: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main();

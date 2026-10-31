// Run (from the project root): npx tsx --tsconfig tsconfig.json src/lib/pax/pax.selftest.ts
// Step 63a: the PAX directory search. The planner decides what the route may take; the matcher finds the rows (abbreviations, spelling slips, areas); the answer puts the ONE clean answer first;
// the route sits in runOmnibar before the hospital route and reads the table with the application's own connection, never the model's.
//
// THE FIXTURE: the names and numbers that the project's handoff documents (Civil (A - Zone); PAX Complain (In Plant) 40221 and (Township) 45221; CISF Tumla Gate and Weigh Bridge - Tumla Gate on one number, 42043;
// CISF Main Hospital 46298, the number that fits neither area rule; Network Team (C & IT) / (CMMS); C & IT (Console) / (DR) / (DRC); Plant Medical (PMU); MRS Control (Electrical Complain); CISF (PCR)).
// Every OTHER number below is INVENTED for this test and is not Telecom's.

import { readFileSync } from "node:fs";
import { runOmnibar } from "../nl2sql/omnibar";
import { answerPax, buildPaxAnswer } from "./answer";
import { editDistance, matchByName, matchByNumber, normalizePax, planPaxQuery, rowTokens, type PaxArea, type PaxRow } from "./matcher";
import { loadPaxRows, normalizeArea } from "./store";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};

// the area rule as the handoff states it (the database function public.pax_area is the real one): plant = 4[0-2]xxx, outside = 45xxx or 5xxxx, else not classified
const areaOf = (n: string): PaxArea => (/^4[0-2]\d{3}$/.test(n) ? "plant" : /^45\d{3}$|^5\d{4}$/.test(n) ? "outside" : "unclassified");
// the label split as the handoff states it: a name that ends in a bracket is split there
const mk = (label: string, number: string, note = ""): PaxRow => {
  const m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(label);
  return { label, deptName: m ? m[1] : label, location: m ? m[2] : "", number, note, area: areaOf(number) };
};
const ROWS: PaxRow[] = [
  mk("Civil (A - Zone)", "40101"), mk("Civil (B - Zone)", "40102"), mk("Civil (C - Zone)", "40103"),
  mk("Fire Service", "42046"),
  mk("C & IT (Console)", "40511"), mk("C & IT (DR)", "40512"), mk("C & IT (DRC)", "40513"),
  mk("Network Team (C & IT)", "40521"), mk("Network Team (CMMS)", "40522"),
  mk("Plant Medical (PMU)", "41301"), mk("MRS Control (Electrical Complain)", "40601"),
  mk("CISF (PCR)", "42041"), mk("CISF Tumla Gate", "42043"), mk("Weigh Bridge - Tumla Gate", "42043"), mk("CISF Main Hospital", "46298"),
  mk("PAX Complain (In Plant)", "40221"), mk("PAX Complain (Township)", "45221"),
  mk("Township Garage", "45310"), mk("Water Supply (Township)", "45401"),
];
const DISTINCT = new Set(ROWS.map((r) => r.number)).size; // 18 numbers on 19 entries (42043 twice)

type Card = NonNullable<Awaited<ReturnType<typeof answerPax>>>["card"];
const ask = async (q: string, rows: PaxRow[] = ROWS) => answerPax(q, async () => rows);
const head = (a: Awaited<ReturnType<typeof ask>>) => a?.card.headline?.text;
const tone = (a: Awaited<ReturnType<typeof ask>>) => a?.card.headline?.tone;
const nums = (a: Awaited<ReturnType<typeof ask>>) => (a?.card.table?.rows ?? []).map((r) => r[0]);

async function main() {
  // ---- text helpers ----
  ok("normalize: 'C & IT (Console)' is read as words", normalizePax("C & IT (Console)") === "c and it console");
  ok("editDistance: a swap counts once, a slip counts once", editDistance("servcie", "service") === 1 && editDistance("servise", "service") === 1 && editDistance("gate", "date") === 1);
  ok("rowTokens: 'C & IT' is also 'cit', 'L & D' also 'ld'", rowTokens(mk("Network Team (C & IT)", "1")).has("cit") && rowTokens(mk("Centre (L & D)", "1")).has("ld"));

  // ---- what the route may take: the planner ----
  const plan = (q: string) => planPaxQuery(q);
  for (const q of ["pax number of fire service", "fire service pax", "PAX of Fire Service", "what is the pax no. of fire service?", "pax fire servise", "tell me the pax for civil"]) {
    const p = plan(q);
    ok(`"${q}" is a name question (the word pax: always ours)`, p?.kind === "name" && p.claim === "always", JSON.stringify(p));
  }
  ok("'pax number of fire service': 'number of' is NOT a count question", (plan("pax number of fire service") as { count: boolean }).count === false);
  ok("...the words of the name are fire and service, nothing else", JSON.stringify((plan("pax number of fire service") as { tokens: string[] }).tokens) === JSON.stringify(["fire", "service"]));
  ok("'pax c&it' keeps the 'it' of C & IT", JSON.stringify((plan("pax c&it") as { tokens: string[] }).tokens) === JSON.stringify(["c", "it"]));
  ok("'pax civil a zone' keeps the zone letter, 'give me a pax of civil' does not", JSON.stringify((plan("pax civil a zone") as { tokens: string[] }).tokens) === JSON.stringify(["civil", "zone", "a"]) && JSON.stringify((plan("give me a pax of civil") as { tokens: string[] }).tokens) === JSON.stringify(["civil"]));
  for (const [q, kind] of [["who has 42046", "number"], ["42046", "number"], ["whose number is 42046", "number"], ["42046 kiska hai", "number"]] as const) {
    const p = plan(q);
    ok(`"${q}": a bare PAX-shaped number, ours only if it is found`, p?.kind === kind && p.claim === "ifFound", JSON.stringify(p));
  }
  ok("'pax 42046', 'is 42046 a pax number', 'pax 42 046' are number questions, always ours", ["pax 42046", "is 42046 a pax number", "pax 42 046", "pax 42-046"].every((q) => { const p = plan(q); return p?.kind === "number" && p.claim === "always" && (p as { numbers: string[] }).numbers[0] === "42046"; }));
  ok("'pax 420' asks for the numbers that start so", JSON.stringify((plan("pax 420") as { numbers: string[] }).numbers) === JSON.stringify(["420"]));
  for (const q of ["pax", "pax directory", "list all pax numbers", "pax numbers", "complete pax directory", "give me the pax list"]) ok(`"${q}" is the list`, plan(q)?.kind === "list");
  ok("'how many pax numbers' is a count", (plan("how many pax numbers") as { count: boolean }).count === true && plan("how many pax numbers")?.kind === "list");
  ok("areas: 'pax numbers outside plant', 'township pax numbers', 'pax in plant', 'pax plant'", (plan("pax numbers outside plant") as { area: string }).area === "outside" && (plan("township pax numbers") as { area: string }).area === "outside" && (plan("pax in plant") as { area: string }).area === "plant" && (plan("pax plant") as { area: string }).area === "plant");
  ok("...but 'pax plant medical' is a NAME (Plant Medical), not the plant area", plan("pax plant medical")?.kind === "name" && (plan("pax plant medical") as { area: string | null }).area === null);
  for (const q of ["pax not working", "pax complaint", "pax complain in plant", "pax out of order", "my pax is dead"]) ok(`"${q}" is a fault question (the complaint desk)`, (plan(q) as { fault: boolean })?.fault === true, JSON.stringify(plan(q)));
  ok("'pax complaint township' is narrowed to the outside area", (plan("pax complaint township") as { area: string }).area === "outside");
  for (const q of ["telephone number of fire service", "extension of c&it console", "intercom civil"]) {
    const p = plan(q);
    ok(`"${q}": a weak cue is ours only if found, and only on exact words`, p?.kind === "name" && p.claim === "ifFound" && (p as { exactOnly: boolean }).exactOnly === true, JSON.stringify(p));
  }

  // ---- what the route must NOT take ----
  for (const q of [
    "fire service", "civil", "hospital opd timings", "is opd open today", "list all executives in M&HS", "what is the leave policy for contract workers", "holiday list 2024",
    "pax 498301", "pax number of ticket 498301", "mobile 9434012345", "9434012345", "498301", "circular on pax billing", "pax tariff notice", "extension of mediclaim policy", "mediclaim extension",
    "phone number of rajesh kumar", "mobile number of sanjay", "hospital telephone number", "extension", "telephone", "wage 42046 rupees", "five digit number 42046 in the circular", "the circular dated 12 may 2026 about 42046",
    "who is the head of civil engineering", "", "   ", "a",
  ]) {
    const p = plan(q);
    // a plan may exist for a weak cue (it still has to FIND a name); the question is whether the ROUTE answers: checked below with the real rows
    const answered = p ? await ask(q) : null;
    ok(`"${q.slice(0, 60)}" is not taken by the PAX route`, answered === null, JSON.stringify(p));
  }

  // ---- a name to its number ----
  let a = await ask("pax number of fire service");
  ok("fire service: the headline is the number, big and bold", head(a) === "42046" && tone(a) === "info", JSON.stringify(a?.card.headline));
  ok("...the sentence names it and the area", /^Fire Service — PAX 42046, in the plant\.$/.test(a?.summary ?? ""), a?.summary);
  ok("...the table: PAX, Name, Area (no Note column when no row has a note)", JSON.stringify(a?.card.table?.columns) === JSON.stringify(["PAX", "Name", "Area"]) && a?.card.table?.rows[0].join("|") === "42046|Fire Service|In plant");
  ok("...what PAX is, folded away (not a long paragraph on top)", a?.card.details?.[0]?.summary === "What is PAX?" && !a?.card.lines?.length);
  ok("...no red notes when nothing is wrong", !a?.card.notes?.length);
  ok("...'Understood as' says how it was read", /PAX number for “fire service”/.test(a?.interpretation ?? ""), a?.interpretation);
  for (const q of ["fire service pax", "PAX of FIRE SERVICE", "pax fire services", "pax no of fire service dept", "telephone number of fire service", "fire service pax number please"]) {
    a = await ask(q);
    ok(`"${q}" -> 42046`, head(a) === "42046", JSON.stringify(a?.card.headline));
  }
  // spelling slips are said, never silent
  a = await ask("pax fire servise");
  ok("'pax fire servise' finds Fire Service by a spelling slip and SAYS so", head(a) === "42046" && /Read “servise” as “service”/.test(a?.interpretation ?? "") && /Read “servise” as “service”/.test(a?.summary ?? ""), a?.interpretation);
  ok("'pax fier service' (swapped letters) is found too", head(await ask("pax fier service")) === "42046");
  ok("'pax tumlah gate' is found", nums(await ask("pax tumla gaet")).includes("42043"));
  ok("a different word 4 letters long is NOT guessed ('pax date' is not 'gate')", head(await ask("pax date")) === "Not found");
  a = await ask("telephone number of fire servise");
  ok("a weak cue never uses a spelling guess: 'telephone number of fire servise' is not taken", a === null);
  // abbreviations and groups
  a = await ask("pax c&it");
  ok("'pax c&it': all four C & IT numbers, counted in the headline", head(a) === "4 PAX numbers" && JSON.stringify(nums(a).sort()) === JSON.stringify(["40511", "40512", "40513", "40521"]), JSON.stringify(nums(a)));
  ok("'pax cit' and 'pax c and it' are the same four", JSON.stringify(nums(await ask("pax cit")).sort()) === JSON.stringify(nums(a).sort()) && JSON.stringify(nums(await ask("pax c and it")).sort()) === JSON.stringify(nums(a).sort()));
  a = await ask("pax c&it console");
  ok("'pax c&it console' narrows to one: 40511", head(a) === "40511" && nums(a).length === 1, JSON.stringify(nums(a)));
  a = await ask("pax network team cmms");
  ok("'pax network team cmms' -> 40522", head(a) === "40522");
  a = await ask("pax civil");
  ok("'pax civil': the three zones, as numbers in the headline (three or fewer are the headline itself)", head(a) === "40101 · 40102 · 40103", head(a));
  a = await ask("pax civil a zone");
  ok("'pax civil a zone' -> 40101 only", head(a) === "40101" && nums(a).length === 1, JSON.stringify(nums(a)));
  ok("'pax civil zone b' -> 40102", head(await ask("pax civil zone b")) === "40102");
  ok("'pax of civil' with a stray article keeps all three zones ('a' alone never filters)", nums(await ask("give me a pax of civil")).length === 3);
  ok("'pax plant medical' -> 41301", head(await ask("pax plant medical")) === "41301");
  ok("'pax weigh bridge' -> 42043, listed under ONE name there", head(await ask("pax weigh bridge")) === "42043");
  // the number on two names
  a = await ask("pax tumla gate");
  ok("'pax tumla gate': both names, ONE number as the headline", head(a) === "42043" && a?.card.table?.rows.length === 2, JSON.stringify(a?.card.table));
  ok("...a red note says the number is on two names (Telecom to say which is current)", (a?.card.notes ?? []).some((n) => /42043 is listed under 2 names/.test(n)), JSON.stringify(a?.card.notes));
  // not found, honestly
  a = await ask("pax water pump");
  ok("'pax water pump': amber 'Not found', no number invented", head(a) === "Not found" && tone(a) === "unknown" && !a?.card.table, JSON.stringify(a?.card));
  a = await ask("pax fire brigade");
  ok("'pax fire brigade': not found, and the CLOSEST name is offered as a line (never as the answer)", head(a) === "Not found" && (a?.card.lines ?? []).some((l) => /Closest names.*Fire Service/.test(l)) && !a?.card.table, JSON.stringify(a?.card));
  a = await ask("pax water pump");
  ok("'pax water pump': the closest name is Water Supply (it shares 'water'); Tumla Gate is NOT offered ('water' is not near 'gate')", (a?.card.lines ?? []).some((l) => /Water Supply/.test(l)) && !(a?.card.lines ?? []).some((l) => /Tumla|Weigh/.test(l)), JSON.stringify(a?.card.lines));
  a = await ask("pax rajesh kumar");
  ok("'pax rajesh kumar': a person has no PAX: not found, with the folded explanation that PAX is for departments and places", head(a) === "Not found" && /not to individual people/.test(a?.card.details?.[0]?.text ?? ""));
  // ---- a number to its name ----
  a = await ask("who has 42046");
  ok("'who has 42046': the NAME is the headline", head(a) === "Fire Service" && /^PAX 42046 is Fire Service, in the plant\.$/.test(a?.summary ?? ""), a?.summary);
  ok("'42046' alone is answered the same", head(await ask("42046")) === "Fire Service");
  a = await ask("who has 42043");
  ok("'who has 42043': two names share it", head(a) === "2 names share 42043" && a?.card.table?.rows.length === 2 && (a?.card.notes ?? []).length === 1, JSON.stringify(a?.card.headline));
  a = await ask("pax 46298");
  ok("'pax 46298': CISF Main Hospital, area NOT classified, said in a red note", head(a) === "CISF Main Hospital" && a?.card.table?.rows[0][2] === "Not classified" && (a?.card.notes ?? []).some((n) => /46298 is not classified/.test(n)), JSON.stringify(a?.card));
  ok("'pax 45221' is outside the plant", /outside the plant/.test((await ask("pax 45221"))?.summary ?? ""));
  a = await ask("pax 99999");
  ok("'pax 99999': not found (the word pax makes it ours)", head(a) === "Not found" && /not in the Telecom directory/.test(a?.summary ?? ""));
  ok("'99999' alone and 'who has 99999': NOT ours (nothing is claimed that is not found)", (await ask("99999")) === null && (await ask("who has 99999")) === null);
  a = await ask("pax 420");
  ok("'pax 420': the numbers that start with 420 (42041, 42043, 42046)", head(a) === "3 numbers start with 420" && JSON.stringify(nums(a).sort()) === JSON.stringify(["42041", "42043", "42043", "42046"]), JSON.stringify(nums(a)));
  a = await ask("pax 42046 and 40221");
  ok("two numbers at once: both found", head(a) === "2 of 2 numbers found" && nums(a).length === 2);
  a = await ask("pax 42046 and 11111");
  ok("two numbers, one missing: 1 of 2, and the missing one is named", head(a) === "1 of 2 numbers found" && (a?.card.lines ?? []).some((l) => /Not in the directory: 11111/.test(l)));
  // ---- lists, counts, areas ----
  a = await ask("pax");
  ok("'pax': the whole directory, the headline is the count of numbers", head(a) === `${DISTINCT} PAX numbers` && a?.card.table?.rows.length === ROWS.length, head(a));
  ok("...the area breakdown is a bullet each, the double listing is explained", (a?.card.lines ?? []).some((l) => /^In plant: \d+$/.test(l)) && (a?.card.lines ?? []).some((l) => /^Outside plant: \d+$/.test(l)) && (a?.card.lines ?? []).some((l) => /^Not classified: 1$/.test(l)) && (a?.card.lines ?? []).some((l) => /19 entries in all/.test(l)), JSON.stringify(a?.card.lines));
  ok("...plant numbers first, then outside, then not classified", a?.card.table?.rows[0][2] === "In plant" && a?.card.table?.rows[ROWS.length - 1][2] === "Not classified");
  a = await ask("how many pax numbers");
  ok("'how many pax numbers': the headline is the bare count", head(a) === String(DISTINCT), head(a));
  a = await ask("pax numbers outside plant");
  ok("'pax numbers outside plant': only outside numbers (46298 is not classified, so not among them)", nums(a).length === 3 && (a?.card.table?.rows ?? []).every((r) => r[2] === "Outside plant") && head(a) === "3 PAX numbers", JSON.stringify(nums(a)));
  ok("'township pax numbers' is the same", JSON.stringify(nums(await ask("township pax numbers"))) === JSON.stringify(nums(a)));
  a = await ask("pax numbers in plant");
  ok("'pax numbers in plant': plant rows only, none outside", (a?.card.table?.rows ?? []).every((r) => r[2] === "In plant") && nums(a).length === ROWS.filter((r) => r.area === "plant").length);
  a = await ask("how many pax numbers in plant");
  ok("'how many pax numbers in plant': a bare count", head(a) === String(new Set(ROWS.filter((r) => r.area === "plant").map((r) => r.number)).size));
  a = await ask("pax complaint");
  ok("'pax complaint': both complaint numbers", head(a) === "40221 · 45221" && a?.card.title === "PAX complaint numbers", JSON.stringify(a?.card));
  ok("...'pax not working' and 'pax out of order' are the same", head(await ask("pax not working")) === "40221 · 45221" && head(await ask("pax out of order")) === "40221 · 45221");
  a = await ask("pax electrical complaint");
  ok("'pax electrical complaint' finds the ELECTRICAL desk (MRS Control), the words are not thrown away", head(a) === "40601" && nums(a).length === 1, JSON.stringify(a?.card));
  a = await ask("pax not working in civil");
  ok("'pax not working in civil': 'civil' matches no complaint row, so the PAX complaint desk answers and the unused word is SAID", head(a) === "40221 · 45221" && (a?.card.lines ?? []).some((l) => /Words not used: civil/.test(l)), JSON.stringify(a?.card));
  ok("a weak cue with a fault ('my phone is not working', 'telephone out of order') is NEVER taken: that is not a PAX question without the word pax", (await ask("my phone is not working")) === null && (await ask("telephone out of order")) === null);
  ok("'pax fire service department' and 'pax no of fire service dept' -> 42046 (department is filler)", head(await ask("pax fire service department")) === "42046" && head(await ask("pax no of fire service dept")) === "42046");
  a = await ask("pax complaint township");
  ok("'pax complaint township': 45221 only", head(a) === "45221" && nums(a).length === 1);
  a = await ask("pax complain in plant");
  ok("'pax complain in plant': 40221 only", head(a) === "40221" && nums(a).length === 1);
  a = await ask("pax fire service township");
  ok("a name with the wrong area: 'None', the sentence says what it has, its row is shown", head(a) === "None" && /has no PAX number outside the plant/.test(a?.summary ?? "") && nums(a).join() === "42046", JSON.stringify(a?.card));
  a = await ask("how many pax numbers does civil have");
  ok("a count of a name: 'how many pax numbers does civil have' = 3", head(a) === "3", JSON.stringify(a?.card.headline));
  // an empty directory, a bad row
  ok("an empty table: an honest 'Empty', never a crash", head(await ask("pax", [])) === "Empty");
  ok("a note in a row adds a Note column", (await ask("pax fire service", [{ ...ROWS[3], note: "Day shift only" }]))?.card.table?.columns.join() === "PAX,Name,Area,Note");
  ok("a failing read: a strong cue says 'Not available' plainly; a weak or bare-number question is simply not taken", head(await answerPax("pax fire service", async () => { throw new Error("down"); })) === "Not available" && (await answerPax("who has 42046", async () => { throw new Error("down"); })) === null);
  ok("buildPaxAnswer is pure: the same plan and rows give the same card twice", JSON.stringify(buildPaxAnswer(planPaxQuery("pax civil")!, ROWS)) === JSON.stringify(buildPaxAnswer(planPaxQuery("pax civil")!, ROWS)));
  ok("matchByNumber / matchByName basics", matchByNumber(ROWS, ["42043"]).length === 2 && matchByName(ROWS, ["fire"], false).rows.length === 1);
  ok("the database function's wording is normalised (plant / in plant / outside plant / not classified / anything else)", normalizeArea("plant") === "plant" && normalizeArea("In Plant") === "plant" && normalizeArea("outside plant") === "outside" && normalizeArea("outside_plant") === "outside" && normalizeArea("not classified") === "unclassified" && normalizeArea(null) === "unclassified");
  ok("the loader keeps every column and drops a row without a name or number", await (async () => {
    const r = await loadPaxRows(async () => [{ label: " A ", dept_name: "A", location: null, number: 40001, note: null, area: "plant" }, { label: "", number: "1", area: "plant" }, { label: "B", number: "", area: "plant" }]);
    return r.length === 1 && r[0].label === "A" && r[0].number === "40001" && r[0].location === "" && r[0].area === "plant";
  })());

  // ---- the route inside runOmnibar ----
  const calls = { hospital: 0, holiday: 0, model: 0, client: 0, pax: [] as string[] };
  const deps = (over: object = {}) =>
    ({
      enabled: true, verifiedMin: 1, skipModel: false, legacy: async () => null,
      holiday: async () => { calls.holiday++; return null; },
      hospital: async () => { calls.hospital++; return { kind: "count", answer: "hospital answer" } as never; },
      pax: async (q: string) => {
        calls.pax.push(q);
        const r = await answerPax(q, async () => ROWS);
        return r ? ({ kind: "count", answer: r.summary, hospital: r.card, interpretation: r.interpretation } as never) : null;
      },
      llm: async () => { calls.model++; throw new Error("the model must not be called"); },
      withClient: async () => { calls.client++; throw new Error("the model's read-only client must never be used for PAX"); },
      ...over,
    }) as never;
  const reset = () => { calls.hospital = 0; calls.holiday = 0; calls.model = 0; calls.client = 0; calls.pax = []; };
  type P = { kind: string; answer: string; hospital?: { headline?: { text: string } }; source?: string; attempt?: number; interpretation?: string };

  reset();
  let o = (await runOmnibar("pax number of fire service", "U1", deps())) as P;
  ok("runOmnibar: a PAX question is answered by the PAX route: the card, the headline 42046", o?.hospital?.headline?.text === "42046" && /Fire Service/.test(o.answer), JSON.stringify(o));
  ok("...tagged with a source the feedback table accepts (the same as the hospital's), attempt 1, and 'Understood as' travels", o?.source === "holiday" && o?.attempt === 1 && /fire service/.test(o.interpretation ?? ""));
  ok("...no hospital route, no holiday route, no model, and the model's client is never touched", calls.hospital === 0 && calls.holiday === 0 && calls.model === 0 && calls.client === 0);

  reset();
  o = (await runOmnibar("pax number of hospital opd", "U1", deps())) as P;
  ok("'pax number of hospital opd' is a PAX question (the word pax), NOT the hospital OPD", o?.hospital?.headline?.text === "Not found" && calls.hospital === 0);

  reset();
  o = (await runOmnibar("is opd open today", "U1", deps())) as P;
  ok("an OPD question goes on past the PAX route to the hospital route", o?.answer === "hospital answer" && calls.hospital === 1 && calls.pax.length === 1);

  reset();
  o = (await runOmnibar("who has 42046", "U1", deps())) as P;
  ok("a bare number found in the directory is answered by the PAX route", o?.hospital?.headline?.text === "Fire Service" && calls.hospital === 0);
  reset();
  o = (await runOmnibar("99999", "U1", deps({ skipModel: true, hospital: async () => { calls.hospital++; return null; } }))) as P;
  ok("a bare number NOT in the directory is passed on untouched (nothing answers here, the app goes on to the circulars)", o === null && calls.pax.length === 1 && calls.hospital === 1, JSON.stringify(o));

  reset();
  o = (await runOmnibar("pax number of fire service", "U1", deps({ skipModel: true }), { logId: null, reason: "other" as never, note: null, attempt: 1 })) as P;
  ok("a RETRY (a 'No' on an earlier answer) does not call the PAX route again", calls.pax.length === 0 && o?.hospital?.headline?.text !== "42046", JSON.stringify(o));

  reset();
  o = (await runOmnibar("pax number of fire service", "U1", deps({ pax: async () => { throw new Error("db down"); }, skipModel: true }))) as P;
  ok("a failing PAX route never breaks the omnibar: the other routes answer", calls.hospital === 1 && o?.answer === "hospital answer");

  reset();
  o = (await runOmnibar("pax number of fire service", "U1", { ...(deps() as object), pax: undefined } as never)) as P;
  ok("an older caller without the pax dependency still works (optional, like the hospital's)", calls.hospital === 1);

  // ---- the wiring in the file itself: the application's own connection, never the model's ----
  const src = readFileSync("src/lib/nl2sql/omnibar.ts", "utf8");
  const wiring = src.slice(src.indexOf("pax: async (qq)"), src.indexOf("hospital: async (qq)"));
  ok("omnibar.ts wires the PAX route to getDb() (the app's own connection)", wiring.includes("getDb") && wiring.includes("loadPaxRows") && wiring.includes("answerPax"), wiring.slice(0, 300));
  ok("...and the PAX wiring's CODE never uses withClient / withDefaultClient / nlq_reader (its comment may name them)", !/withClient|withDefaultClient|nlq_reader|NL2SQL_DATABASE_URL/.test(wiring.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n")));
  ok("...the route sits BEFORE the hospital route in runOmnibar", src.indexOf("deps.pax ?") > 0 && src.indexOf("deps.pax ?") < src.indexOf("deps.hospital ?"));
  ok("the table is not in the model's schema: no nlq view mentions pax_directory", !/pax_directory/.test(readFileSync("src/lib/nl2sql/context.ts", "utf8")));

  console.log(`pax selftest: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main();

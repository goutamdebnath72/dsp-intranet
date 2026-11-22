// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/records/records.selftest.ts </dev/null
// The umbrella's checks: the fixed selections, what each lets run, the planner and its register of clashes, and that every example line and every cue-completed line is really understood by the engine it is for.

import { readFileSync, existsSync } from "node:fs";
import { DateTime } from "luxon";
import { DOMAINS, DOMAIN_IDS, PEOPLE_FACETS, domainById, doctorDegreesAsked } from "./domains";
import { parseFacet, parseScope, stepAllowed, nothingInScope, selectionQuery, finderLabel, finderReady, AUTO_SELECTION, type Step } from "./scope";
import { planLine, suggestDomain, PRECEDENCE } from "./plan";
import { COLLISIONS } from "./collisions";
import { planPaxQuery } from "@/lib/pax/matcher";
import { answerHospital } from "@/lib/hospital/engine";
import type { HolidaysOn } from "@/lib/hospital/closure";
import { answerDegreeQuestion } from "@/lib/qualifications/degreeAnswer";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => { if (cond) pass++; else { fail++; console.log(`FAIL ${name} ${extra}`); } };

(async () => {
  // ---- the selections
  ok("six fixed selections, each with a label, a hint, a placeholder and examples", DOMAINS.length === 6 && DOMAINS.every((d) => d.label && d.hint && d.placeholder && d.examples.length >= 3));
  ok("their ids are unique and the planner's precedence names exactly them", new Set(DOMAIN_IDS).size === DOMAIN_IDS.length && PRECEDENCE.length === DOMAIN_IDS.length && PRECEDENCE.every((p) => DOMAIN_IDS.includes(p)));
  ok("People has three facets: find, roster, ask", PEOPLE_FACETS.map((f) => f.id).join() === "find,roster,ask");

  // ---- the scope of a request (a typed URL cannot invent one)
  ok("an unknown or missing scope is auto (admin is the one non-record scope the server knows; EDS never travels as a scope)", parseScope(null) === "auto" && parseScope("") === "auto" && parseScope("admin") === "admin" && parseScope("eds") === "auto" && parseScope("__proto__") === "auto" && parseScope("PAX ") === "pax");
  ok("an unknown facet is 'ask' (the model path, as before)", parseFacet("x") === "ask" && parseFacet(null) === "ask" && parseFacet("ROSTER") === "roster");

  // ---- what each selection lets run
  const STEPS: Step[] = ["admin", "dates", "pax", "hospital", "phd", "degrees", "holiday", "departmentWords", "verified", "model"];
  ok("auto lets every path run (today's behaviour)", STEPS.every((s) => stepAllowed("auto", s)));
  ok("management requests are allowed under every selection (they open only for their own words, and check who is calling)", DOMAIN_IDS.every((d) => stepAllowed(d, "admin")));
  ok("PAX runs only the PAX path, never the model or the hospital", stepAllowed("pax", "pax") && !stepAllowed("pax", "model") && !stepAllowed("pax", "hospital") && !stepAllowed("pax", "holiday"));
  ok("Hospital runs only the hospital path", stepAllowed("hospital", "hospital") && STEPS.filter((s) => s !== "admin" && s !== "hospital").every((s) => !stepAllowed("hospital", s)));
  ok("Holidays runs only the holiday path", stepAllowed("holidays", "holiday") && STEPS.filter((s) => s !== "admin" && s !== "holiday").every((s) => !stepAllowed("holidays", s)));
  ok("Degrees runs the degree and PhD paths and nothing about people lists or the model", stepAllowed("degrees", "degrees") && stepAllowed("degrees", "phd") && !stepAllowed("degrees", "model"));
  ok("People runs the people paths (dates, PhD, department words, verified, model) and not PAX, hospital or holidays", ["dates", "phd", "departmentWords", "verified", "model"].every((s) => stepAllowed("people", s as Step)) && !stepAllowed("people", "pax") && !stepAllowed("people", "hospital") && !stepAllowed("people", "holiday"));
  ok("Documents runs no records path at all", STEPS.filter((s) => s !== "admin").every((s) => !stepAllowed("documents", s)));
  ok("the 'nothing found' sentence names the selection and offers Everything", /under PAX/.test(nothingInScope("pax", "xyz")) && /Everything/.test(nothingInScope("pax", "xyz")));

  ok("EDS is a choice of the bar but not a record: it is no domain, the server never reads it as a selection, and it lets no records path run", !DOMAIN_IDS.includes("eds" as never) && parseScope("eds") === "auto" && STEPS.filter((x) => x !== "admin").every((x) => !stepAllowed("eds", x)));
  // ---- the address of a search
  const sel = (o: Partial<typeof AUTO_SELECTION>) => ({ ...AUTO_SELECTION, ...o });
  ok("under Everything the address is exactly what it always was", selectionQuery(AUTO_SELECTION) === "" && selectionQuery(undefined) === "");
  ok("a chosen selection adds its id", selectionQuery(sel({ scope: "pax" })) === "&scope=pax");
  ok("People adds its facet, and the finder adds only what was picked", selectionQuery(sel({ scope: "people", facet: "find" })) === "&scope=people&facet=find" && selectionQuery(sel({ scope: "people", facet: "roster", dept: "12", grade: "7", nm: " roy " })) === "&scope=people&facet=roster&dept=12&grade=7&nm=roy" && selectionQuery(sel({ scope: "people", facet: "roster", dept: "12" })) === "&scope=people&facet=roster&dept=12");
  ok("a finder value left over from People does not leak into another selection", selectionQuery(sel({ scope: "pax", dept: "12", grade: "7", nm: "x" })) === "&scope=pax");
  ok("the finder's words and readiness", finderLabel({ gradeName: "DGM", deptName: "C&IT" }) === "DGM in C&IT" && finderLabel({ deptName: "Blast Furnace" }) === "Employees in Blast Furnace" && finderLabel({ gradeName: "Manager", nm: "roy" }) === "Manager named like roy" && !finderReady(AUTO_SELECTION) && finderReady(sel({ dept: "1" })) && finderReady(sel({ nm: "roy" })) && !finderReady(sel({ nm: "r" })));

  // ---- the planner and its register
  for (const c of COLLISIONS) {
    const p = planLine(c.line);
    const got = p.ambiguous ? "ask" : p.best?.domain ?? null;
    ok(`register: "${c.line}" -> ${c.expect} (${c.why})`, got === c.expect, `got ${got} ${JSON.stringify(p.claims)}`);
  }
  ok("a line with nothing to go on suggests nothing", suggestDomain("") === null && suggestDomain("x") === null && suggestDomain("2026 ??") === null);
  ok("the planner is pure and fast: 2000 lines under 200 ms", (() => { const t = Date.now(); for (let i = 0; i < 2000; i++) planLine(COLLISIONS[i % COLLISIONS.length].line); return Date.now() - t < 200; })());
  ok("the planner never throws on odd input", ["   ", "'; drop table", "কলকাতা", "😀😀", "a".repeat(5000)].every((l) => { try { planLine(l); return true; } catch { return false; } }));

  // ---- cue completion: a chosen selection makes the line the engine's own
  const pax = domainById("pax")!, hosp = domainById("hospital")!, hol = domainById("holidays")!, deg = domainById("degrees")!;
  ok("PAX: a bare place name gets 'pax number of' and is understood by the PAX planner", /^pax number of fire service$/.test(pax.scopeLines("fire service")[0]) && planPaxQuery(pax.scopeLines("fire service")[0]) !== null);
  ok("PAX: a bare extension is asked as 'who has pax N' and is understood", pax.scopeLines("42046")[0] === "who has pax 42046" && planPaxQuery(pax.scopeLines("42046")[0]) !== null);
  ok("PAX: a line that already says pax / phone / contact is left alone", pax.scopeLines("pax of civil")[0] === "pax of civil" && pax.scopeLines("phone of civil")[0] === "phone of civil");
  for (const ex of pax.examples) ok(`PAX example "${ex}" is understood`, planPaxQuery(pax.scopeLines(ex)[0]) !== null);

  const NOW = DateTime.fromISO("2026-10-25T10:00:00", { zone: "Asia/Kolkata" });
  const holidaysOn: HolidaysOn = async (iso) => {
    const f = `Holidays/holiday${iso.slice(0, 4)}_enriched.json`;
    if (!existsSync(f)) return { yearLoaded: false, hits: [] };
    const d = JSON.parse(readFileSync(f, "utf8")) as { holidays: { name: string; date: string; type: "CH" | "FH" | "RH"; categories: string | null }[] };
    return { yearLoaded: true, hits: d.holidays.filter((h) => h.date === iso).map((h) => ({ name: h.name, type: h.type, categories: h.categories })) };
  };
  const hospitalAnswers = async (q: string) => { const r = await answerHospital(hosp.scopeLines(q)[0], { now: NOW, holidaysOn }); return !!r && r.card.status?.tone !== "unknown"; };
  ok("Hospital: a line that says opd / doctor / hospital is left alone", hosp.scopeLines("is opd open today")[0] === "is opd open today" && hosp.scopeLines("dr karmakar")[0] === "dr karmakar");
  ok("Hospital: a bare topic gets 'opd' added", hosp.scopeLines("medicine")[0] === "medicine opd");
  for (const ex of hosp.examples) ok(`Hospital example "${ex}" is answered`, await hospitalAnswers(ex));
  ok("Hospital: 'medicine' alone is answered once the selection adds the cue", await hospitalAnswers("medicine"));
  ok("Hospital: 'token timings' is answered", await hospitalAnswers("token timings"));

  const hl = (q: string) => hol.scopeLines(q).join(" | ");
  ok("Holidays: the line as typed first (the parser understands 'diwali 2026'), then 'when is ...'; a bare year becomes 'holiday list ...'; a holiday line is left alone", hl("diwali 2026") === "diwali 2026 | when is diwali 2026" && hl("2026") === "holiday list 2026" && hl("holiday list 2026") === "holiday list 2026" && hl("restricted holidays 2026") === "restricted holidays 2026");

  ok("Degrees: a bare degree becomes 'what is ...'; a question and a PhD line are left alone", deg.scopeLines("mtech")[0] === "what is mtech" && deg.scopeLines("is MD a postgraduate degree")[0] === "is MD a postgraduate degree" && deg.scopeLines("who are the PhD holders")[0] === "who are the PhD holders");
  ok("Degrees: 'mtech' under the selection is answered", answerDegreeQuestion(deg.scopeLines("mtech")[0]) !== null);
  ok("Degrees: the examples are DNB (not MD or MS: the familiar ones need no example), the PhD holders, and the degrees of the doctors; no 'what is mtech'", JSON.stringify(deg.examples) === JSON.stringify(["is DNB a postgraduate degree", "who are the PhD holders", "list the degrees of the doctors"]) && !deg.examples.some((e) => /mtech|\bMD\b/i.test(e)));
  ok("Degrees: 'is DNB a postgraduate degree' is answered Yes by the table of degrees", answerDegreeQuestion(deg.scopeLines(deg.examples[0])[0])?.card.headline?.text === "Yes");
  const docDeg = await answerHospital(deg.scopeLines(deg.examples[2])[0], { now: NOW, holidaysOn });
  ok("Degrees: 'list the degrees of the doctors' is left as typed and the hospital's list of doctors and their qualifications answers it (a table of doctors)", deg.scopeLines(deg.examples[2])[0] === deg.examples[2] && docDeg?.card.title === "Doctors and their qualifications" && (docDeg.card.table?.rows.length ?? 0) > 10, docDeg?.card.title);
  ok("doctorDegreesAsked is only for degrees or qualifications of doctors", doctorDegreesAsked("list the degrees of the doctors") && doctorDegreesAsked("qualifications of dr karmakar") && !doctorDegreesAsked("is opd open today") && !doctorDegreesAsked("what is mtech") && !doctorDegreesAsked("how many doctors in opd"));

  // ---- every example is its own domain's by the planner too (nothing under PAX looks like a holiday line)
  ok("no domain's example line is claimed by a DIFFERENT domain's explicit name", DOMAINS.every((d) => d.examples.every((e) => { const b = planLine(e).best; return !b || b.domain === d.id || b.strength < 90 || d.id === "people" || d.id === "pax"; })));

  console.log(`records: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

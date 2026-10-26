// Run (from the project root): npx tsx --tsconfig tsconfig.json src/lib/hospital/qualification.selftest.ts
// Step 56a: "list of DNB doctors" (owner, 26 Oct 2026). The model took DNB to mean EVERY doctor and listed all 52. A qualification is not in the HR directory; the hospital's staff list prints it for each
// doctor, so the answer is read from there, as printed, and says what it does NOT know (the doctors whose qualification is not recorded).

import { DateTime } from "luxon";
import { answerHospital, nice, qualificationsAsked } from "./engine";
import { STAFF } from "./opdData";
import { unlistedAsPeople } from "./nonPermanentDoctors";
import real from "../nl2sql/__fixtures__/departments.real.json";
import { DOCTOR_DOC, QUALIFICATION_DOC, isDoctorQuestion, isQualificationQuestion } from "../nl2sql/medicalCadre";
import { buildPrompt } from "../nl2sql/prompt";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};
const ctx: any = { now: DateTime.fromISO("2026-10-26T11:00:00", { zone: "Asia/Kolkata" }), holidaysOn: async () => [] };
const gone = (p: any) => p.status === "retired" || p.status === "transferred";
const pool: any[] = [...STAFF.people.filter((p: any) => p.role === "doctor"), ...unlistedAsPeople()].filter((p) => !gone(p));
const printed = (p: any) => String(p.qualification ?? "").toUpperCase();
const noQual = pool.filter((p) => !printed(p).trim());
const rowsOf = (r: any): string[][] => r?.card?.table?.rows ?? [];

(async () => {
  // ---- the question of the owner, and the way people write it
  const dnbDocs = pool.filter((p) => /\bDNB\b/.test(printed(p)));
  ok("known fact (26 Oct 2026): exactly ONE doctor on the lists prints DNB: Rajeev Kumar, ticket 499169, DNB(MEDICINE)", dnbDocs.length === 1 && dnbDocs[0].name === "RAJEEV KUMAR" && dnbDocs[0].ticket === "499169" && dnbDocs[0].qualification === "DNB(MEDICINE)");
  for (const q of ["list of DNB doctors.", "list of DNB doctors", "list of dnb doctors", "how many doctors have DNB", "doctors with D.N.B.", "show me the DNB doctors", "which doctors are DNB"]) {
    const r = await answerHospital(q, ctx);
    ok(`"${q}": the hospital route answers`, !!r && r.card.title === "Doctors with DNB", r?.card.title);
    ok(`"${q}": the table is exactly the DNB doctors of the data, not all doctors`, JSON.stringify(rowsOf(r).map((x) => x[1])) === JSON.stringify(dnbDocs.map((p) => p.ticket)), JSON.stringify(rowsOf(r)));
  }
  let r: any = await answerHospital("list of DNB doctors.", ctx);
  ok("the row: Dr. Rajeev Kumar | 499169 | DNB(MEDICINE) | Medicine | Medicine", JSON.stringify(rowsOf(r)[0]) === JSON.stringify(["Dr. Rajeev Kumar", "499169", "DNB(MEDICINE)", "Medicine", "Medicine"]), JSON.stringify(rowsOf(r)[0]));
  ok("the table says the qualification is shown as printed", rowsOf(r).length === 1 && r.card.table.columns.includes("Qualification (as printed)"));
  ok("the headline says RECORDED, and names him", /^1 doctor is recorded with DNB: Dr\. Rajeev Kumar\./.test(r.summary), r.summary);
  ok("the headline states the gap: the qualification is not recorded for the doctors that have none, so the list may be incomplete", noQual.length > 0 && r.summary.includes(`not recorded for ${noQual.length} of the ${pool.length} doctors`) && r.summary.includes("may be incomplete"), r.summary);
  const gapLine: string = (r.card.lines ?? []).find((l: string) => l.startsWith("Not recorded (so not counted): ")) ?? "";
  ok("the gap names the doctors whose qualification is unknown (they may hold it): the first of them are in the line, and the line says so", noQual.length > 0 && noQual.slice(0, 5).every((p) => gapLine.includes(`Dr. ${nice(p.name)}`)) && gapLine.includes("Any of them may hold DNB"), gapLine.slice(0, 160));
  ok("DrNB is a different degree: the DNB answer names its holder and says it is NOT counted", (r.card.lines ?? []).some((l: string) => /holds DrNB/.test(l) && /not counted as DNB/.test(l) && /A K Sahay/.test(l)), JSON.stringify(r.card.lines));
  ok("the gap is not hidden when the qualification IS known for everybody asked about (Medicine: 5 of 5, no 'may be incomplete')", (await answerHospital("list of MD doctors in medicine", ctx))?.summary.includes("may be incomplete") === false);

  // ---- the other qualifications
  r = await answerHospital("who are the DrNB doctors", ctx);
  ok("DrNB: A K Sahay (MCH & DRNB PLASTIC SURGERY), and no 'not counted as DNB' line", r?.card.title === "Doctors with DrNB" && rowsOf(r).length === 1 && /SAHAY/i.test(rowsOf(r)[0][0]) && !(r.card.lines ?? []).some((l: string) => /not counted as DNB/.test(l)), JSON.stringify(rowsOf(r)));
  const count = (re: RegExp) => pool.filter((p) => re.test(printed(p))).length;
  for (const [q, re, title] of [["list of MBBS doctors", /\bMBBS\b/, "Doctors with MBBS"], ["list of MS doctors", /\bMS\b/, "Doctors with MS"], ["list of MD doctors", /\bMD\b/, "Doctors with MD"], ["list of MDS doctors", /\bMDS\b/, "Doctors with MDS"], ["list of DGO doctors", /\bDGO\b/, "Doctors with DGO"]] as [string, RegExp, string][]) {
    const x: any = await answerHospital(q, ctx);
    ok(`"${q}": ${count(re)} doctors, the number of the data`, x?.card.title === title && rowsOf(x).length === count(re), `${x?.card.title} ${rowsOf(x).length} vs ${count(re)}`);
    ok(`"${q}": every row's printed qualification really has it`, rowsOf(x).every((row) => re.test(row[2].toUpperCase())));
  }
  r = await answerHospital("doctors with DM", ctx);
  ok("a qualification nobody holds: 'No doctor is recorded with DM', still with the gap", /^No doctor is recorded with DM\./.test(r?.summary ?? "") && r.summary.includes("may be incomplete") && !r.card.table);
  r = await answerHospital("list of MD or DNB doctors", ctx);
  ok("two qualifications: the doctors who hold either", rowsOf(r).length === pool.filter((p) => /\bMD\b|\bDNB\b/.test(printed(p))).length && r.card.title === "Doctors with DNB or MD", r.card.title);
  r = await answerHospital("list of MD doctors in medicine", ctx);
  ok("with a department: only that department's doctors (Medicine), every one with MD(MEDICINE)", r.card.title === "Doctors with MD in Medicine" && rowsOf(r).length >= 1 && rowsOf(r).every((x) => x[4] === "Medicine" && /^MD/.test(x[2])), JSON.stringify(rowsOf(r)));

  // ---- what must NOT be taken
  for (const q of ["list of doctors", "how many doctors are there", "list of dnb executives with nic mail", "ms word circular", "mediclaim for dnb doctors", "list of MBBS doctors with mobile number", "retired DNB doctors"]) ok(`not the hospital qualification list: "${q}"`, !(await answerHospital(q, ctx))?.card.title.startsWith("Doctors with"), (await answerHospital(q, ctx))?.card.title);
  r = await answerHospital("list of ent doctors", ctx);
  ok("the doctors of a department still work", r?.card.title === "Doctors of ENT");
  ok("qualificationsAsked: dnb, d n b, drnb are told apart; plain words are none", JSON.stringify(qualificationsAsked("list of dnb doctors").map((x) => x.key)) === '["DNB"]' && JSON.stringify(qualificationsAsked("doctors with d n b").map((x) => x.key)) === '["DNB"]' && JSON.stringify(qualificationsAsked("who are the drnb doctors").map((x) => x.key)) === '["DRNB"]' && qualificationsAsked("list of doctors in medicine").length === 0);

  // ---- the SQL path: when such a question does reach the model (it also filters the people), the model is told that a qualification is not in the directory
  const prompt = (question: string) => buildPrompt({ question, context: { designations: [], departments: real } as never, examples: [] });
  ok("the rule says that the directory holds no qualification, that 'DNB doctors' is not 'doctors', and what to return", QUALIFICATION_DOC.includes("NOT in the directory") && /NOT "doctors"/.test(QUALIFICATION_DOC) && QUALIFICATION_DOC.includes("unanswerable_reason") && QUALIFICATION_DOC.includes("does not record qualifications"));
  ok("a question that names a qualification gets it: DNB doctors with a mail, an MBBS holder, a degree", isQualificationQuestion("list of DNB doctors with nic mail") && isQualificationQuestion("who holds a dnb") && isQualificationQuestion("mbbs doctors with mobile") && isQualificationQuestion("doctors with an md degree"));
  ok("an ordinary doctor question, or any other question, does not", !isQualificationQuestion("how many doctors are there in each designation") && !isQualificationQuestion("how many executives are there in c&it") && !isQualificationQuestion("ms word circular"));
  ok("the prompt of a DNB question contains the rule, and the doctor rules", prompt("list of DNB doctors with nic mail").includes(QUALIFICATION_DOC) && prompt("list of DNB doctors with nic mail").includes(DOCTOR_DOC));
  ok("the prompt of an ordinary doctor question is UNCHANGED: no rule, no extra characters (the doctor prompt has only about 60 characters of budget)", !prompt("how many doctors are there in main hospital, list them").includes("QUALIFICATIONS (") && prompt("how many doctors are there in main hospital, list them").length < 17000);
  ok("a DNB question about the main hospital stays within a modest budget (under 17,500 characters)", prompt("list of DNB doctors in main hospital with nic mail").length < 17500, String(prompt("list of DNB doctors in main hospital with nic mail").length));
  ok("isDoctorQuestion recognises dnb, drnb and mbbs as doctor words", isDoctorQuestion("who has a dnb") && isDoctorQuestion("drnb holders") && isDoctorQuestion("mbbs only") && !isDoctorQuestion("how many executives are there in c&it"));
  console.log(`qualification selftest: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

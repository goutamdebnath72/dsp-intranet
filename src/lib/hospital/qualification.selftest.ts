// Run (from the project root): npx tsx --tsconfig tsconfig.json src/lib/hospital/qualification.selftest.ts
// Step 56a: "list of DNB doctors" (owner, 26 Oct 2026). The model took DNB to mean EVERY doctor and listed all 52. A qualification is not in the HR directory; the hospital's staff list prints it for each
// doctor, so the answer is read from there, as printed, and says what it does NOT know (the doctors whose qualification is not recorded).

import { DateTime } from "luxon";
import { answerHospital, nice, qualificationsAsked, specialisationOf } from "./engine";
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
  const foldedNames: string = (r.card.details ?? []).find((d: { summary: string }) => d.summary.startsWith(`The ${noQual.length} doctors whose qualification is not recorded`))?.text ?? "";
  ok("the doctors whose qualification is unknown are named in a FOLDED line (they may hold it), not in a long bullet", noQual.length > 0 && noQual.every((p) => foldedNames.includes(`Dr. ${nice(p.name)}`)) && (r.card.details ?? [])[0].summary.endsWith("(any of them may hold DNB)") && !(r.card.lines ?? []).some((l: string) => /^Not recorded/.test(l)), foldedNames.slice(0, 120));
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

  // ---- "list the doctors with their degrees" (26 Oct 2026: it fell through to four unrelated circulars at 77 to 87 per cent)
  const recorded = pool.filter((p) => printed(p).trim());
  for (const q of ["list the doctors with their degrees", "doctors with qualification", "what are the qualifications of the doctors", "how many doctors are qualified"]) {
    const d: any = await answerHospital(q, ctx);
    ok(`"${q}": every doctor whose qualification is recorded, with it as printed`, d?.card.title === "Doctors and their qualifications" && rowsOf(d).length === recorded.length && rowsOf(d).every((row) => row[2].trim() !== "" && row[2] !== "—"), `${d?.card.title} ${rowsOf(d).length} vs ${recorded.length}`);
  }
  r = await answerHospital("list the doctors with their degrees", ctx);
  ok("the headline says how many are recorded, and that the others are not shown", r.summary === `${recorded.length} of the ${pool.length} doctors have a qualification on record, shown as printed. It is not recorded for ${noQual.length}, who are not shown.`, r.summary);
  ok("the doctors without a recorded qualification are named, not silently dropped: in a folded line", (r.card.details ?? []).some((d: { summary: string; text: string }) => d.summary === `The ${noQual.length} doctors whose qualification is not recorded` && noQual.every((p) => d.text.includes(`Dr. ${nice(p.name)}`))) && (r.card.lines ?? []).length === 0, JSON.stringify(r.card.details?.map((d: { summary: string }) => d.summary)));
  r = await answerHospital("qualifications of ent doctors", ctx);
  ok("with a department: that department's doctors only (ENT)", r?.card.title === "Doctors and their qualifications in ENT" && rowsOf(r).length >= 1 && rowsOf(r).every((x) => x[4] === "ENT"), JSON.stringify(rowsOf(r)));

  // ---- the SPECIALISATION (step 57a). A degree or qualification is any of MBBS, MD, MS ...; a SPECIALISATION comes only from a POSTGRADUATE qualification (MD, MS, DNB, DrNB, MCh, DM, MDS, a
  // postgraduate diploma such as DGO, DPM, DIH, D.Ortho, MRCOG). MBBS alone: none. No qualification recorded: not known. A bare "MS": postgraduate, subject not stated.
  const POSTGRAD = /\b(MD|MS|DNB|DR\.?\s?NB|MCH|DM|MDS|DGO|DPM|DIH|MRCOG)\b|\bD\.?\s?ORTHO\b/;
  const pgDocs = pool.filter((p) => POSTGRAD.test(printed(p)));
  const mbbsOnly = pool.filter((p) => printed(p).trim() && !POSTGRAD.test(printed(p)));
  ok("the data: postgraduate, MBBS alone and not recorded together are the whole pool", pgDocs.length + mbbsOnly.length + noQual.length === pool.length && pgDocs.length > 0 && mbbsOnly.length > 0 && noQual.length > 0);
  for (const q of ["the specialisation of doctors in dsp", "specializations of doctors", "what are the specialities of the doctors", "specialty of doctors"]) {
    const sp: any = await answerHospital(q, ctx);
    ok(`"${q}": the doctors who have a postgraduate qualification, and nobody else`, sp?.card.title === "Specialisations of doctors" && rowsOf(sp).length === pgDocs.length && rowsOf(sp).every((row) => POSTGRAD.test(row[3].toUpperCase())), `${sp?.card.title} ${rowsOf(sp).length} vs ${pgDocs.length}`);
  }
  r = await answerHospital("the specialisation of doctors in dsp", ctx);
  const specs = new Set(pgDocs.map((p) => specialisationOf(p)).filter((x) => x.kind === "stated").map((x) => x.spec));
  const statedCount = pgDocs.filter((p) => specialisationOf(p).kind === "stated").length;
  ok("no doctor with MBBS alone and no doctor without a recorded qualification is in the table", rowsOf(r).every((row) => !mbbsOnly.some((p) => row[0] === `Dr. ${nice(p.name)}`) && !noQual.some((p) => row[0] === `Dr. ${nice(p.name)}`)));
  ok("the headline counts those with a stated specialisation and the distinct specialisations, and says that the rest are not known", r.summary === `${statedCount} of the ${pool.length} doctors have a specialisation on record, in ${specs.size} specialisations. The qualification is not recorded for ${noQual.length}, so their specialisation is not known.`, r.summary);
  ok("Dr. Rajeev Kumar: Medicine (DNB counts, it is postgraduate)", rowsOf(r).some((row) => row[0] === "Dr. Rajeev Kumar" && row[2] === "Medicine" && row[3] === "DNB(MEDICINE)"));
  ok("a postgraduate DIPLOMA counts: a DGO doctor is listed with her specialisation", rowsOf(r).some((row) => /DGO/.test(row[3]) && /Gynaecology/.test(row[2])), JSON.stringify(rowsOf(r).filter((row) => /DGO/.test(row[3]))));
  ok("a bare 'MS' (Dr. Priyanka Roy): listed as 'not stated', and last", rowsOf(r)[rowsOf(r).length - 1].join("|").startsWith("Dr. Priyanka Roy|") && rowsOf(r)[rowsOf(r).length - 1][2] === "not stated" && rowsOf(r).filter((row) => row[2] === "not stated").length === 1, JSON.stringify(rowsOf(r).slice(-2)));
  ok("the bullets that matter: by specialisation, MBBS alone (counted, not listed), the bare MS (not guessed); the rule and the unknown doctors are folded", (r.card.lines ?? []).length === 3 && (r.card.lines ?? [])[0].startsWith("By specialisation: ") && (r.card.lines ?? []).some((l: string) => l === `${mbbsOnly.length} doctors with MBBS alone have no specialisation (not listed).`) && (r.card.lines ?? []).some((l: string) => /Priyanka Roy \(MS\).*subject is not stated.*not guessed/.test(l)) && (r.card.details ?? []).length === 2 && r.card.details[0].text.includes("a doctor with MBBS alone has none") && r.card.details[1].summary === `The ${noQual.length} doctors whose qualification is not recorded`, JSON.stringify(r.card.lines));
  r = await answerHospital("specialisation of ent doctors", ctx);
  ok("with a department: that department's doctors only", r?.card.title === "Specialisations of doctors in ENT" && rowsOf(r).length >= 1 && rowsOf(r).every((x) => x[4] === "ENT" && x[2] === "ENT"), JSON.stringify(rowsOf(r)));
  // one doctor
  const rk: any = await answerHospital("specialisation of dr rajeev kumar", ctx);
  ok("one doctor with a postgraduate qualification: his specialisation", rk?.summary === "Dr. Rajeev Kumar's specialisation is Medicine (qualification DNB(MEDICINE)).", rk?.summary);
  const mb: any = await answerHospital(`specialisation of dr ${mbbsOnly[0].name.toLowerCase()}`, ctx);
  ok("one doctor with MBBS alone: no specialisation (known, not 'not recorded')", /has no specialisation on record: the qualification is MBBS alone\./.test(mb?.summary ?? ""), mb?.summary);
  const un: any = await answerHospital(`specialisation of dr ${noQual[0].name.toLowerCase()}`, ctx);
  ok("one doctor whose qualification is not recorded: not known", /is not recorded, so the specialisation is not known\./.test(un?.summary ?? "") && un?.card.status?.tone === "unknown", un?.summary);
  const pr: any = await answerHospital("specialisation of dr priyanka roy", ctx);
  ok("one doctor with a bare MS: the subject is not stated", /does not state a subject, so the specialisation is not known\./.test(pr?.summary ?? ""), pr?.summary);
  ok("an ambiguous name asks which doctor (the question is kept)", !!(await answerHospital("specialisation of dr kumar", ctx))?.ask);
  // the qualification of one doctor, and yes / no
  ok("the qualification of one doctor", (await answerHospital("qualification of dr rajeev kumar", ctx))?.summary === "Dr. Rajeev Kumar's qualification is DNB(MEDICINE).");
  ok("'is dr rajeev kumar a DNB doctor': Yes (the limit of step 56a is closed)", (await answerHospital("is dr rajeev kumar a DNB doctor", ctx))?.summary === "Yes: Dr. Rajeev Kumar holds DNB (qualification DNB(MEDICINE)).");
  const no: any = await answerHospital("is dr dipak singh a DNB doctor", ctx);
  ok("...and No, with what he holds", no?.summary === "No: Dr. Dipak Singh's qualification is MD(MEDICINE), not DNB." && no.card.status.tone === "closed", no?.summary);
  ok("DrNB is a different degree: No, and it says so", /^No: Dr\. A K Sahay's qualification is MCH & DRNB PLASTIC SURGERY, not DNB\. DrNB is the National Board's super-specialty degree: a different qualification\.$/.test((await answerHospital("is dr a k sahay a DNB doctor", ctx))?.summary ?? ""));
  ok("a doctor whose qualification is not recorded: 'I cannot say', never No", /cannot say whether he or she holds DNB\./.test((await answerHospital(`is dr ${noQual[0].name.toLowerCase()} a DNB doctor`, ctx))?.summary ?? ""));
  // the list of the non-permanent doctors follows the same rule
  const np: any = await answerHospital("list the contractual doctors", ctx);
  const npRow = (name: string) => (np.card.table.rows as string[][]).find((row) => row[0] === `Dr. ${name}`);
  ok("contractual doctors: MBBS alone = 'none (MBBS only)' (known), not 'not recorded yet'", npRow("Daisy Bhengra")?.[2] === "none (MBBS only)" && npRow("Titas Chakraborty")?.[2] === "none (MBBS only)", JSON.stringify(npRow("Daisy Bhengra")));
  ok("...no qualification recorded = still 'not recorded yet'; a recorded specialization is untouched", npRow("Ajay Varghese")?.[2] === "not recorded yet" && npRow("Abhishek Mandal")?.[2] === "Surgery");
  ok("...and the list says what 'none (MBBS only)' means", (np.card.notes ?? []).some((l: string) => l.includes("a doctor with MBBS alone has no specialization")));

  // ---- the CLEAN ANSWER FIRST (step 57b, owner 26 Oct 2026: "DNB(MEDICINE) at the very first, bold and bigger; a clean green Yes or a red No; the rest short"). The headline is the one statement; the title is a caption; one sentence; bullets only where they matter.
  const headOf = (x: any) => x?.card.headline as { text: string; tone: string } | undefined;
  ok("specialisation of dr rajeev kumar: the headline is DNB(MEDICINE), one sentence, one bullet (the department), the rule folded", headOf(rk)?.text === "DNB(MEDICINE)" && headOf(rk)?.tone === "info" && rk.card.status.text === "Dr. Rajeev Kumar's specialisation is Medicine." && JSON.stringify(rk.card.lines) === '["Department: Medicine."]' && rk.card.details.length === 1 && rk.card.details[0].summary === "How is a specialisation decided?", JSON.stringify([rk.card.headline, rk.card.status, rk.card.lines]));
  ok("...the plain-text answer (summary) is unchanged", rk.summary === "Dr. Rajeev Kumar's specialisation is Medicine (qualification DNB(MEDICINE)).");
  const yes: any = await answerHospital("is dr rajeev kumar a DNB doctor", ctx);
  ok("'is dr rajeev kumar a DNB doctor': the headline is a green Yes (tone yes), nothing before it", headOf(yes)?.text === "Yes" && headOf(yes)?.tone === "yes" && yes.summary.startsWith("Yes: "), JSON.stringify(yes.card.headline));
  const nope: any = await answerHospital("is dr dipak singh a DNB doctor", ctx);
  ok("'is dr dipak singh a DNB doctor': the headline is a red No (tone no)", headOf(nope)?.text === "No" && headOf(nope)?.tone === "no", JSON.stringify(nope.card.headline));
  ok("a doctor whose qualification is not recorded: 'Not known' (amber), never a No", headOf(await answerHospital(`is dr ${noQual[0].name.toLowerCase()} a DNB doctor`, ctx))?.text === "Not known" && headOf(await answerHospital(`is dr ${noQual[0].name.toLowerCase()} a DNB doctor`, ctx))?.tone === "unknown");
  ok("the other single-doctor headlines: MBBS alone 'No specialisation', a bare MS 'Not stated', not recorded 'Not known'; the qualification itself for 'qualification of dr X'", headOf(mb)?.text === "No specialisation" && headOf(pr)?.text === "Not stated" && headOf(pr)?.tone === "unknown" && headOf(un)?.text === "Not known" && headOf(await answerHospital("qualification of dr rajeev kumar", ctx))?.text === "DNB(MEDICINE)");
  r = await answerHospital("list of DNB doctors", ctx);
  ok("list of DNB doctors: the headline is the doctor, one sentence with the gap, only the DrNB bullet, the names folded", headOf(r)?.text === "Dr. Rajeev Kumar" && r.card.status.text === `The only doctor recorded with DNB. The qualification is not recorded for ${noQual.length} of the ${pool.length} doctors, so this list may be incomplete.` && (r.card.lines ?? []).length === 1 && /holds DrNB/.test(r.card.lines[0]) && (r.card.details ?? []).length === 1, JSON.stringify([r.card.headline, r.card.status.text]));
  r = await answerHospital("list of MD doctors", ctx);
  ok("list of MD doctors: the headline is the count", headOf(r)?.text === `${count(/\bMD\b/)} doctors` && r.card.status.text.startsWith("Recorded with MD."), JSON.stringify(r.card.headline));
  ok("doctors with DM: the headline is None (amber)", headOf(await answerHospital("doctors with DM", ctx))?.text === "None" && headOf(await answerHospital("doctors with DM", ctx))?.tone === "unknown");
  ok("the doctors with their degrees: the headline is the count of those recorded", headOf(await answerHospital("list the doctors with their degrees", ctx))?.text === `${recorded.length} doctors`);
  ok("the specialisations: the headline is the number of specialisations", headOf(await answerHospital("the specialisation of doctors in dsp", ctx))?.text === `${specs.size} specialisations`);
  // an ordinary OPD verdict gets the big Yes / No too (done() does it for every open / closed answer)
  const ask = (q: string, iso: string) => answerHospital(q, { now: DateTime.fromISO(iso, { zone: "Asia/Kolkata" }), holidaysOn: async () => ({ yearLoaded: true, hits: [] }) } as never);
  const opd: any = await ask("is the opd open on sunday", "2026-10-26T11:00:00");
  ok("an OPD verdict: a big red No or green Yes first (tone from the verdict), the text unchanged", !!headOf(opd) && ["yes", "no"].includes(headOf(opd)!.tone) && /^(Yes|No): /.test(opd.card.status.text), JSON.stringify([opd?.card.headline, opd?.card.status]));
  ok("an answer that is not a verdict has no Yes / No headline (a list of doctors of a department)", headOf(await answerHospital("list of ent doctors", ctx)) === undefined);

  // ---- what must NOT be taken
  for (const q of ["list of doctors", "how many doctors are there", "list of dnb executives with nic mail", "ms word circular", "mediclaim for dnb doctors", "list of MBBS doctors with mobile number", "retired DNB doctors", "doctors degrees mediclaim circular", "list of employees with their degrees", "specialisation policy circular", "the specialisation of employees", "specialisation of doctors mediclaim"]) ok(`not the hospital qualification list: "${q}"`, !/^Doctors (with|and their)/.test((await answerHospital(q, ctx))?.card.title ?? ""), (await answerHospital(q, ctx))?.card.title);
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

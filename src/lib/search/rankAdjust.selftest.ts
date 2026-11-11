// src/lib/search/rankAdjust.selftest.ts
//
// Audience / population ranking. The pool below is REALISTIC: real archive headlines, a mix of contractor and
// regular-employee documents, and holiday lists flagged fromHeadlineEmbedding (that is how the real search
// returns them). An earlier version of this test used a one-item pool and so could not notice that the audience
// rule hid the only correct circular for GPAIS / wage / biometric questions.
import { applyRankAdjustments, type RankItem } from "./rankAdjust";

let failed = 0;
let passed = 0;
function check(condition: boolean, msg: string) {
  if (condition) passed++;
  else {
    failed++;
    console.error(`FAIL: ${msg}`);
  }
}

const base: RankItem[] = [
  { id: 21, type: "circular", headline: "Notice for Contractor Workers - Revised GPAIS Premium Amount w.e.f 01.01.2025", matchPercentage: 0 },
  { id: 82, type: "circular", headline: "Notice for Contract Workers - Daily Rate of Wages w.e.f 01.01.2024 (excluding Non-Works)", matchPercentage: 0 },
  { id: 26, type: "circular", headline: "Notice - Implementation of Biometric Attendance System for Contractor Workers", matchPercentage: 0 },
  { id: 22, type: "circular", headline: "CIRCULAR - HOLIDAYS AND LEAVES FOR CONTRACTOR WORKERS IN DSP -2025", matchPercentage: 0, fromHeadlineEmbedding: true },
  { id: 30, type: "circular", headline: "Circular - Holiday list for the year 2025", matchPercentage: 0, fromHeadlineEmbedding: true },
  { id: 31, type: "holiday", headline: "Bhatridwitiya - reclassification (2025)", matchPercentage: 0 },
  { id: 13, type: "circular", headline: "Circular - Gate Pass for the year 2024", matchPercentage: 0 },
  { id: 50, type: "circular", headline: "Circular - Higher Education Sponsorship Scheme", matchPercentage: 0 },
];

// Match percentages are PER QUERY, as the real search gives them: the documents that answer the question score
// high, the rest score low. (Scores for the same document differ a lot between questions.)
const run = (q: string, scores: Record<number, number>): RankItem[] =>
  applyRankAdjustments(q, base.map((x) => ({ ...x, matchPercentage: scores[x.id] ?? 55 })));
const ids = (r: RankItem[]) => r.map((x) => x.id);
const top = (r: RankItem[]) => r[0]?.id;

console.log("Running rankAdjust selftest...");

// A. Contractor-only topics must still FIND their circular although the question never says "contractor".
for (const [q, id, other] of [
  ["GPAIS premium", 21, { 21: 96, 82: 70 }],
  ["revised GPAIS premium amount", 21, { 21: 96 }],
  ["daily rate of wages w.e.f 01.01.2024", 82, { 82: 94, 21: 66 }],
  ["minimum wages", 82, { 82: 88, 21: 66 }],
  ["biometric attendance system", 26, { 26: 92, 13: 70 }],
] as Array<[string, number, Record<number, number>]>) {
  const r = run(q, other);
  check(ids(r).includes(id), `"${q}": the contractor circular ${id} must stay in the results (it is the only correct answer)`);
  check(top(r) === id, `"${q}": circular ${id} must stay on top (got ${ids(r).join(",")})`);
}

// B. Short forms of "contractor" in the question count as asking about contractors.
for (const q of ["CW holiday list 2025", "labour holidays 2025", "workers holidays and leaves for 2025", "contractual workers holidays 2025"]) {
  const r = run(q, { 22: 88, 30: 88, 31: 80 });
  check(ids(r).includes(22), `"${q}": the contractor holiday circular (a headline-embedded holiday document) must be kept`);
  check(!ids(r).includes(31) && !ids(r).includes(30), `"${q}": regular-employee holiday documents must not answer a contractor question`);
}

// C. Neutral holiday question: the regular employee list ranks above the contractor list; the latter stays visible.
{
  const r = run("holiday list 2025", { 30: 88, 22: 88, 31: 80 });
  const iEmp = ids(r).indexOf(30);
  const iCw = ids(r).indexOf(22);
  check(iEmp >= 0 && iCw >= 0 && iEmp < iCw, 'Neutral "holiday list 2025": employee list must outrank the contractor list and the contractor list stay visible');
}

// D. Explicit employee wording: contractor circulars go when something else remains...
{
  const r = run("executive holiday list 2025", { 30: 88, 22: 88, 31: 80 });
  check(!ids(r).includes(22), '"executive holiday list 2025": contractor circular must be dropped (other results remain)');
  check(ids(r).includes(30), '"executive holiday list 2025": the employee holiday list must remain');
}

// E. ...but never an empty page: if ONLY contractor documents exist, they are shown (demoted).
{
  const only = [{ ...base[0], matchPercentage: 96 }];
  const r = applyRankAdjustments("employee GPAIS", only);
  check(r.length === 1 && r[0].id === 21, '"employee GPAIS": the only GPAIS circular is a contractor one; it must still be shown, not an empty page');
  check(r[0].matchPercentage < 96, '"employee GPAIS": it must be demoted');
}

// F. Words such as "officers" in a question about a contractor-only scheme must not hide it.
{
  const r = run("nodal officers GPAIS premium", { 21: 90 });
  check(ids(r).includes(21), '"nodal officers GPAIS premium": the GPAIS circular is the only one that answers; it must remain');
}

// G. Contractor wording keeps contractor circulars on top.
check(top(run("contractor workers daily rate of wages", { 82: 94, 21: 66 })) === 82, "contractor wording: wage circular on top");
check(top(run("contract workers biometric attendance", { 26: 92, 82: 60 })) === 26, "contractor wording: biometric circular first");

// H. A correct contractor answer outranks an unrelated circular for a neutral query.
{
  const r = run("revised GPAIS premium amount", { 21: 90, 50: 62 });
  check(ids(r).indexOf(21) < ids(r).indexOf(50) || !ids(r).includes(50), "GPAIS circular outranks the unrelated circular");
}

console.log(`rankAdjust selftest: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

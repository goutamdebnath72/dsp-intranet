// scripts/circular-battery.mjs
//
// READ-ONLY. Measures the REAL circular search (the same HTTP endpoint the
// omnibar uses, semantic mode) against questions whose correct answers were
// verified by reading the actual circular PDFs. Writes nothing to the
// database and changes no app code.
//
// HOW TO RUN (two terminals):
//   1) Terminal A, in the project root (a normal dev server, no special switch):
//        npm run dev
//   2) Terminal B, same folder, after "Ready" appears in terminal A:
//        node scripts/circular-battery.mjs
//   By default every question is sent with ?retrievalOnly=1 (a dev-only hook in the
//   route): it skips the employee/holiday answer paths, so NO model call is made
//   and no Groq tokens are used. Questions that expect a direct (non-circular)
//   answer, marked full:true, run the normal full path instead.
//   Optional:  --base http://localhost:3000   --only A1,B2   --pause 400
//              --full   (send every question down the normal full path; uses tokens)
//
// OUTPUT: a pass/fail line per question, a summary, and a report file
// circular-battery-report.txt (send that file back for analysis).
//
// ID NOTE: ids are circulars.id from YOUR database (verified from your
// Supabase listings). Each case lists the evidence it was built from.

import { writeFileSync } from "fs";

function flag(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = process.argv[i + 1];
  return v && !v.startsWith("--") ? v : def;
}
const BASE = flag("base", "http://localhost:3000");
const ONLY = (flag("only", "") || "").split(",").map((s) => s.trim()).filter(Boolean);
const PAUSE = parseInt(flag("pause", "300"), 10) || 0;
const FULL_ALL = process.argv.includes("--full");

// expect:   circular ids that MUST appear in the results
// ok:       other circular ids that are fine to appear (not counted as noise)
// notAbove: circular ids that may appear but must NOT rank above the best expected one
// forbid:   circular ids that must NOT appear at all
// topIs:    circular id that must be result #1
// expectType / expectAnalytics / expectEmpty / info: see evaluate()
const CASES = [
  // ---- A. Contractor-worker leave: three yearly circulars with IDENTICAL leave rules ----
  { id: "A1", q: "what is the leave policy for contract workers",
    expect: [1, 12, 22], forbid: [26, 21, 73],
    ev: "2022_01, 2023_02, 2024_02: same rules (4 casual + 7 medical days, earned leave 1 per 20 days, festival leave 9/8 days); only holiday dates differ by year" },
  { id: "A2", q: "how many days of casual leave and medical leave do contractor workers get",
    expect: [1, 12, 22], forbid: [26, 21] },
  { id: "A3", q: "holidays and leaves for contractor workers for the year 2025",
    expect: [22], ok: [1, 12], forbid: [26, 21], topIs: 22,
    ev: "2024_02: 'Holidays & Leaves for Contractor Workers for the year 2025', dated 27.12.2024" },
  { id: "A4", q: "holidays and leaves for contractor workers for the year 2024",
    expect: [12], ok: [1, 22], forbid: [26, 21], topIs: 12,
    ev: "2023_02: '... for the year 2024', dated 26.12.2023" },
  { id: "A5", q: "holidays and leaves for contract workers for the year 2023",
    expect: [1], ok: [12, 22], forbid: [26, 21], topIs: 1,
    ev: "2022_01: '... for the year 2023', dated 29.12.2022" },

  // ---- B. Attendance systems ----
  { id: "B1", q: "biometric attendance system for contractor workers",
    expect: [26], forbid: [21], topIs: 26,
    ev: "2024_06: enrolment effective 06 December 2024 for all contract workers" },
  { id: "B2", q: "contactless face recognition attendance for executives",
    expect: [13], ok: [26], topIs: 13,
    ev: "2023_03: from 01.01.2024 attendance of all executives via Contactless Face Recognition and RFID" },
  { id: "B3", q: "from which date will executive attendance be captured through face recognition and RFID card",
    expect: [13], ok: [26], topIs: 13 },

  // ---- C. GPAIS (insurance premium for contractor workers) ----
  { id: "C1", q: "revised GPAIS premium amount for contractor workers",
    expect: [21], topIs: 21,
    ev: "2024_01: 'Revised of GPAIS amount (Mid-term inclusion)', w.e.f. 01.01.2025" },
  { id: "C2", q: "GPAIS mid-term inclusion contractor workers premium",
    expect: [21], topIs: 21 },

  // ---- D. Health check-ups: near-identical circulars that differ only by month ----
  { id: "D1", q: "health check-up of non-executive employees January 2026",
    expect: [37], notAbove: [23, 30], topIs: 37,
    ev: "2025_07: Jan 2026, Room No. 45 (the only circular with Room 45)" },
  { id: "D2", q: "health check-up of non-executive employees December 2024",
    expect: [30], notAbove: [23, 37], topIs: 30,
    ev: "2024_10: Dec 2024 schedule, dated 27.11.2024" },
  { id: "D3", q: "health check-up of non-executive employees January 2025",
    expect: [23], notAbove: [30, 37], topIs: 23,
    ev: "2024_03: Jan 2025 schedule, dated 28.12.2024" },
  { id: "D4", q: "which pathology room should non-executive employees report to for the health check-up in January 2026",
    expect: [37], notAbove: [23, 30] },

  // ---- E. Superseding / corrected circulars ----
  { id: "E1", q: "till when has the SAIL Mediclaim renewal period been extended",
    expect: [43], ok: [48], notAbove: [48], topIs: 43,
    ev: "2026_03 (20.08.2026): extended till 31.08.2026; 2026_08 (11-08-2026) only says up to 20-08-2026" },
  { id: "E2", q: "SAIL Mediclaim scheme 2026-27 renewal",
    expect: [43, 48] },
  { id: "E3", q: "what is the amount of the gift card for employees",
    expect: [49, 51], notAbove: [51], topIs: 49,
    ev: "AFTER TITLE FIX: id 49 = the corrigendum (2026_09: Rs.15,000 is to be read as Rs.14,999); id 51 = the original online-option circular (2026_10, Rs.15,000)" },
  { id: "E4", q: "online option for gift card Rs 15000",
    expect: [51], ok: [49] },

  // ---- F. Merit scholarship (one circular in three languages) ----
  { id: "F1", q: "last date for submission of merit scholarship award application contract workers",
    expect: [46], ok: [44, 45], notAbove: [10], topIs: 46,
    ev: "2026_06/07: last date extended to 31 August 2026; ids 44 (Bengali) and 45 (Hindi) are the same circular in other languages" },
  { id: "F2", q: "merit award scheme 2026 amendment contract workers",
    expect: [46], ok: [44, 45], notAbove: [10] },

  // ---- G. Provident fund ----
  { id: "G1", q: "pre-mature repayment of refundable PF loan",
    expect: [42], topIs: 42,
    ev: "2026_02: DSP PF Trust circular dated 14/08/2026" },
  { id: "G2", q: "PF contribution for junior officers of 2008 and 2010 batch",
    expect: [19], notAbove: [42], topIs: 19,
    ev: "2023_09: dated 13.12.2023" },

  // ---- H. Sports and events ----
  { id: "H1", q: "football team selection trial 2024",
    expect: [27], ok: [28], notAbove: [8, 9], topIs: 27,
    ev: "2024_07: trial on 5 December 2024 at ASP Stadium; Championship at IISCO Burnpur 15-20.12.2024" },
  { id: "H2", q: "football coach credentials NIS certificate holder national player",
    expect: [9, 28], ok: [32], notAbove: [32],
    ev: "2022_09 and 2024_08 are the football coach notices; 2025_02 (now id 32) is the VOLLEYBALL coach circular with the same list" },
  { id: "H3", q: "volleyball championship at Alloy Steels Plant Durgapur",
    expect: [32], topIs: 32,
    ev: "AFTER TITLE FIX: id 32 = 2025_02: SPSB Volleyball Championship at Alloy Steels Plant, Durgapur, 15-17.01.2026 (only mention of Alloy Steels)" },
  { id: "H4", q: "SAIL Swarna Jayanti volleyball championship Bhilai",
    expect: [2], topIs: 2,
    ev: "2022_02: Bhilai, 18.01.2023 to 21.01.2023 (only mention of Bhilai)" },
  { id: "H5", q: "inter department night volleyball tournament",
    expect: [18], notAbove: [2, 33], topIs: 18,
    ev: "2023_08: starts 19 December 2023, entries by 18 December" },
  { id: "H6", q: "table tennis team selection trial",
    expect: [25], ok: [32], topIs: 25,
    ev: "2024_05: SAIL Table Tennis Championship 2024, trial 12.12.2024 (only table tennis circular in the zip)" },
  { id: "H7", q: "badminton championship selection of players",
    expect: [14], topIs: 14,
    ev: "2023_04: SAIL Badminton Championship 2023-24 at Bokaro, trial 26 December 2023" },
  { id: "H8", q: "SAIL Foundation Day 5 km walk run",
    expect: [33], ok: [39], topIs: 33,
    ev: "AFTER TITLE FIX: id 33 = 2025_03: '5Km Walk/Run' on 24 January 2026" },
  { id: "H9", q: "SAIL Gaurav Diwas virtual programme",
    expect: [39], ok: [33], topIs: 39,
    ev: "2025_09: Gaurav Diwas (only mention)" },
  { id: "H10", q: "inter department table tennis tournament 2026-27", info: true,
    ev: "NOT IN THE CORPUS: the circular titled 'Inter Department TT 2026-27' was never uploaded (its title had been attached to the volleyball PDF). Id 25 (DSP table tennis team, 2024) is the nearest wrong match" },

  // ---- I. Single-circular topics ----
  { id: "I1", q: "zero tolerance safety rules consequence management",
    expect: [29], topIs: 29, ev: "2024_09 (only zero-tolerance circular)" },
  { id: "I2", q: "LinkedIn membership for SAIL executives",
    expect: [11], topIs: 11, ev: "2023_01: apply on or before 03 January 2024" },
  { id: "I3", q: "how do employees apply for leave through the online leave management system",
    expect: [4], topIs: 4, ev: "2022_04: LMS, all leave online from 01.01.2023" },
  { id: "I4", q: "out pass number 13 blue colour from January 2024",
    expect: [16], topIs: 16, ev: "2023_06: Blue passes 01.01.2024 to 31.03.2024; Pink invalid" },
  { id: "I5", q: "scheme for sponsoring executives for higher specialized education",
    expect: [3], topIs: 3, ev: "2022_03" },
  { id: "I6", q: "sub-letting of company quarters by ex-employees retention of accommodation",
    expect: [6], topIs: 6, ev: "2022_06: Rules for Retention of Company Accommodation by Ex-employees" },
  { id: "I7", q: "JO written examination cancelled re-examination",
    expect: [7], topIs: 7, ev: "2022_07: exam of 06.11.2022 cancelled at all 14 centres" },
  { id: "I8", q: "motivational award schemes uniform to DSP and ISP",
    expect: [10], notAbove: [44, 45, 46], topIs: 10, ev: "2022_10" },
  { id: "I9", q: "Hindi teaching scheme courses",
    expect: [20, 31], ev: "AFTER TITLE FIX: id 20 = 2023_10 DSP Hindi Teaching Scheme (courses from 2 Jan 2024); id 31 = 2025_01 (courses Jan-May 2026). Both are right answers" },
  { id: "I10", q: "declaration Format B for SIR electoral roll",
    expect: [38], ok: [35], topIs: 38, ev: "2025_08: Special Intensive Revision (only circular with that phrase)" },
  { id: "I11", q: "list of nodal officers for submission of declaration",
    expect: [35], ok: [38], topIs: 35, ev: "2025_05" },
  { id: "I12", q: "ICVL MD and CEO Mozambique application",
    expect: [53], topIs: 53, ev: "2026_01: only circular mentioning Mozambique" },

  // ---- J. Quoted (exact phrase) searches ----
  { id: "J1", q: "\"Format B\"", expect: [35, 38] },
  { id: "J2", q: "\"RFID\"", expect: [13, 26], ev: "the literal word RFID appears 8 times in both the contactless-attendance circular (13) and the biometric-attendance notice (26)" },

  // ---- K. Holiday channel / employee channel (must NOT be answered from contractor circulars) ----
  { id: "K1", q: "why were there two extra festival holidays in 2023",
    expectType: "holiday", notAbove: [1, 12, 22],
    ev: "answer lives in holiday_policy_chunks (reclassification notes), not in any contractor circular" },
  { id: "K2", q: "list of holidays 2026", expectAnalytics: true },
  { id: "K3", q: "how many executives are there in C&IT", expectAnalytics: true },

  // ---- M. Holiday-topic questions: REGRESSION GUARD for any change to the holiday results ----
  { id: "M1", q: "how does compensatory off work", expectType: "holiday" },
  { id: "M2", q: "what happens if my restricted holiday falls on my weekly off", expectType: "holiday" },
  { id: "M3", q: "what is the deadline to choose my restricted holidays for 2024", expectType: "holiday" },
  { id: "M4", q: "list of public holidays announced by DSP", expectAny: [70, 71, 72, 73, 74, 75, 76, 77],
    ev: "the 8 holiday-list circulars have no body text; found by headline embedding only" },
  { id: "M5", q: "annual restricted and festival holiday notification", expectAny: [70, 71, 72, 73, 74, 75, 76, 77] },
  { id: "M6", q: "when does the new year's holiday list get published", expectAny: [70, 71, 72, 73, 74, 75, 76, 77] },
  { id: "M7", q: "why is Ram Navami an extra holiday in 2024", expectType: "holiday" },

  // ---- L. Not in the corpus: the system should not present a confident wrong answer ----
  { id: "L1", q: "chocolate cake recipe", expectEmpty: true },
  { id: "L2", q: "minimum daily rate of wages for contract workers from 1 January 2024", info: true,
    ev: "that notice (2023_07) was deleted from the DB; the contractor leave circulars are the nearest wrong matches" },
  { id: "L3", q: "Armed Forces Flag Day contribution",
    expect: [40], topIs: 40, ev: "AFTER TITLE FIX: id 40 = 2025_10 Commemoration of Armed Forces Flag Day (Circular Sl. No. 2025/47)" },

  // ---- N. Added after the corpus audit: documents that were hidden behind wrong titles ----
  { id: "N1", q: "promotion order executives promoted w.e.f. 31.12.2025",
    expect: [34], topIs: 34, ev: "AFTER TITLE FIX: id 34 = 2025_04, 8 executives promoted (e.g. Asst. Manager to Dy. Manager) w.e.f. 31-12-2025" },
  { id: "N2", q: "DSP Hindi Shikshan Yojana Prabodh Praveen Pragya examination incentive",
    expect: [20], ok: [31], ev: "AFTER TITLE FIX: id 20 = 2023_10 (Prabodh / Praveen / Pragya / Parangat courses and cash incentives)" },
  { id: "N3", q: "ESS entry of perks and allowances last date extended non-executives",
    expect: [55], ev: "id 55: ESS entry for perks/allowances, ref .../ALLOWANCE_ENTRY/2026/1352 (PDF not in the test zip)" },
  { id: "N4", q: "closure of tunnel gate NSPCL",
    expect: [54], topIs: 54, ev: "id 54: ref .../CLOSURE_TUNNEL/2026/1548 (PDF not in the test zip)" },
  { id: "N5", q: "vacancy joint industrial adviser Ministry of Steel",
    expect: [60], topIs: 60, ev: "id 60: Ministry of Steel vacancy circular, F. No. A-12011/1/2025-ESTT (PDF not in the test zip)" },
];

/* ------------------------------ runner ------------------------------ */
async function ask(q, full) {
  const url = `${BASE}/api/ai-search?q=${encodeURIComponent(q)}&mode=semantic${full || FULL_ALL ? "" : "&retrievalOnly=1"}`;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 90000);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { status: r.status, json, text };
  } finally { clearTimeout(t); }
}

function normalize(res) {
  const j = res.json;
  if (res.status !== 200 || j === null) return { error: `HTTP ${res.status}`, rows: [], analytics: null };
  if (Array.isArray(j)) {
    return { rows: j.map((r, i) => ({ pos: i + 1, type: r.type, id: Number(r.id), pct: r.matchPercentage ?? null, headline: String(r.headline || "").slice(0, 70) })), analytics: null };
  }
  if (j.analytics) return { rows: [], analytics: j.analytics.kind || "answer", source: j.analytics.source || "?", text: String(j.analytics.answer || j.analytics.title || "").replace(/\s+/g, " ").slice(0, 150) };
  if (Array.isArray(j.results)) return normalize({ status: 200, json: j.results });
  return { rows: [], analytics: null };
}

function evaluate(c, n) {
  if (n.error) return { status: "ERROR", notes: [n.error], noise: 0, rank: null };
  const rows = n.rows;
  const circ = rows.filter((r) => r.type === "circular");
  const posOf = (id) => { const r = circ.find((x) => x.id === id); return r ? r.pos : null; };
  const notes = [];
  const expect = c.expect || [];
  const ok = new Set([...(c.ok || []), ...expect]);
  const expectedPos = expect.map(posOf).filter((p) => p !== null);
  const best = expectedPos.length ? Math.min(...expectedPos) : null;
  const noise = circ.filter((r) => !ok.has(r.id)).length + rows.filter((r) => r.type === "announcement").length;

  if (c.info) return { status: "INFO", notes: [], noise, rank: best };
  if (c.expectAnalytics) return n.analytics ? { status: "PASS", notes: [`answered as ${n.analytics}`], noise: 0, rank: null } : { status: "FAIL", notes: ["expected a direct (non-circular) answer, got a circular list"], noise: rows.length, rank: null };
  if (c.expectEmpty) return rows.length === 0 && !n.analytics ? { status: "PASS", notes: [], noise: 0, rank: null } : { status: "FAIL", notes: [`expected nothing, got ${rows.length} result(s)${n.analytics ? " + an answer card" : ""}`], noise: rows.length, rank: null };

  if (c.expectAny) {
    if (n.analytics) return { status: "PASS", notes: [`answered directly (${n.analytics})`], noise: 0, rank: null };
    const hit = c.expectAny.map(posOf).filter((p) => p !== null);
    const okAny = new Set([...c.expectAny, ...(c.ok || [])]);
    const noiseAny = circ.filter((r) => !okAny.has(r.id)).length;
    return hit.length ? { status: "PASS", notes: [], noise: noiseAny, rank: Math.min(...hit) } : { status: "FAIL", notes: [`none of circulars ${c.expectAny.join("/")} was returned`], noise: noiseAny, rank: null };
  }
  for (const id of expect) if (posOf(id) === null) notes.push(`missing circular ${id}`);
  for (const id of c.forbid || []) if (posOf(id) !== null) notes.push(`forbidden circular ${id} is present at #${posOf(id)}`);
  for (const id of (c.expectType ? [] : c.notAbove || [])) {
    const p = posOf(id);
    if (p !== null && (best === null || p < best)) notes.push(`circular ${id} (#${p}) ranks above the correct answer${best ? ` (#${best})` : ""}`);
  }
  if (c.topIs) {
    const r0 = rows[0];
    if (!(r0 && r0.type === "circular" && r0.id === c.topIs)) notes.push(`expected circular ${c.topIs} at #1, got ${r0 ? `${r0.type} ${r0.id}` : "nothing"}`);
  }
  if (c.expectType) {
    const first = rows.find((r) => r.type === c.expectType);
    if (!first) notes.push(`no '${c.expectType}' result returned`);
    else for (const id of c.notAbove || []) { const p = posOf(id); if (p !== null && p < first.pos) notes.push(`circular ${id} ranks above the ${c.expectType} answer`); }
  }
  return { status: notes.length ? "FAIL" : "PASS", notes, noise, rank: best };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const todo = CASES.filter((c) => !ONLY.length || ONLY.includes(c.id));
const lines = [];
const out = (s) => { console.log(s); lines.push(s); };
let pass = 0, fail = 0, err = 0, info = 0, noiseSum = 0, scored = 0, top1 = 0, withTop = 0;

out(`Circular battery — ${todo.length} questions against ${BASE}  (${new Date().toISOString()})`);
out("");
for (const c of todo) {
  let n, ev;
  try { n = normalize(await ask(c.q, !!c.full || !!c.expectAnalytics)); ev = evaluate(c, n); }
  catch (e) { n = { rows: [], analytics: null, source: "", text: "" }; ev = { status: "ERROR", notes: [String(e.message || e)], noise: 0, rank: null }; }
  if (ev.status === "PASS") pass++; else if (ev.status === "FAIL") fail++; else if (ev.status === "ERROR") err++; else info++;
  if (ev.status === "PASS" || ev.status === "FAIL") { noiseSum += ev.noise; scored++; }
  if (c.topIs) { withTop++; const r0 = n.rows[0]; if (r0 && r0.type === "circular" && r0.id === c.topIs) top1++; }
  out(`${ev.status.padEnd(5)} ${c.id.padEnd(4)} noise=${String(ev.noise).padEnd(2)} ${c.q}`);
  for (const note of ev.notes) out(`        - ${note}`);
  if (n.analytics) out(`        = answered directly (kind=${n.analytics}, engine=${n.source}) "${n.text}"`);
  for (const r of n.rows) out(`        #${r.pos} ${r.type}-${r.id}  ${r.pct ?? "?"}%  ${r.headline}`);
  if (c.ev) out(`        evidence: ${c.ev}`);
  await sleep(PAUSE);
}
out("");
out("SUMMARY");
out(`  passed ${pass}   failed ${fail}   errors ${err}   info-only ${info}`);
out(`  rank-1 correct: ${top1} of ${withTop} questions that name a required #1`);
out(`  average noise (results that should not be there) per scored question: ${scored ? (noiseSum / scored).toFixed(2) : "n/a"}`);
writeFileSync("circular-battery-report.txt", lines.join("\n") + "\n");
console.log("\nReport written to circular-battery-report.txt");

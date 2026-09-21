// scripts/probe-parser.mjs
//
// Parser-intent regression for answerAnalytics / parseAnalytics, exercised
// through the LIVE endpoint (full stack). It asserts the CLASSIFICATION only —
// analytics vs hand-off — not the counts:
//
//   response is  { analytics: {...} }        -> ANALYTICS  (parser claimed it)
//   response is  [ ... ]  (array, any length) -> SEARCH     (parser handed off)
//
// Two directions, both must hold:
//   expect:"analytics"  the query IS a people/headcount/breakdown/name/unknown-
//                       dept question -> parser must own it.
//   expect:"search"     the query is conversational/topical -> parser must hand
//                       off to circular search (the defect family: a stray
//                       "how much / in <place>" must NOT be hijacked).
//
// PREREQUISITE: npm run dev in another terminal.
// RUN:  node scripts/probe-parser.mjs
//       BASE_URL=http://localhost:3000 node scripts/probe-parser.mjs
// EXIT: 0 if all pass, 1 otherwise.

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const MODE = "semantic";

const CASES = [
  // ---- MUST be analytics (legit people questions — no regression allowed) ----
  { q: "how many AGM",                     expect: "analytics" },
  { q: "how many GM in C&IT",              expect: "analytics" },
  { q: "list AGM in C&IT",                 expect: "analytics" },
  { q: "how many executives",              expect: "analytics" },
  { q: "how many non-executives",          expect: "analytics" },
  { q: "total employees",                  expect: "analytics" },
  { q: "employees in C&IT",                expect: "analytics" },
  { q: "how many in C&IT",                 expect: "analytics" },
  { q: "designation breakdown",            expect: "analytics" },
  { q: 'how many "goutam"',                expect: "analytics" }, // exact name
  { q: "how many goutam",                  expect: "analytics" }, // fuzzy name
  { q: "how many employees in Zzqwx",      expect: "analytics" }, // unknown dept -> pending

  // ---- MUST be analytics: verbose-but-genuine + name×dept ----
  { q: "give me the AGM list for C&IT",    expect: "analytics" }, // preamble words
  { q: "how many S-11",                    expect: "analytics" }, // S-grade surface strip
  { q: "how many people named ghosh in C&IT", expect: "analytics" }, // name + dept split (#3)

  // ---- MUST hand off to search (the defect family) ----
  { q: "How much deposit is required to keep a 2-bedroom quarter in Delhi after retirement?", expect: "search" },
  { q: "leave policy",                     expect: "search" },
  { q: "c&it attendance",                  expect: "search" },
  { q: "how much bonus in EMD",            expect: "search" }, // topic in real dept
  { q: "what training is available in EMD",expect: "search" },
  { q: "mediclaim policy",                 expect: "search" },
  { q: "zero tolerance safety rules",      expect: "search" },
  // conversational sentences that merely contain HR vocabulary (the #2 hijacks)
  { q: "who is eligible for the merit award scheme for contract workers", expect: "search" },
  { q: "gift card option for employees",   expect: "search" },
  { q: "health checkup for non-executive employees", expect: "search" },
];

function url(q) {
  return `${BASE_URL}/api/ai-search?q=${encodeURIComponent(q)}&mode=${MODE}`;
}
function classify(data) {
  if (Array.isArray(data)) return { type: "search", detail: `${data.length} results` };
  if (data && typeof data === "object") {
    if ("analytics" in data) return { type: "analytics", detail: data.analytics?.kind ?? "?" };
    if ("results" in data || "synthesis" in data) return { type: "intellectual", detail: "" };
  }
  return { type: "unknown", detail: "" };
}

async function run() {
  console.log(`\nParser-intent battery — target ${BASE_URL}\n${"=".repeat(64)}`);
  let pass = 0, fail = 0;
  const failures = [];
  for (const c of CASES) {
    let data, ok = true;
    try {
      const res = await fetch(url(c.q));
      if (!res.ok) ok = false;
      else data = await res.json();
    } catch { ok = false; }
    if (!ok) {
      fail++; failures.push(`${c.q}  -> HTTP error (is 'npm run dev' up?)`);
      console.log(`FAIL  ${JSON.stringify(c.q)}  HTTP error`);
      continue;
    }
    const got = classify(data);
    const good = got.type === c.expect;
    if (good) { pass++; console.log(`PASS  [${c.expect.padEnd(9)}] ${JSON.stringify(c.q)}  (${got.type}: ${got.detail})`); }
    else {
      fail++;
      failures.push(`${c.q}  -> expected ${c.expect}, got ${got.type} (${got.detail})`);
      console.log(`FAIL  [want ${c.expect.padEnd(6)}] ${JSON.stringify(c.q)}  got ${got.type} (${got.detail})`);
    }
  }
  console.log("=".repeat(64));
  console.log(`Total: ${CASES.length}   Pass: ${pass}   Fail: ${fail}\n`);
  if (failures.length) { console.log("FAILURES:"); for (const f of failures) console.log("  - " + f); console.log(""); }
  process.exit(fail === 0 ? 0 : 1);
}
run();

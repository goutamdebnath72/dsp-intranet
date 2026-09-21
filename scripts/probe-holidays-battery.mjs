// scripts/probe-holidays-battery.mjs
//
// Stage 2 regression battery for queryHolidays / parseHolidayIntent, exercised
// through the LIVE endpoint (full stack), same pattern as probe-parser.mjs and
// test-search.mjs. Two kinds of assertion:
//
//   expect: "analytics" | "search"   -- classification (did the holiday
//     worker claim it, or did it correctly hand off to circular search?)
//   expectContains: [...]            -- substrings that must all appear in
//     data.analytics.answer (only checked when expect === "analytics")
//
// The count-bearing cases are pinned to the REAL numbers from the confirmed
// live-DB probe (2026-09-21): 2026 total=52 (CH=5, FH=13, RH=34),
// 2025 total=50 (CH=5, FH=12, RH=33). If the corpus changes, update these.
//
// A few cases use "this year"/relative phrasing and are noted as
// DATE-DEPENDENT — they assume "this year" == 2026 at run time. If you run
// this after the year rolls over, re-check those specific cases by hand
// instead of trusting a bare FAIL.
//
// PREREQUISITE: npm run dev in another terminal.
// RUN:  node scripts/probe-holidays-battery.mjs
//       BASE_URL=http://localhost:3000 node scripts/probe-holidays-battery.mjs
// EXIT: 0 if all pass, 1 otherwise.

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const MODE = "semantic";

const CASES = [
  // ---- count ----
  { q: "how many holidays in 2026", expect: "analytics", expectContains: ["52"] },
  { q: "how many holidays in 2025", expect: "analytics", expectContains: ["50"] },
  { q: "how many restricted holidays in 2026", expect: "analytics", expectContains: ["34"] },
  { q: "how many festival holidays in 2026", expect: "analytics", expectContains: ["13"] },
  { q: "how many closed holidays in 2026", expect: "analytics", expectContains: ["5"] },
  { q: "how many restricted holidays this year", expect: "analytics", expectContains: ["34"], note: "DATE-DEPENDENT: assumes this-year=2026" },

  // ---- list ----
  { q: "list restricted holidays in 2026", expect: "analytics", expectContains: ["34"] },
  { q: "show 2025 holiday list", expect: "analytics", expectContains: ["50"] },
  { q: "holidays in august", expect: "analytics" }, // count depends on which August rows exist; classification is the point

  // ---- breakdown ----
  { q: "holiday breakdown for 2026", expect: "analytics", expectContains: ["Closed", "Festival", "Restricted"] },
  { q: "breakdown of holidays by type 2026", expect: "analytics", expectContains: ["5", "13", "34"] },

  // ---- compare ----
  { q: "restricted holidays 2026 vs 2025", expect: "analytics", expectContains: ["34", "33"] },
  { q: "holidays 2026 vs 2025", expect: "analytics", expectContains: ["52", "50"] },

  // ---- find-one ----
  { q: "what date is Republic Day?", expect: "analytics", expectContains: ["26 January 2026", "Closed"] },
  { q: "when is Holi 2026?", expect: "analytics", expectContains: ["4 March 2026"] },

  // ---- type-lookup ----
  { q: "is Holi restricted or festival?", expect: "analytics", expectContains: ["Restricted"] },

  // ---- exists ----
  { q: "is 26 January 2026 a holiday?", expect: "analytics", expectContains: ["Yes", "Republic Day"] },

  // ---- future-year guard (handoff §2.2) ----
  { q: "how many holidays in 2027", expect: "search" },
  { q: "is 15 august 2027 a holiday", expect: "search" },

  // ---- hijack guard: contains "holiday" but is NOT a data question ----
  { q: "what is the holiday policy for contract workers", expect: "search" },
  { q: "read the holiday list circular for details on Diwali", expect: "search" },
  { q: "holiday homework guidelines for schools", expect: "search" },
  { q: "how many holidays does he get for maternity leave", expect: "search" },

  // ---- unaffected regression: pre-existing people/circular classification
  // must NOT change now that holiday parsing runs first in parseAnalytics ----
  { q: "how many AGM", expect: "analytics" },
  { q: "total employees", expect: "analytics" },
  { q: "leave policy", expect: "search" },
  { q: "c&it attendance", expect: "search" },
];

function url(q) {
  return `${BASE_URL}/api/ai-search?q=${encodeURIComponent(q)}&mode=${MODE}`;
}

function classify(data) {
  if (Array.isArray(data)) return { type: "search", detail: `${data.length} results` };
  if (data && typeof data === "object") {
    if ("analytics" in data) return { type: "analytics", detail: data.analytics?.answer ?? "?" };
    if ("results" in data || "synthesis" in data) return { type: "intellectual", detail: "" };
  }
  return { type: "unknown", detail: "" };
}

async function run() {
  console.log(`\nHoliday (Stage 2) battery -- target ${BASE_URL}\n${"=".repeat(70)}`);
  let pass = 0, fail = 0;
  const failures = [];

  for (const c of CASES) {
    let data, ok = true;
    try {
      const res = await fetch(url(c.q));
      if (!res.ok) ok = false;
      else data = await res.json();
    } catch {
      ok = false;
    }
    if (!ok) {
      fail++;
      failures.push(`${c.q}  -> HTTP error (is 'npm run dev' up?)`);
      console.log(`FAIL  ${JSON.stringify(c.q)}  HTTP error`);
      continue;
    }

    const got = classify(data);
    const noteTxt = c.note ? `  [${c.note}]` : "";

    if (got.type !== c.expect) {
      fail++;
      failures.push(`${c.q}  -> expected ${c.expect}, got ${got.type} (${got.detail})${noteTxt}`);
      console.log(`FAIL  [want ${c.expect.padEnd(9)}] ${JSON.stringify(c.q)}  got ${got.type} (${got.detail})${noteTxt}`);
      continue;
    }

    if (c.expect === "analytics" && c.expectContains) {
      const answer = got.detail || "";
      const missing = c.expectContains.filter((s) => !answer.includes(s));
      if (missing.length) {
        fail++;
        failures.push(`${c.q}  -> answer missing [${missing.join(", ")}]. Got: "${answer}"${noteTxt}`);
        console.log(`FAIL  [content]  ${JSON.stringify(c.q)}  missing [${missing.join(", ")}] in "${answer}"${noteTxt}`);
        continue;
      }
    }

    pass++;
    console.log(`PASS  [${got.type.padEnd(9)}] ${JSON.stringify(c.q)}  (${got.detail})${noteTxt}`);
  }

  console.log("=".repeat(70));
  console.log(`Total: ${CASES.length}   Pass: ${pass}   Fail: ${fail}\n`);
  if (failures.length) {
    console.log("FAILURES:");
    for (const f of failures) console.log("  - " + f);
    console.log("");
  }
  process.exit(fail === 0 ? 0 : 1);
}

run();

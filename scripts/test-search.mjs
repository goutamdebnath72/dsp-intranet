// scripts/test-search.mjs
//
// Regression test for the Smart Semantic circular search.
// Runs a fixed set of validated queries against the LIVE endpoint and checks
// that each still behaves as it did when we verified it by hand.
//
// PREREQUISITE: the dev server must be running in another terminal:
//     npm run dev
//
// RUN:
//     node scripts/test-search.mjs
//     BASE_URL=http://localhost:3000 node scripts/test-search.mjs   (override host/port)
//
// EXIT CODE: 0 if all hard assertions pass, 1 otherwise (CI-friendly).
//
// WHAT IT ASSERTS (hard, pass/fail):
//   - expectHeadline : some result's headline contains this substring (case-insensitive)
//   - expectEmpty    : the query returns zero results
// WHAT IT REPORTS (soft, informational only — never fails the run):
//   - the rank at which the expected headline was found
//
// Rank is soft on purpose: near-identical circulars (and OCR ties) can reorder
// harmlessly, and a flaky test gets ignored. Presence is the real signal.

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const MODE = "semantic";

// --- The validated query set. Grouped as in our manual test plan. ---
// mark known-OCR-failures with expectEmpty:true — if a future re-OCR FIXES one,
// this test will (correctly) flag it so you update the expectation.
const CASES = [
  // Group A — quoted whole-word (the shipped feature)
  { group: "A", q: '"Rs"',            expectHeadline: "Gift card corrigendum" },
  { group: "A", q: '"ECO Stream"',    expectHeadline: "Motivational Award" },
  { group: "A", q: '"Shram Bhavan"',  expectHeadline: "Daily Rate of Wages" },
  { group: "A", q: '"HR-CLC"',        expectHeadline: "Merit Award Scheme" },

  // Group B — quoted vs unquoted contrast
  { group: "B", q: '"merit"',         expectHeadline: "Merit Award Scheme" },

  // Group C — Indic quoted (substring path)
  { group: "C", q: '"ওল্ড প্ল্যান্ট পার্সোনেল বিল্ডিং"', expectHeadline: "Merit Award Scheme" },
  // Devanagari spelling of a Bengali-only address -> legitimately empty
  { group: "C", q: '"ओल्ड प्लान्ट पार्सोनेल बिल्डिंग"',  expectEmpty: true },

  // Group D — cross-lingual / conversational regression (unquoted)
  { group: "D", q: "टेबल टेनिस टीम के खिलाड़ियों का चयन", expectHeadline: "TABLE TENNIS" },
  { group: "D", q: "How much deposit is required to keep a 2-bedroom quarter in Delhi after retirement?", expectHeadline: "Retention of Company" },
  { group: "D", q: "तेलुगु, तमिल, कन्नड़, मलयालम, मिजो", expectHeadline: "HTS" },

  // Group E — known-bad (OCR corruption). Expected to stay empty until re-OCR.
  { group: "E", q: '"Rs. 20995.30"',  expectEmpty: true },
  { group: "E", q: "20995.30",        expectEmpty: true },
  { group: "E", q: '"तेलुगु, तमिल, कन्नड़, मलयालम, मिजो"', expectEmpty: true },
];

function url(q) {
  return `${BASE_URL}/api/ai-search?q=${encodeURIComponent(q)}&mode=${MODE}`;
}

// The endpoint returns either an array (semantic) or {results:[...]}. Normalize.
function extractResults(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.results)) return data.results;
  return [];
}

function findRank(results, needle) {
  const n = needle.toLowerCase();
  for (let i = 0; i < results.length; i++) {
    const h = (results[i]?.headline || "").toLowerCase();
    if (h.includes(n)) return i + 1; // 1-based
  }
  return -1;
}

async function run() {
  console.log(`\nSmart Semantic regression — target ${BASE_URL}\n${"=".repeat(60)}`);
  let pass = 0, fail = 0;
  const failures = [];

  for (const c of CASES) {
    let results = [];
    let httpOk = true;
    try {
      const res = await fetch(url(c.q));
      if (!res.ok) { httpOk = false; }
      else { results = extractResults(await res.json()); }
    } catch (e) {
      httpOk = false;
    }

    if (!httpOk) {
      fail++;
      failures.push(`[${c.group}] ${c.q}  -> HTTP ERROR (is 'npm run dev' running?)`);
      console.log(`FAIL [${c.group}] ${JSON.stringify(c.q)}  HTTP error`);
      continue;
    }

    if (c.expectEmpty) {
      if (results.length === 0) {
        pass++;
        console.log(`PASS [${c.group}] ${JSON.stringify(c.q)}  -> empty (as expected)`);
      } else {
        fail++;
        const top = results[0]?.headline || "?";
        failures.push(`[${c.group}] ${c.q}  -> expected EMPTY but got ${results.length} (top: "${top}")`);
        console.log(`FAIL [${c.group}] ${JSON.stringify(c.q)}  expected empty, got ${results.length}`);
      }
      continue;
    }

    // expectHeadline
    const rank = findRank(results, c.expectHeadline);
    if (rank > 0) {
      pass++;
      const softRank = rank === 1 ? "rank 1" : `rank ${rank}`;
      console.log(`PASS [${c.group}] ${JSON.stringify(c.q)}  -> "${c.expectHeadline}" found (${softRank}, ${results.length} results)`);
    } else {
      fail++;
      const got = results.length ? results.map(r => `"${r.headline}"`).join(", ") : "(no results)";
      failures.push(`[${c.group}] ${c.q}  -> "${c.expectHeadline}" NOT found. Got: ${got}`);
      console.log(`FAIL [${c.group}] ${JSON.stringify(c.q)}  "${c.expectHeadline}" not found`);
    }
  }

  console.log("=".repeat(60));
  console.log(`Total: ${CASES.length}   Pass: ${pass}   Fail: ${fail}\n`);
  if (failures.length) {
    console.log("FAILURES:");
    for (const f of failures) console.log("  - " + f);
    console.log("");
  }
  process.exit(fail === 0 ? 0 : 1);
}

run();

// scripts/probe-robust.mjs
//
// OBSERVATION harness (not pass/fail) — hits the LIVE endpoint with moderate-to-
// complex queries across every lane plus adversarial and compound cases, and
// prints how the system actually classifies and ranks each, so weak spots show
// up empirically. Read the output and judge; there is no single "correct" for
// the open-ended ones.
//
// Classification by response shape (mode=semantic):
//   { analytics: {...} }  -> ANALYTICS  (kind, count, answer snippet)
//   [ ... ]               -> SEARCH     (n, top headlines + match%)
//   { results|synthesis } -> OTHER
//
// PREREQUISITE: npm run dev in another terminal.
// RUN:  node scripts/probe-robust.mjs
//       BASE_URL=http://localhost:3000 node scripts/probe-robust.mjs

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

const CASES = [
  // A) People analytics — dept×designation, name×dept, class
  ["people", "how many AGM in C&IT"],
  ["people", "executives in C&IT"],
  ["people", "how many DGM"],
  ["people", "list AGM in EMD"],
  ["people", "how many people named ghosh in C&IT"],

  // B) Document semantic — multi-part conversational policy questions
  ["doc",    "what is the procedure to apply for a refundable PF loan"],
  ["doc",    "rules for keeping a company quarter after retirement"],
  ["doc",    "who is eligible for the merit award scheme for contract workers"],
  ["doc",    "how do I submit the format B declaration for SIR"],
  ["doc",    "gift card option for employees"],

  // C) Dept + topic seam
  ["seam",   "c&it attendance"],
  ["seam",   "EMD safety rules"],
  ["seam",   "health checkup for non-executive employees"],

  // D) Cross-lingual conversational
  ["lang",   "छुट्टी की नीति क्या है"],                 // "what is the leave policy" (Hindi)
  ["lang",   "ঠিকা কর্মীদের জন্য মেধাবৃত্তি প্রকল্প"],      // contract-worker merit scheme (Bengali)

  // E) Literal / amount
  ["literal","20995.30"],
  ["literal",'"Shram Bhavan"'],

  // F) Adversarial / junk — should be EMPTY or clearly low, never confident
  ["junk",   "honda spark plugs price list"],
  ["junk",   "asdfghjkl qwerty"],
  ["junk",   "the of and in a"],

  // G) Compound (Stage-3 gap — expect partial / single-intent handling)
  ["compound","how many GMs in C&IT and who signed the last gift card circular"],

  // H) Known miss to re-confirm
  ["miss",   "hindi teaching scheme"],
];

function url(q) { return `${BASE_URL}/api/ai-search?q=${encodeURIComponent(q)}&mode=semantic`; }

function describe(data) {
  if (Array.isArray(data)) {
    if (data.length === 0) return "SEARCH(0) — empty";
    const top = data.slice(0, 3).map((r) => {
      const pct = r.matchPercentage ?? r.similarity ?? "?";
      const h = (r.headline || r.title || "?").slice(0, 54);
      return `${pct}% ${h}`;
    });
    return `SEARCH(${data.length}) — ` + top.join("  |  ");
  }
  if (data && typeof data === "object") {
    if ("analytics" in data) {
      const a = data.analytics || {};
      const ans = (a.answer || "").slice(0, 70);
      return `ANALYTICS(kind=${a.kind}${a.count != null ? `, n=${a.count}` : ""}) — "${ans}"`;
    }
    if ("results" in data || "synthesis" in data) return "OTHER(results/synthesis)";
  }
  return "UNKNOWN shape";
}

async function run() {
  console.log(`\nRobustness observation — target ${BASE_URL}\n${"=".repeat(74)}`);
  let curCat = null;
  for (const [cat, q] of CASES) {
    if (cat !== curCat) { curCat = cat; console.log(`\n--- ${cat.toUpperCase()} ---`); }
    let line;
    try {
      const res = await fetch(url(q));
      if (!res.ok) line = `HTTP ${res.status}`;
      else line = describe(await res.json());
    } catch (e) { line = `ERROR ${e?.message || e}`; }
    console.log(`  ${JSON.stringify(q)}`);
    console.log(`     -> ${line}`);
  }
  console.log("\n" + "=".repeat(74));
  console.log("Read: junk rows should be EMPTY/low; compound handles one intent only");
  console.log("(Stage-3 gap); 'hindi teaching scheme' is the known retrieval miss.\n");
}
run();

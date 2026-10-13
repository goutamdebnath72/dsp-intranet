// scripts/omnibar-acceptance.mjs
//
// Runs every question in eval/router-acceptance.json through the REAL front door, GET /api/ai-search, exactly as the
// omnibar's Enter key does (HANDOFF_dsp-intranet_front-path.md: "test only through the front door"), and records for
// each one: the route that answered, the latency, and pass/fail against the expected facts. It changes no app code,
// writes nothing to the database, and never calls the feedback endpoints.
//
// ----------------------------------------------------------------------------------------------------------------
// BEFORE YOU RUN IT: local dev and Vercel use the SAME online resources (Supabase, Groq, Gemini).
//   * Every question that is not a holiday question makes at least one Groq call, and each call carries the whole
//     schema prompt (several thousand tokens). The free tier allows 200,000 tokens a day, so a full run does NOT fit
//     in one day. Therefore:
//       --no-model          run only the questions the deterministic holiday parser should answer (no tokens)
//       --max-model-calls N stop cleanly after about N model calls (estimated from the answers so far)
//       --resume FILE       continue an earlier results file: questions already answered are kept, the rest run
//     The server console prints the real token count of every call ("Every call prints one line with the tokens").
//   * Executive Deep Synthesis questions send up to ten circulars to the model (the most expensive): they run only
//     with --eds, as the executive ticket given by --exec-ticket (default 498301).
//
// USAGE (from the project root, with `npm run dev` running in another terminal):
//   node scripts/omnibar-acceptance.mjs --list                       what is in the set
//   node scripts/omnibar-acceptance.mjs --no-model --tag local-free  the free part first (holidays, Bad Queries)
//   node scripts/omnibar-acceptance.mjs --regression --tag local     only the records verified on screen before
//   node scripts/omnibar-acceptance.mjs --source A,HC --tag local    by source (A,B,K,H,F,HC,S,CB,G)
//   node scripts/omnibar-acceptance.mjs --base https://YOUR-APP.vercel.app --tag vercel
//   node scripts/omnibar-acceptance.mjs --compare eval/results/a.json eval/results/b.json
// Other options: --only ID,ID  --area NAME  --eds  --with FLAG  --pause MS (default 1500)  --yes  --dry-run
//                --raw (save every sanitised answer, not only failures)  --exec-ticket 4xxxxx  --out DIR
//
// OUTPUT: eval/results/acceptance-<tag>-<timestamp>.json (all data) and .md (the report to read or send back).
// Personal data: people's P.No. and masked contacts are removed from everything written to disk (see the report).

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import {
  judge, summarize, renderReport, compareRuns, sanitize, sec, pct,
} from "./lib/acceptance-core.mjs";

// ------------------------------------------------------------------------------------------------ arguments
const argv = process.argv.slice(2);
const has = (n) => argv.includes(`--${n}`);
const val = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  if (i === -1) return d;
  const v = argv[i + 1];
  return v && !v.startsWith("--") ? v : d;
};
const list = (n) => (val(n, "") || "").split(",").map((s) => s.trim()).filter(Boolean);

const BASE = val("base", "http://localhost:3000").replace(/\/+$/, "");
const TAG = val("tag", "run").replace(/[^A-Za-z0-9_.-]/g, "-");
const PAUSE = Math.max(0, parseInt(val("pause", "1500"), 10) || 0);
const EXEC = val("exec-ticket", "498301");
const OUT = val("out", "eval/results");
const SET_FILE = val("set", "eval/router-acceptance.json");
const MAX_MODEL = parseInt(val("max-model-calls", "0"), 10) || 0;
const TIMEOUT_MS = 75000;

// ------------------------------------------------------------------------------------------------ compare mode
if (has("compare")) {
  const i = argv.indexOf("--compare");
  const [fa, fb] = [argv[i + 1], argv[i + 2]];
  if (!fa || !fb) { console.error("usage: --compare OLD.json NEW.json"); process.exit(2); }
  const a = JSON.parse(readFileSync(fa, "utf8")), b = JSON.parse(readFileSync(fb, "utf8"));
  const c = compareRuns(a, b);
  console.log(`Pass rate: ${pct(c.passRate.from)} -> ${pct(c.passRate.to)}`);
  console.log(`Regressed (pass -> fail/error): ${c.changes.regressed.join(", ") || "none"}`);
  console.log(`Fixed (not pass -> pass):       ${c.changes.fixed.join(", ") || "none"}`);
  console.log(`Still failing:                  ${c.changes.stillFailing.length}`);
  console.log(`Route changed (${c.changes.routeChanged.length}): ${c.changes.routeChanged.map((x) => `${x.id} ${x.from}->${x.to}`).join(", ") || "none"}`);
  console.log(`Only in the old run: ${c.changes.onlyInA.length}   only in the new run: ${c.changes.onlyInB.length}`);
  console.log("Latency p50 / p95 by route (old -> new):");
  for (const l of c.latency) console.log(`  ${l.route.padEnd(11)} ${sec(l.p50From)} -> ${sec(l.p50To)}   ${sec(l.p95From)} -> ${sec(l.p95To)}`);
  process.exit(c.changes.regressed.length ? 1 : 0);
}

// ------------------------------------------------------------------------------------------------ load + select
if (!existsSync(SET_FILE)) { console.error(`Cannot find ${SET_FILE}. Run this from the project root.`); process.exit(2); }
const SET = JSON.parse(readFileSync(SET_FILE, "utf8"));
const records = SET.records;

const withFlags = new Set(list("with"));
const only = new Set(list("only"));
const sources = new Set(list("source").map((s) => s.toUpperCase()));
const areas = new Set(list("area"));
const NO_MODEL = has("no-model");
const WANT_EDS = has("eds");

const modelFree = (r) => {
  const e = [].concat(r.expectedRoute ?? []);
  return e.length > 0 && e.every((x) => x === "HOLIDAY" || x === "BAD-QUERY");
};
const isEds = (r) => r.run?.mode === "intellectual";

const selected = [];
const skipped = [];
for (const r of records) {
  if (only.size && !only.has(r.id)) continue;
  if (sources.size && !sources.has(String(r.source).toUpperCase())) continue;
  if (areas.size && !areas.has(r.area)) continue;
  if (has("regression") && !r.regression) continue;
  const missing = (r.requires || []).filter((f) => !withFlags.has(f));
  if (missing.length) { skipped.push({ id: r.id, why: `needs --with ${missing.join(",")}` }); continue; }
  if (isEds(r) && !WANT_EDS && !only.has(r.id)) { skipped.push({ id: r.id, why: "Executive Deep Synthesis is expensive: add --eds" }); continue; }
  if (NO_MODEL && !modelFree(r)) { skipped.push({ id: r.id, why: "--no-model" }); continue; }
  selected.push(r);
}

if (has("list")) {
  for (const r of records) {
    const flags = [r.regression ? "REG" : "", r.timeSensitive ? "TIME" : "", r.pendingDecision ? "PENDING" : "", r.requires ? "REQ" : "", isEds(r) ? "EDS" : "", modelFree(r) ? "free" : ""].filter(Boolean).join(",");
    console.log(`${String(r.id).padEnd(9)} ${String(r.source).padEnd(3)} ${String([].concat(r.expectedRoute ?? "ANY").join("|")).padEnd(22)} ${flags.padEnd(14)} ${r.query}`);
  }
  console.log(`\n${records.length} records. Free of model calls (holiday parser / Bad Query): ${records.filter(modelFree).length}. EDS: ${records.filter(isEds).length}.`);
  process.exit(0);
}

// ------------------------------------------------------------------------------------------------ resume
let prior = null;
const carried = new Map();
if (val("resume")) {
  prior = JSON.parse(readFileSync(val("resume"), "utf8"));
  for (const r of prior.results) if (r.outcome !== "ERROR") carried.set(r.id, r);
}
const todo = selected.filter((r) => !carried.has(r.id));

// ------------------------------------------------------------------------------------------------ plan
const estModel = todo.filter((r) => !modelFree(r)).length;
console.log(`Omnibar acceptance run "${TAG}" against ${BASE}`);
console.log(`  records in the set: ${records.length}   selected: ${selected.length}   to run now: ${todo.length}   carried over: ${carried.size}   not run: ${skipped.length}`);
console.log(`  expected to make a model call: about ${estModel} (everything except holiday-parser questions)${MAX_MODEL ? `   budget: stop after ~${MAX_MODEL}` : ""}`);
console.log(`  pause between questions: ${PAUSE} ms   executive ticket for synthesis: ${EXEC}`);
if (estModel > 25 && !MAX_MODEL) console.log(`  NOTE: ${estModel} model calls will probably exceed one day of the free Groq allowance (200,000 tokens). Consider --no-model, --max-model-calls, then --resume tomorrow.`);
if (has("dry-run")) {
  for (const r of todo) console.log(`    would run ${r.id}: ${r.query}`);
  process.exit(0);
}
if (!todo.length) console.log("  nothing to run.");

// This spends real Groq tokens: leave a few seconds to change your mind (Ctrl-C), unless told not to.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (todo.length && !has("yes")) {
  console.log("  starting in 5 seconds: press Ctrl-C to cancel (--yes skips this wait)");
  await sleep(5000);
}

// ------------------------------------------------------------------------------------------------ run
let stopping = false;
process.on("SIGINT", () => { if (stopping) process.exit(130); stopping = true; console.log("\nStopping after this question; results so far will be saved (press Ctrl-C again to quit at once)."); });

async function ask(rec) {
  const run = rec.run || {};
  const mode = run.mode || "semantic";
  const ticket = run.ticket === "$EXEC" ? EXEC : run.ticket || "";
  const url = `${BASE}/api/ai-search?q=${encodeURIComponent(rec.query)}&mode=${mode}${ticket ? `&ticket=${encodeURIComponent(ticket)}` : ""}`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  const t0 = performance.now();
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { "x-acceptance-run": TAG } });
    const text = await r.text();
    const ms = Math.round(performance.now() - t0);
    let json = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: r.status, json, text, ms };
  } catch (e) {
    return { status: 0, json: null, text: "", ms: Math.round(performance.now() - t0), error: e?.name === "AbortError" ? `timeout after ${TIMEOUT_MS / 1000}s` : String(e?.message || e) };
  } finally {
    clearTimeout(timer);
  }
}

const startedAt = new Date().toISOString();
const results = [];
const rawDir = path.join(OUT, `raw-${TAG}-${startedAt.replace(/[-:T]/g, "").slice(0, 14)}`);
let stoppedBecause = null;
let modelCalls = 0;
let transportErrors = 0;

if (todo.length) {
  // wake the function and the database connection without spending a model call (a 1-letter question returns at once)
  await ask({ query: "x", run: { mode: "semantic" } }).catch(() => null);

  for (const rec of todo) {
    if (stopping) { stoppedBecause = "interrupted by you (Ctrl-C)"; break; }
    if (MAX_MODEL && modelCalls >= MAX_MODEL) { stoppedBecause = `model-call budget reached (~${modelCalls} of ${MAX_MODEL})`; break; }

    const resp = await ask(rec);
    const res = judge(rec, resp);
    results.push(res);

    if (res.route !== "HOLIDAY" && res.route !== "BAD-QUERY" && res.answerSource !== "cache") modelCalls += res.attempts || 1;

    const keepRaw = has("raw") || res.outcome === "FAIL" || res.outcome === "ERROR";
    if (keepRaw && resp.json) {
      mkdirSync(rawDir, { recursive: true });
      writeFileSync(path.join(rawDir, `${rec.id}.json`), JSON.stringify(sanitize(resp.json), null, 1));
    }

    const tag = res.outcome === "PASS" && res.routeOnly ? "PASS*" : res.outcome;
    console.log(`${tag.padEnd(8)} ${String(rec.id).padEnd(9)} ${String(res.route).padEnd(11)} ${sec(res.ms).padStart(6)}  ${rec.query.slice(0, 70)}`);
    if (res.outcome === "FAIL" || res.outcome === "ERROR") for (const n of res.notes.slice(0, 3)) console.log(`           - ${n}`);

    if (res.dailyLimit) { stoppedBecause = "Groq's free daily allowance is used up. Resume tomorrow with --resume <this results file>"; break; }
    if (res.outcome === "ERROR" && (resp.status === 0 || resp.status >= 500)) {
      if (++transportErrors >= 3) { stoppedBecause = "3 failures in a row (server down, database down, or timeouts)"; break; }
    } else transportErrors = 0;

    await sleep(PAUSE);
  }
}

// ------------------------------------------------------------------------------------------------ save
const order = new Map(records.map((r, i) => [r.id, i]));
const merged = [...carried.values(), ...results].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
const finishedAt = stoppedBecause ? null : new Date().toISOString();
const runObj = {
  meta: { tag: TAG, base: BASE, startedAt, finishedAt, stoppedBecause, args: argv.join(" "), setVersion: SET.version ?? null, node: process.version, resumedFrom: val("resume") || null, execTicketUsed: isAnyEds(merged) ? EXEC : null },
  results: merged,
  skipped,
};
function isAnyEds(rs) { return rs.some((r) => r.runMode === "intellectual"); }

if (merged.length) {
  mkdirSync(OUT, { recursive: true });
  const stamp = startedAt.replace(/[-:T]/g, "").slice(0, 14);
  const base = path.join(OUT, `acceptance-${TAG}-${stamp}`);
  writeFileSync(`${base}.json`, JSON.stringify(runObj, null, 1));
  writeFileSync(`${base}.md`, renderReport(runObj));
  const s = summarize(merged);
  console.log("");
  console.log(`PASS ${s.totals.pass} (route-only ${s.totals.passRouteOnly})   FAIL ${s.totals.fail} (route ${s.totals.failRoute}, engine ${s.totals.failEngine})   ERROR ${s.totals.error}   observed ${s.totals.observed + s.totals.info}   pass rate ${pct(s.totals.passRate)}`);
  if (s.regression.n) console.log(`Regression set: ${s.regression.pass} of ${s.regression.n} pass${s.regression.broken.length ? `   BROKEN: ${s.regression.broken.join(", ")}` : ""}`);
  for (const r of s.byRoute) console.log(`  ${String(r.route).padEnd(11)} n=${String(r.n).padEnd(3)} p50 ${sec(r.p50)}  p95 ${sec(r.p95)}`);
  if (stoppedBecause) console.log(`\nSTOPPED: ${stoppedBecause}`);
  console.log(`\nWrote ${base}.md and ${base}.json`);
  if (stoppedBecause) console.log(`Continue later with:  node scripts/omnibar-acceptance.mjs ${argv.filter((a) => a !== "--resume" && a !== val("resume")).join(" ")} --resume ${base}.json`);
}
process.exit(0);

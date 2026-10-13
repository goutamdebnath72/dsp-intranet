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
//       --max-model-calls N stop cleanly after N model calls (the server reports the exact number)
//       --max-tokens N      stop cleanly once the questions so far have used N tokens: the right control for the
//                           200,000-a-day free allowance (e.g. --max-tokens 150000 leaves room for the app itself)
//       --resume FILE       continue an earlier results file: questions already answered are kept, the rest run
//       --model-pause MS    wait this long after a question that used the model (default 40000). Measured on the
//                           first real run: one model call is about 4,900 tokens and the free tier allows about
//                           8,000 tokens a minute, so calls closer together than ~40 s just sit in the app's 429 wait.
//                           Use 0 to let the app wait by itself.
//     The server console prints the real token count of every call ("Every call prints one line with the tokens").
//   * Executive Deep Synthesis questions send up to ten circulars to the model (the most expensive): they run only
//     with --eds AND --cookie. Since step 25a the server takes WHO is calling from the login session, never from the
//     browser's ticket parameter, so the harness needs a real executive session: log in to the app in your browser, open
//     the developer tools > Application > Cookies, and pass the value like this:
//         --cookie "next-auth.session-token=PASTE-THE-VALUE"
//     (it is sent only with the synthesis questions, never written to the results). The two SEC- security probes need no
//     cookie: they check that synthesis is REFUSED without a login.
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

// The command line as it may be WRITTEN or ECHOED: the session cookie's value is a login secret and never leaves this process.
const safeArgv = argv.map((a, i) => (argv[i - 1] === "--cookie" ? "[hidden]" : a));
const BASE = val("base", "http://localhost:3000").replace(/\/+$/, "");
const TAG = val("tag", "run").replace(/[^A-Za-z0-9_.-]/g, "-");
const PAUSE = Math.max(0, parseInt(val("pause", "1500"), 10) || 0);
const MODEL_PAUSE = Math.max(0, parseInt(val("model-pause", "40000"), 10) || 0);
const EXEC = val("exec-ticket", "498301"); // only used to send a SPOOFED ticket in the SEC- probes (the server must ignore it)
const COOKIE = val("cookie", "");
const OUT = val("out", "eval/results");
const SET_FILE = val("set", "eval/router-acceptance.json");
const MAX_MODEL = parseInt(val("max-model-calls", "0"), 10) || 0;
const MAX_TOKENS = parseInt(val("max-tokens", "0"), 10) || 0;
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
const authOf = (r) => r.run?.auth ?? (r.run?.mode === "intellectual" ? "exec" : "none");
const isEds = (r) => r.run?.mode === "intellectual" && authOf(r) !== "none"; // an expensive synthesis is expected
const needsCookie = (r) => r.run?.mode === "intellectual" && authOf(r) === "exec";

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
  if (needsCookie(r) && !COOKIE) { skipped.push({ id: r.id, why: "needs --cookie (an executive's login session: the server no longer trusts the ticket parameter)" }); continue; }
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
console.log(`  pause between questions: ${PAUSE} ms (${MODEL_PAUSE} ms after one that used the model)   executive session cookie: ${COOKIE ? "given" : "not given"}`);
if (estModel > 0 && MODEL_PAUSE > 0) console.log(`  the model questions alone will take about ${Math.round((estModel * MODEL_PAUSE) / 60000)} minutes at that pace (--model-pause 0 to let the app wait by itself)`);
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
  const ticket = run.ticket === "$EXEC" ? EXEC : run.ticket || ""; // only the SEC- probes send one, to prove it is ignored
  const url = `${BASE}/api/ai-search?q=${encodeURIComponent(rec.query)}&mode=${mode}${ticket ? `&ticket=${encodeURIComponent(ticket)}` : ""}`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  const t0 = performance.now();
  try {
    const headers = { "x-acceptance-run": TAG };
    if (needsCookie(rec) && COOKIE) headers.cookie = COOKIE; // the login session, only for the synthesis questions
    const r = await fetch(url, { signal: ctl.signal, headers });
    const text = await r.text();
    const ms = Math.round(performance.now() - t0);
    let json = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: r.status, json, text, ms, headers: Object.fromEntries(r.headers.entries()) };
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
let tokensUsed = 0;
let transportErrors = 0;

if (todo.length) {
  // wake the function and the database connection without spending a model call (a 1-letter question returns at once)
  await ask({ query: "x", run: { mode: "semantic" } }).catch(() => null);

  for (const rec of todo) {
    if (stopping) { stoppedBecause = "interrupted by you (Ctrl-C)"; break; }
    if (MAX_MODEL && modelCalls >= MAX_MODEL) { stoppedBecause = `model-call budget reached (${modelCalls} of ${MAX_MODEL})`; break; }
    if (MAX_TOKENS && tokensUsed >= MAX_TOKENS) { stoppedBecause = `token budget reached (${tokensUsed.toLocaleString()} of ${MAX_TOKENS.toLocaleString()})`; break; }

    const resp = await ask(rec);
    const res = judge(rec, resp);
    results.push(res);

    // the server's own trace when it sends one; otherwise the old inference from the answer
    const traced = typeof res.modelCalls === "number";
    const usedModel = traced
      ? res.modelCalls > 0
      : res.outcome !== "ERROR" && res.route !== "HOLIDAY" && res.route !== "BAD-QUERY" && res.answerSource !== "cache";
    if (traced) modelCalls += res.modelCalls;
    else if (usedModel) modelCalls += res.attempts || 1;
    if (typeof res.tokens === "number") tokensUsed += res.tokens;

    const keepRaw = has("raw") || res.outcome === "FAIL" || res.outcome === "ERROR";
    if (keepRaw && resp.json) {
      mkdirSync(rawDir, { recursive: true });
      writeFileSync(path.join(rawDir, `${rec.id}.json`), JSON.stringify(sanitize(resp.json), null, 1));
    }

    const tag = res.outcome === "PASS" && res.routeOnly ? "PASS*" : res.outcome;
    const tok = typeof res.tokens === "number" ? (res.tokens ? `${res.tokens}tok` : "free") : "";
    console.log(`${tag.padEnd(8)} ${String(rec.id).padEnd(9)} ${String(res.route).padEnd(11)} ${sec(res.ms).padStart(6)} ${tok.padStart(8)}  ${rec.query.slice(0, 66)}`);
    if (res.outcome === "FAIL" || res.outcome === "ERROR") for (const n of res.notes.slice(0, 3)) console.log(`           - ${n}`);

    if (res.dailyLimit) { stoppedBecause = "Groq's free daily allowance is used up. Resume tomorrow with --resume <this results file>"; break; }
    if (res.outcome === "ERROR" && (resp.status === 0 || resp.status >= 500)) {
      if (++transportErrors >= 3) { stoppedBecause = "3 failures in a row (server down, database down, or timeouts)"; break; }
    } else transportErrors = 0;

    await sleep(usedModel ? MODEL_PAUSE : PAUSE);
  }
}

// ------------------------------------------------------------------------------------------------ save
const order = new Map(records.map((r, i) => [r.id, i]));
const merged = [...carried.values(), ...results].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
const finishedAt = stoppedBecause ? null : new Date().toISOString();
const runObj = {
  meta: { tag: TAG, base: BASE, startedAt, finishedAt, stoppedBecause, args: safeArgv.join(" "), setVersion: SET.version ?? null, node: process.version, resumedFrom: val("resume") || null, sessionCookieGiven: !!COOKIE },
  results: merged,
  skipped,
};

if (merged.length) {
  mkdirSync(OUT, { recursive: true });
  const stamp = startedAt.replace(/[-:T]/g, "").slice(0, 14);
  const base = path.join(OUT, `acceptance-${TAG}-${stamp}`);
  writeFileSync(`${base}.json`, JSON.stringify(runObj, null, 1));
  writeFileSync(`${base}.md`, renderReport(runObj));
  const s = summarize(merged);
  console.log("");
  if (s.traced) console.log(`Model calls ${s.modelCallsLowerBound}, tokens ${s.tokensTotal.toLocaleString()} (exact, from the server's trace)${s.waitedMsTotal ? `, waited ${sec(s.waitedMsTotal)} for Groq's per-minute limit` : ""}`);
  console.log(`PASS ${s.totals.pass} (route-only ${s.totals.passRouteOnly})   FAIL ${s.totals.fail} (route ${s.totals.failRoute}, engine ${s.totals.failEngine})   ERROR ${s.totals.error}   observed ${s.totals.observed + s.totals.info}   pass rate ${pct(s.totals.passRate)}`);
  if (s.regression.n) console.log(`Regression set: ${s.regression.pass} of ${s.regression.n} pass${s.regression.broken.length ? `   BROKEN: ${s.regression.broken.join(", ")}` : ""}`);
  for (const r of s.byRoute) console.log(`  ${String(r.route).padEnd(11)} n=${String(r.n).padEnd(3)} p50 ${sec(r.p50)}  p95 ${sec(r.p95)}`);
  if (stoppedBecause) console.log(`\nSTOPPED: ${stoppedBecause}`);
  console.log(`\nWrote ${base}.md and ${base}.json`);
  if (stoppedBecause) console.log(`Continue later with:  node scripts/omnibar-acceptance.mjs ${safeArgv.filter((a) => a !== "--resume" && a !== val("resume")).join(" ")} --resume ${base}.json   (put your --cookie "..." back in)`);
}
process.exit(0);

// scripts/omnibar-acceptance.selftest.mjs
//
// Proves the harness's JUDGE before it judges the app, and checks that eval/router-acceptance.json is well formed.
// Needs no server, no database, no model:   node scripts/omnibar-acceptance.selftest.mjs
//
// The fake answers below copy the SHAPES the real route returns (src/lib/employees/analytics.ts AnalyticsPayload,
// src/lib/nl2sql/omnibar.ts OmnibarPayload, src/app/api/ai-search/route.ts).

import { readFileSync } from "node:fs";
import {
  norm, hasFact, flattenText, extractRows, rowHasMatch, measureCount, inferRoute, routeMatches,
  evaluateCircular, judge, sanitize, containsSailPNo, summarize, compareRuns, renderReport, percentile,
} from "./lib/acceptance-core.mjs";

let pass = 0, fail = 0;
const t = (name, cond, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL: ${name} ${extra}`); }
};
const eq = (name, a, b) => t(name, JSON.stringify(a) === JSON.stringify(b), `got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`);

// ---------------------------------------------------------------- fake answers (real shapes)
const holidayList = {
  analytics: {
    kind: "total", source: "holiday", answer: "8 holidays.", count: 8,
    holidays: [
      { id: 1, name: "Dol Yatra", aliases: null, type: "RH", date: "2026-03-03", categories: null, note: null },
      { id: 2, name: "Holi", aliases: ["Doljatra"], type: "RH", date: "2026-03-04", categories: null, note: null },
    ],
    typeBreakdown: [{ type: "RH", label: "Restricted", count: 2 }],
    rhQuotaByCategory: [{ category: "A", quota: 4 }, { category: "B", quota: 2 }],
  },
};
const compareCard = {
  analytics: {
    kind: "count", source: "holiday", answer: "2024 had 40 holidays in total, 2025 had 38 (2 fewer in 2025).", count: 40,
    holidayCompare: {
      title: "Holidays: 2024 vs 2025", unit: "holidays", change: "2 fewer in 2025", direction: "fewer",
      years: [{ year: 2024, total: 40, caption: "" }, { year: 2025, total: 38, caption: "" }],
      rows: [
        { type: "FH", label: "Festival", a: 14, b: 14, change: "no change", direction: "same" },
        { type: "RH", label: "Restricted", a: 35, b: 33, change: "2 fewer in 2025", direction: "fewer" },
      ],
    },
  },
};
const holidayCard = {
  analytics: {
    kind: "total", source: "holiday", answer: "Yes. 23 October 2025 is a holiday.", lead: "Yes — 23 October 2025 is a holiday.",
    holidayDetails: [{ name: "Bhatridwitiya", aliases: ["Bhai Dooj"], explanation: "Republic Day falls on a Sunday.", sourceNote: null,
      entries: [{ date: "2025-10-23", dateLabel: "23 October 2025", weekday: "Thursday", type: "FH", typeLabel: "Festival", audience: "Category B" }] }],
  },
};
const badQuery = { analytics: { kind: "error", source: "holiday", answer: "Please write dates as dd/mm/yyyy." } };
const empPeople = {
  analytics: {
    kind: "count", source: "nl2sql", answer: "16 people found.", count: 16,
    people: [{ name: "MOHD ANWAR ULLAH", ticketNo: "498301", sailPNo: "B001022", designation: "General Manager", department: "C&IT", mobileMasked: "943477xxxx", emailMasked: "xxxxxx@sail.in" }],
    nl2sql: { sql: "SELECT * FROM nlq.employees WHERE ...", attempts: 1, elapsedMs: 3100, table: { columns: ["ticket_no"], rows: [{ ticket_no: "498301" }], total: 16, truncated: false } },
  },
};
const empTable = {
  analytics: {
    kind: "total", source: "nl2sql", answer: "3 rows.", count: 3,
    nl2sql: { sql: "SELECT department_code, ...", attempts: 1, table: { columns: ["department_code", "executives", "non_executives"], rows: [
      { department_code: 98500, executives: 16, non_executives: 0 }, { department_code: 98530, executives: 0, non_executives: 1 }, { department_code: 98540, executives: 0, non_executives: 6 } ], total: 3, truncated: false } },
  },
};
const healthTable = {
  analytics: {
    kind: "total", source: "nl2sql", answer: "1 row.", count: 1,
    nl2sql: { sql: "SELECT ticket_no, name FROM nlq.health_checkups WHERE ...", attempts: 1, table: { columns: ["ticket_no", "name", "department_code", "checkup_date"], rows: [{ ticket_no: "228757", name: "BISWAJIT BHATTACHARJEE", department_code: 12000, checkup_date: "2026-01-01" }], total: 1, truncated: false } },
  },
};
const clarify = { analytics: { kind: "clarify", source: "nl2sql", answer: "I do not hold salary data." } };
const legacy = { analytics: { kind: "count", source: "legacy", answer: "5 people.", count: 5, people: [] } };
const circularList = [
  { id: 49, type: "circular", headline: "Gift card corrigendum", matchPercentage: 96 },
  { id: 51, type: "circular", headline: "Online option for Gift Card", matchPercentage: 90 },
  { id: 40, type: "circular", headline: "Armed Forces Flag Day", matchPercentage: 70 },
];
const policyList = [{ id: 7, type: "holiday", headline: "Compensatory Off", matchPercentage: 88 }, { id: 1, type: "circular", headline: "contract workers", matchPercentage: 80 }];
const synth = { synthesis: { overview: "The gift card was Rs.15,000, corrected to Rs.14,999.", keyFindings: [], table: null, charts: [], citations: [] }, results: [{ id: 49, type: "circular", headline: "x" }] };

// ---------------------------------------------------------------- text helpers
eq("norm strips punctuation", norm("SK.ZAKIR  HOSSAIN"), "sk zakir hossain");
eq("norm keeps indic letters", norm("छुट्टियों 2026"), "छुट्टियों 2026");
t("hasFact whole words", hasFact(flattenText({ a: "Mohd Anwar Ullah" }), "anwar ullah"));
t("hasFact is not a substring match", !hasFact(flattenText({ a: "Rao Roychowdhury" }), "roy"));
t("hasFact alternatives", hasFact(flattenText({ a: "31 August 2026" }), ["31.08.2026", "31 August 2026"]));
t("hasFact thousands comma", hasFact(flattenText({ a: "Rs. 14,999" }), "14,999"));
t("flatten skips sql", !hasFact(flattenText({ sql: "health_checkups", answer: "x" }), "health_checkups"));
t("flatten skips sailPNo", !hasFact(flattenText({ sailPNo: "B001022" }), "B001022"));
t("containsSailPNo finds nested", containsSailPNo(empPeople));
t("containsSailPNo false on clean", !containsSailPNo(holidayList));
t("sanitize removes personal fields", !JSON.stringify(sanitize(empPeople)).includes("B001022") && !JSON.stringify(sanitize(empPeople)).includes("943477"));
t("sanitize keeps the rest", JSON.stringify(sanitize(empPeople)).includes("498301"));

// ---------------------------------------------------------------- rows and counts
t("rowHas date in holiday rows", rowHasMatch(extractRows(holidayList), ["2026-03-03"]));
t("rowHas two tokens in ONE row", rowHasMatch(extractRows(empTable), ["98500", "16"]));
t("rowHas wrong pairing fails", !rowHasMatch(extractRows(empTable), ["98500", "6"]));
t("rowHas alternatives", rowHasMatch(extractRows(healthTable), ["228757", ["2026-01-01", "01 Jan 2026"]]));
t("rowHas short tokens need equality", !rowHasMatch(extractRows(empTable), ["98500", "1"]));
t("rowHas quota rows", rowHasMatch(extractRows(holidayList), ["A", "4"]));
t("rowHas: a lone token list with alternatives means any-of", rowHasMatch(extractRows(empTable), [["98500", "nonexistent"]]));
t("rowHas: the comparison card's per-type row", rowHasMatch(extractRows(compareCard), ["Restricted", "35", "33"]));
t("rowHas: the comparison card's year tile", rowHasMatch(extractRows(compareCard), ["2025", "38"]));
t("rowHas: a wrong pairing on the card fails", !rowHasMatch(extractRows(compareCard), ["Restricted", "14", "33"]));
t("judge: comparison card checked by rows", judge({ id: "x", query: "q", expectedRoute: "HOLIDAY", rowHas: [["Restricted", "35", "33"], ["2024", "40"]] }, { status: 200, json: compareCard, text: "", ms: 1 }).outcome === "PASS");
t("rowHas people", rowHasMatch(extractRows(empPeople), ["498301", "General Manager"]));
eq("count of holidays", measureCount(holidayList, "holidays"), 2);
eq("count of count", measureCount(empPeople, "count"), 16);
eq("count of people uses the total", measureCount(empPeople, "people"), 16);
eq("count of rows uses table.total", measureCount(empTable, "rows"), 3);
eq("count of details", measureCount(holidayCard, "details"), 1);
eq("count of results (array)", measureCount(circularList, "results"), 3);
eq("count missing -> null", measureCount(clarify, "rows"), null);

// ---------------------------------------------------------------- route inference
eq("holiday list", inferRoute(holidayList).route, "HOLIDAY");
eq("holiday card", inferRoute(holidayCard).route, "HOLIDAY");
eq("bad query", inferRoute(badQuery).route, "BAD-QUERY");
eq("employee people", inferRoute(empPeople).route, "EMP-SQL");
eq("employee table", inferRoute(empTable).route, "EMP-SQL");
eq("health check-up sql", inferRoute(healthTable).route, "HEALTH-SQL");
eq("clarify card", inferRoute(clarify).route, "CLARIFY");
eq("legacy engine", inferRoute(legacy), { route: "EMP-SQL", via: "legacy", kind: "count", source: "legacy", attempts: undefined, serverMs: undefined });
eq("circular list", inferRoute(circularList).route, "CIRCULAR");
eq("policy list", inferRoute(policyList).route, "POLICY");
eq("empty list", inferRoute([]).route, "NONE");
eq("synthesis", inferRoute(synth).route, "EDS");
eq("error body", inferRoute({ error: "search_unavailable" }).route, "ERROR");
eq("server attempts read", inferRoute(empPeople).attempts, 1);
t("NOT-FOUND accepts NONE", routeMatches("NOT-FOUND", "NONE"));
t("NOT-FOUND accepts CLARIFY", routeMatches("NOT-FOUND", "CLARIFY"));
t("NOT-FOUND rejects a circular list", !routeMatches("NOT-FOUND", "CIRCULAR"));
t("list of routes", routeMatches(["POLICY", "HOLIDAY"], "HOLIDAY") && !routeMatches(["POLICY", "HOLIDAY"], "EMP-SQL"));
t("ANY accepts all", routeMatches("ANY", "EDS") && routeMatches(undefined, "EDS"));

// ---------------------------------------------------------------- the battery's circular rules (ported)
t("circ: expected present and topIs", evaluateCircular({ expect: [49, 51], topIs: 49 }, circularList).pass);
t("circ: missing id", !evaluateCircular({ expect: [99] }, circularList).pass);
t("circ: topIs wrong", !evaluateCircular({ expect: [51], topIs: 51 }, circularList).pass);
t("circ: notAbove violated", !evaluateCircular({ expect: [51], notAbove: [49] }, circularList).pass);
t("circ: notAbove respected", evaluateCircular({ expect: [49], notAbove: [51] }, circularList).pass);
t("circ: forbid present", !evaluateCircular({ expect: [49], forbid: [40] }, circularList).pass);
t("circ: expectType holiday present", evaluateCircular({ expectType: "holiday" }, policyList).pass);
t("circ: expectType holiday absent", !evaluateCircular({ expectType: "holiday" }, circularList).pass);
t("circ: expectType + notAbove (circular above the holiday note)", !evaluateCircular({ expectType: "holiday", notAbove: [1] }, [{ id: 1, type: "circular" }, { id: 7, type: "holiday" }]).pass);
t("circ: expectAny hit", evaluateCircular({ expectAny: [40, 41] }, circularList).pass);
t("circ: expectAny miss", !evaluateCircular({ expectAny: [70, 71] }, circularList).pass);
eq("circ: noise counts circulars outside expect/ok", evaluateCircular({ expect: [49], ok: [51] }, circularList).noise, 1);
t("circ: reads results of an EDS answer", evaluateCircular({ expect: [49] }, synth).pass);

// ---------------------------------------------------------------- judge
const ok = (json) => ({ status: 200, json, text: JSON.stringify(json), ms: 1200 });
const J = (rec, resp) => judge(rec, resp);

let r = J({ id: "x", query: "q", expectedRoute: "HOLIDAY", expectedCount: { of: "holidays", n: 2 }, rowHas: [["2026-03-03"], ["2026-03-04"]] }, ok(holidayList));
t("judge: PASS with route + count + rows", r.outcome === "PASS" && !r.routeOnly && r.checked.slice().sort().join() === "count,route,rows", JSON.stringify(r));
r = J({ id: "x", query: "q", expectedRoute: "HOLIDAY" }, ok(holidayList));
t("judge: route-only PASS is flagged", r.outcome === "PASS" && r.routeOnly === true);
r = J({ id: "x", query: "q", expectedRoute: "HOLIDAY", expectedCount: { of: "holidays", n: 8 } }, ok(holidayList));
t("judge: wrong count -> FAIL engine", r.outcome === "FAIL" && r.failLabel === "engine" && /expected 8, got 2/.test(r.notes.join()));
r = J({ id: "x", query: "q", expectedRoute: "EMP-SQL" }, ok(holidayList));
t("judge: wrong route -> FAIL route", r.outcome === "FAIL" && r.failLabel === "route");
r = J({ id: "x", query: "q", expectedRoute: "EMP-SQL", expectedFacts: ["nonexistent"] }, ok(holidayList));
t("judge: route label wins over engine label", r.failLabel === "route");
r = J({ id: "x", query: "q", expectedRoute: "HOLIDAY", forbiddenFacts: [["Holi"]] }, ok(holidayList));
t("judge: forbidden text -> FAIL", r.outcome === "FAIL" && /forbidden/.test(r.notes.join()));
r = J({ id: "x", query: "q", expectedRoute: "BAD-QUERY", expectedFacts: ["dd/mm/yyyy"] }, ok(badQuery));
t("judge: bad query with fact", r.outcome === "PASS");
r = J({ id: "x", query: "q", expectedRoute: "NOT-FOUND" }, ok([]));
t("judge: empty list satisfies NOT-FOUND", r.outcome === "PASS" && r.route === "NONE");
r = J({ id: "x", query: "q", expectedRoute: "EMP-SQL" }, ok(legacy));
t("judge: legacy engine passes the route but is noted", r.outcome === "PASS" && r.via === "legacy" && /old rule-based engine/.test(r.notes.join()));
r = J({ id: "x", query: "q", expectedRoute: "CIRCULAR", circular: { expect: [49, 51], topIs: 49 } }, ok(circularList));
t("judge: circular rules applied on a circular list", r.outcome === "PASS" && r.checked.includes("circulars"));
r = J({ id: "x", query: "q", expectedRoute: "CIRCULAR", circular: { expect: [99] } }, ok(circularList));
t("judge: circular rule failure -> engine", r.outcome === "FAIL" && r.failLabel === "engine");
r = J({ id: "x", query: "q", expectedRoute: ["CIRCULAR", "HEALTH-SQL"], circular: { expect: [99] } }, ok(healthTable));
t("judge: circular rules skipped when another accepted route answered", r.outcome === "PASS" && !r.checked.includes("circulars"));
r = J({ id: "x", query: "q", expectedRoute: "EDS", run: { mode: "intellectual", ticket: "$EXEC" }, expectedFacts: ["14,999"], forbiddenFacts: [["74,999"]] }, ok(synth));
t("judge: EDS pass", r.outcome === "PASS" && r.runMode === "intellectual" && r.ticketSent);
r = J({ id: "x", query: "q", expectedRoute: "EDS", run: { mode: "intellectual", ticket: "$EXEC" } }, ok(circularList));
t("judge: EDS downgraded is explained", r.outcome === "FAIL" && /downgraded/.test(r.notes.join()));
r = J({ id: "x", query: "q", expectedRoute: "NOT-FOUND", pendingDecision: "label proposed" }, ok(empPeople));
t("judge: pending decision is observed, never failed", r.outcome === "OBSERVED");
r = J({ id: "x", query: "q", expectedRoute: "ANY", info: true }, ok(circularList));
t("judge: info records are INFO", r.outcome === "INFO");
r = J({ id: "x", query: "q", expectedRoute: "HOLIDAY" }, { status: 503, json: { error: "search_unavailable" }, text: "{}", ms: 62000 });
t("judge: HTTP 503 -> ERROR", r.outcome === "ERROR" && r.failLabel === "error");
r = J({ id: "x", query: "q", expectedRoute: "HOLIDAY" }, { status: 0, json: null, text: "", ms: 75000, error: "timeout after 75s" });
t("judge: timeout -> ERROR", r.outcome === "ERROR" && /timeout/.test(r.notes.join()));
r = J({ id: "x", query: "q", expectedRoute: "EMP-SQL" }, ok(empPeople));
t("judge: a no-ticket request that returns sailPNo is recorded", r.leaksSailPNo === true);
r = J({ id: "x", query: "q", expectedRoute: "EMP-SQL", run: { ticket: "498301" } }, ok(empPeople));
t("judge: ... but not when a ticket was sent", r.leaksSailPNo === false);
r = J({ id: "x", query: "q", expectedRoute: "ANY" }, { status: 200, text: "The AI model's free daily allowance for openai/gpt-oss-120b is used up, so questions cannot be answered", json: { analytics: { kind: "clarify", answer: "x", source: "nl2sql" } }, ms: 10 });
t("judge: daily limit text is detected and is an ERROR (so --resume repeats it)", r.dailyLimit === true && r.outcome === "ERROR");
t("judge: the result carries no personal data", !JSON.stringify(J({ id: "x", query: "q", expectedRoute: "EMP-SQL" }, ok(empPeople))).includes("B001022"));

// ---------------------------------------------------------------- statistics and comparison
eq("percentile", percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 50), 5);
eq("percentile p95", percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95), 10);
const resA = [
  { id: "1", outcome: "PASS", route: "HOLIDAY", ms: 400, regression: true, area: "holiday" },
  { id: "2", outcome: "FAIL", failLabel: "route", route: "CIRCULAR", ms: 5000, area: "employee" },
  { id: "3", outcome: "PASS", route: "EMP-SQL", ms: 4000, answerSource: "nl2sql", attempts: 2, area: "employee", routeOnly: true },
  { id: "4", outcome: "OBSERVED", route: "CLARIFY", ms: 100, area: "probe" },
];
const resB = [
  { id: "1", outcome: "FAIL", failLabel: "engine", route: "HOLIDAY", ms: 500, regression: true, area: "holiday" },
  { id: "2", outcome: "PASS", route: "EMP-SQL", ms: 3000, area: "employee" },
  { id: "3", outcome: "PASS", route: "EMP-SQL", ms: 3500, area: "employee" },
];
const sm = summarize(resA);
t("summary totals", sm.totals.pass === 2 && sm.totals.fail === 1 && sm.totals.observed === 1 && sm.totals.passRouteOnly === 1);
t("summary pass rate ignores observed", Math.abs(sm.totals.passRate - 2 / 3) < 1e-9);
t("summary regression", sm.regression.n === 1 && sm.regression.pass === 1);
eq("summary model calls lower bound", sm.modelCallsLowerBound, 1 + 2 + 1);
const cmp = compareRuns({ results: resA }, { results: resB });
t("compare: regressed", cmp.changes.regressed.join() === "1");
t("compare: fixed", cmp.changes.fixed.join() === "2");
t("compare: route changed", cmp.changes.routeChanged.some((x) => x.id === "2" && x.to === "EMP-SQL"));
const md = renderReport({ meta: { tag: "t", base: "http://x", startedAt: "s", finishedAt: "f" }, results: resB, skipped: [{ id: "9", why: "--no-model" }] });
t("report renders the failure and the skip", /ENGINE/.test(md) && /--no-model/.test(md) && /BROKEN: 1/.test(md));

// ---------------------------------------------------------------- the set itself
const SET = JSON.parse(readFileSync(new URL("../eval/router-acceptance.json", import.meta.url), "utf8"));
const ids = new Set();
const ROUTES = new Set(["HOLIDAY", "EMP-SQL", "HEALTH-SQL", "CIRCULAR", "POLICY", "EDS", "BAD-QUERY", "NOT-FOUND", "ANY"]);
let setProblems = 0;
const bad = (m) => { setProblems++; console.log(`SET: ${m}`); };
for (const rec of SET.records) {
  if (!rec.id || !rec.query) bad(`record without id/query: ${JSON.stringify(rec).slice(0, 60)}`);
  if (ids.has(rec.id)) bad(`duplicate id ${rec.id}`);
  ids.add(rec.id);
  for (const x of [].concat(rec.expectedRoute ?? [])) if (!ROUTES.has(x)) bad(`${rec.id}: unknown route ${x}`);
  if (rec.expectedRoute === undefined) bad(`${rec.id}: no expectedRoute (use "ANY")`);
  if (rec.expectedCount && !["count", "rows", "people", "holidays", "details", "results"].includes(rec.expectedCount.of)) bad(`${rec.id}: bad expectedCount.of`);
  if (rec.expectedCount && !Number.isInteger(rec.expectedCount.n)) bad(`${rec.id}: expectedCount.n`);
  if (rec.rowHas && !rec.rowHas.every((row) => Array.isArray(row) && row.length)) bad(`${rec.id}: rowHas must be a list of token lists`);
  if (rec.run && (rec.run.mode !== "intellectual" || !rec.run.ticket)) bad(`${rec.id}: run block`);
  if (rec.run && !(rec.expectedRoute === "EDS")) bad(`${rec.id}: an intellectual run must expect EDS`);
  if (rec.regression && rec.lastKnown !== "✅") bad(`${rec.id}: only ✅ records belong to the regression set`);
  if (/\p{Cc}/u.test(rec.query)) bad(`${rec.id}: control character in the query`);
  if (rec.circular) {
    const ok2 = new Set(["expect", "ok", "forbid", "notAbove", "topIs", "expectType", "expectAny"]);
    for (const k of Object.keys(rec.circular)) if (!ok2.has(k)) bad(`${rec.id}: unknown circular key ${k}`);
  }
}
t("the set has no structural problems", setProblems === 0, `${setProblems} problem(s)`);
t("the set has the regression records", SET.records.filter((x) => x.regression).length >= 20);
t("the set carries every source", ["A", "B", "K", "H", "F", "HC", "S", "CB", "G"].every((s) => SET.records.some((x) => x.source === s)));
const q = new Map();
for (const rec of SET.records) { const k = norm(rec.query); if (q.has(k)) bad(`same question twice: ${q.get(k)} and ${rec.id}`); q.set(k, rec.id); }
t("no question appears twice", setProblems === 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail || setProblems ? 1 : 0);

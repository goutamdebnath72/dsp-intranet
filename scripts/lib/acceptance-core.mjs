// scripts/lib/acceptance-core.mjs
//
// The PURE part of the omnibar acceptance harness: no network, no files. Everything here is unit-tested by
// scripts/omnibar-acceptance.selftest.mjs, so the judge can be trusted before it judges the app.
//
// What it does, for one question and the JSON the real /api/ai-search returned:
//   1. inferRoute()   -- which channel answered (the API does not say, so it is read from the shape of the answer)
//   2. judge()        -- compares route + facts (+ the circular battery's rules) with the record's expectations
//   3. labels a failure the way HANDOFF_dsp-intranet_front-path.md asks: ROUTE (wrong channel) or ENGINE (right
//      channel, wrong content). DISPLAY cannot be judged by a script: it stays for human eyes.

// ---------------------------------------------------------------------------------------------- text helpers
export const norm = (s) => String(s ?? "").toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, " ").trim();
const padded = (s) => ` ${norm(s)} `;

// keys never searched and never written to a result file
const SKIP_KEYS = new Set(["sql", "display", "logId", "userKey", "confidence", "sailPNo", "mobileMasked", "emailMasked"]);

/** Every string / number in the answer, as one normalised, searchable text. */
export function flattenText(node) {
  const parts = [];
  const walk = (v, key) => {
    if (v === null || v === undefined) return;
    if (key && SKIP_KEYS.has(key)) return;
    if (typeof v === "string" || typeof v === "number") parts.push(String(v));
    else if (Array.isArray(v)) v.forEach((x) => walk(x));
    else if (typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, k);
  };
  walk(node);
  return padded(parts.join(" ¦ "));
}

/** A fact is a string (must appear as whole words) or an array of alternatives (any one is enough). */
export function hasFact(hay, fact) {
  const alts = Array.isArray(fact) ? fact : [fact];
  return alts.some((a) => {
    const n = norm(a);
    return n.length > 0 && hay.includes(` ${n} `);
  });
}

/** The answer with everything personal removed, for files written to disk. */
export function sanitize(node) {
  if (Array.isArray(node)) return node.map(sanitize);
  if (node && typeof node === "object") {
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      if (k === "sailPNo" || k === "mobileMasked" || k === "emailMasked") continue;
      out[k] = sanitize(v);
    }
    return out;
  }
  return node;
}

/** True when the answer carries a person's SAIL P.No. (which is also the login password: security audit #1). */
export function containsSailPNo(node) {
  if (Array.isArray(node)) return node.some(containsSailPNo);
  if (node && typeof node === "object") {
    return Object.entries(node).some(([k, v]) => (k === "sailPNo" && v) || containsSailPNo(v));
  }
  return false;
}

// ---------------------------------------------------------------------------------------------- rows
/** Every "row" the answer shows (table row, person, holiday, quota, circular...) as a list of normalised cells. */
export function extractRows(payload) {
  const rows = [];
  const add = (...cells) => {
    const c = cells.flat().filter((v) => v !== null && v !== undefined && v !== "").map(norm).filter(Boolean);
    if (c.length) rows.push(c);
  };
  const a = payload && !Array.isArray(payload) ? payload.analytics : null;
  if (a) {
    for (const r of a.nl2sql?.table?.rows ?? []) add(Object.values(r));
    for (const p of a.people ?? []) add(p.name, p.ticketNo, p.designation, p.department, p.departmentCode, p.designationCode, (p.extraFields ?? []).map((f) => f.value));
    for (const h of a.holidays ?? []) add(h.name, h.aliases ?? [], h.type, h.date, h.categories);
    for (const d of a.holidayDetails ?? []) for (const e of d.entries ?? []) add(d.name, d.aliases ?? [], e.date, e.dateLabel, e.weekday, e.type, e.typeLabel, e.audience);
    for (const r of a.rows ?? []) add(Object.values(r));
    for (const q of a.rhQuotaByCategory ?? []) add(q.category, q.quota);
    for (const t of a.typeBreakdown ?? []) add(t.type, t.label, t.count);
    if (a.holidayCompare) {
      // the year-comparison card: one row per year tile, one per type
      for (const y of a.holidayCompare.years ?? []) add(a.holidayCompare.title, y.year, y.total, y.caption);
      for (const r of a.holidayCompare.rows ?? []) add(r.type, r.label, r.a, r.b, r.change);
    }
  }
  const results = Array.isArray(payload) ? payload : payload?.results ?? [];
  for (const r of results) add(r.type, r.id, r.headline);
  return rows;
}

function cellMatches(cell, tokenNorm) {
  if (cell === tokenNorm) return true;
  return tokenNorm.length >= 4 && ` ${cell} `.includes(` ${tokenNorm} `);
}

/** `rowHas` = list of rows; each row = list of tokens (string, or array of alternatives) that must all appear in ONE row. */
export function rowHasMatch(rows, tokens) {
  return rows.some((cells) =>
    tokens.every((t) => {
      const alts = (Array.isArray(t) ? t : [t]).map(norm).filter(Boolean);
      return alts.some((alt) => cells.some((c) => cellMatches(c, alt)));
    }),
  );
}

/** The number the answer reports, measured the way the record says (`of`). null = the answer has no such number. */
export function measureCount(payload, of) {
  const a = payload && !Array.isArray(payload) ? payload.analytics : null;
  switch (of) {
    case "count":
      return typeof a?.count === "number" ? a.count : null;
    case "rows": {
      const t = a?.nl2sql?.table;
      return t ? (typeof t.total === "number" ? t.total : t.rows?.length ?? null) : null;
    }
    case "people":
      return typeof a?.count === "number" ? a.count : a?.people ? a.people.length : null;
    case "holidays":
      return a?.holidays ? a.holidays.length : null;
    case "details":
      return a?.holidayDetails ? a.holidayDetails.length : null;
    case "results": {
      const r = Array.isArray(payload) ? payload : payload?.results;
      return Array.isArray(r) ? r.length : null;
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------------------------- route
/**
 * Which channel answered. The API does not say, so it is read from the answer:
 *   array            -> CIRCULAR (or POLICY when the first hit is a holiday-policy note; NONE when empty)
 *   {synthesis}      -> EDS
 *   {analytics}      -> BAD-QUERY (kind error) | HOLIDAY | HEALTH-SQL / EMP-SQL (model SQL, legacy engine) | CLARIFY
 */
export function inferRoute(payload) {
  if (payload === null || payload === undefined) return { route: "ERROR" };
  const listRoute = (list) => (!list.length ? { route: "NONE" } : { route: list[0]?.type === "holiday" ? "POLICY" : "CIRCULAR", topTypes: list.slice(0, 5).map((r) => r.type) });
  if (Array.isArray(payload)) return listRoute(payload);
  if (payload.synthesis) return { route: "EDS" };
  const a = payload.analytics;
  if (a) {
    const extra = { kind: a.kind, source: a.source, attempts: a.nl2sql?.attempts, serverMs: a.nl2sql?.elapsedMs };
    if (a.kind === "error") return { route: "BAD-QUERY", ...extra };
    if (a.source === "holiday" || (!a.source && (a.holidays || a.holidayDetails))) return { route: "HOLIDAY", ...extra };
    const sql = String(a.nl2sql?.sql ?? "");
    if (a.source === "legacy") return { route: "EMP-SQL", via: "legacy", ...extra };
    if (a.source === "nl2sql" || a.source === "cache") {
      if (/\bhealth_checkups\b/i.test(sql)) return { route: "HEALTH-SQL", ...extra };
      if (a.kind === "clarify" && !sql) return { route: "CLARIFY", ...extra };
      return { route: "EMP-SQL", ...extra };
    }
    if (a.kind === "clarify") return { route: "CLARIFY", ...extra };
    return { route: "UNKNOWN-ANSWER", ...extra };
  }
  if (Array.isArray(payload.results)) return listRoute(payload.results);
  if (payload.error) return { route: "ERROR" };
  return { route: "UNKNOWN" };
}

/** `expected` = one route, a list of acceptable routes, or "ANY". NOT-FOUND is satisfied by an empty list or a clarify/"cannot answer" card. */
export function routeMatches(expected, actual) {
  if (expected === undefined || expected === null || expected === "ANY") return true;
  const list = Array.isArray(expected) ? expected : [expected];
  return list.some((e) => e === "ANY" || e === actual || (e === "NOT-FOUND" && (actual === "NONE" || actual === "CLARIFY")));
}

// ---------------------------------------------------------------------------------------------- the circular battery's rules
// Ported from scripts/circular-battery.mjs (evaluate()), so the verified circular cases keep their exact meaning.
export function evaluateCircular(c, payload) {
  const list = Array.isArray(payload) ? payload : payload?.results ?? [];
  const rows = list.map((r, i) => ({ pos: i + 1, type: r.type, id: Number(r.id) }));
  const circ = rows.filter((r) => r.type === "circular");
  const posOf = (id) => circ.find((x) => x.id === id)?.pos ?? null;
  const notes = [];
  const expect = c.expect || [];
  const best = expect.map(posOf).filter((p) => p !== null);
  const bestPos = best.length ? Math.min(...best) : null;
  const ok = new Set([...(c.ok || []), ...expect]);
  const noise = circ.filter((r) => !ok.has(r.id)).length + list.filter((r) => r.type === "announcement").length;

  if (c.expectAny) {
    const hit = c.expectAny.map(posOf).filter((p) => p !== null);
    if (!hit.length) notes.push(`none of circulars ${c.expectAny.join("/")} was returned`);
    return { pass: notes.length === 0, notes, noise };
  }
  for (const id of expect) if (posOf(id) === null) notes.push(`missing circular ${id}`);
  for (const id of c.forbid || []) if (posOf(id) !== null) notes.push(`forbidden circular ${id} is present at #${posOf(id)}`);
  if (!c.expectType) {
    for (const id of c.notAbove || []) {
      const p = posOf(id);
      if (p !== null && (bestPos === null || p < bestPos)) notes.push(`circular ${id} (#${p}) ranks above the correct answer${bestPos ? ` (#${bestPos})` : ""}`);
    }
  }
  if (c.topIs) {
    const r0 = rows[0];
    if (!(r0 && r0.type === "circular" && r0.id === c.topIs)) notes.push(`expected circular ${c.topIs} at #1, got ${r0 ? `${r0.type} ${r0.id}` : "nothing"}`);
  }
  if (c.expectType) {
    const first = rows.find((r) => r.type === c.expectType);
    if (!first) notes.push(`no '${c.expectType}' result returned`);
    else for (const id of c.notAbove || []) {
      const p = posOf(id);
      if (p !== null && p < first.pos) notes.push(`circular ${id} ranks above the ${c.expectType} answer`);
    }
  }
  return { pass: notes.length === 0, notes, noise };
}

// ---------------------------------------------------------------------------------------------- the server's own trace
/**
 * Since step 23a the route names itself in response headers (src/lib/search/frontPathTrace.ts): which route answered,
 * how many model calls and tokens it used, and how long each stage took. `headers` = a plain object with LOWER-CASE keys.
 * Returns null for a server that does not send them (an older build): the harness then falls back to inferring.
 */
export function parseTraceHeaders(headers) {
  const h = headers || {};
  if (!h["x-omni-route"]) return null;
  const num = (k) => (h[k] !== undefined && h[k] !== "" && Number.isFinite(Number(h[k])) ? Number(h[k]) : null);
  const steps = {};
  for (const part of String(h["server-timing"] || "").split(",")) {
    const m = part.trim().match(/^([\w-]+);dur=([0-9.]+)$/);
    if (m && m[1] !== "total") steps[m[1]] = Number(m[2]);
  }
  return {
    route: String(h["x-omni-route"]),
    kind: h["x-omni-kind"] ? String(h["x-omni-kind"]) : null,
    /** The front-path gate's decision (step 24a): skipped | model | fallback; null when the gate is off. */
    gate: h["x-omni-gate"] ? String(h["x-omni-gate"]) : null,
    /** The synthesis-intent verdict (step 26a), "level;score", e.g. "synthesis;6". null when the server did not ask. */
    synth: h["x-omni-synth"] ? String(h["x-omni-synth"]) : null,
    ms: num("x-omni-ms"),
    modelCalls: num("x-omni-model-calls"),
    tokens: num("x-omni-tokens"),
    promptTokens: num("x-omni-tokens-prompt"),
    completionTokens: num("x-omni-tokens-completion"),
    waitedMs: num("x-omni-waited-ms"),
    steps,
  };
}

/** Does the harness's INFERRED route agree with the route the server says it took? (a check on the inference itself) */
export function routesAgree(serverRoute, serverKind, inferred) {
  switch (serverRoute) {
    case "holiday": return inferred === "HOLIDAY" || inferred === "BAD-QUERY";
    case "nl2sql":
    case "cache": return inferred === "EMP-SQL" || inferred === "HEALTH-SQL" || inferred === "CLARIFY";
    case "legacy": return inferred === "EMP-SQL" || inferred === "BAD-QUERY";
    case "circular": return inferred === "CIRCULAR" || inferred === "POLICY";
    case "none": return inferred === "NONE" || inferred === "CLARIFY";
    case "eds": return inferred === "EDS";
    case "error": return inferred === "ERROR";
    default: return true; // title / unknown / analytics: nothing to compare
  }
}

// ---------------------------------------------------------------------------------------------- the judge
export const DAILY_LIMIT = /free daily allowance .{0,120}is used up/i;

/**
 * resp = { status, json, text, ms, error }  -> the result record written to the report.
 * outcome: PASS | FAIL | ERROR | OBSERVED (pending decision / no expectation yet) | INFO
 */
export function judge(rec, resp) {
  const run = rec.run || {};
  const base = {
    id: rec.id,
    query: rec.query,
    area: rec.area,
    source: rec.source,
    lastKnown: rec.lastKnown ?? null,
    regression: !!rec.regression,
    expectedRoute: rec.expectedRoute ?? null,
    runMode: run.mode || "semantic",
    ticketSent: !!run.ticket,
    ms: resp.ms ?? null,
    httpStatus: resp.status ?? 0,
    timeSensitive: rec.timeSensitive || null,
    pendingDecision: rec.pendingDecision || null,
  };
  const text = typeof resp.text === "string" ? resp.text : "";
  const trace = parseTraceHeaders(resp.headers);
  if (trace) {
    base.serverRoute = trace.route;
    base.gate = trace.gate;
    base.synth = trace.synth;
    base.serverMs = trace.ms;
    base.modelCalls = trace.modelCalls;
    base.tokens = trace.tokens;
    base.promptTokens = trace.promptTokens;
    base.waitedMs = trace.waitedMs;
    base.steps = trace.steps;
  }
  if (DAILY_LIMIT.test(text)) {
    // not an answer: the model's allowance ran out. Recorded as an ERROR so that --resume asks the question again.
    return { ...base, dailyLimit: true, route: "ERROR", outcome: "ERROR", failLabel: "error", checked: [], notes: ["the model's free daily allowance is used up: this question was not really answered and will be asked again on --resume"], answerText: "" };
  }

  if (resp.error || resp.json === null || resp.json === undefined || (resp.status && resp.status >= 400)) {
    return { ...base, route: "ERROR", outcome: "ERROR", failLabel: "error", checked: [], notes: [resp.error || `HTTP ${resp.status}`], answerText: String(text).slice(0, 200) };
  }

  const payload = resp.json;
  const inf = inferRoute(payload);
  const notes = [];
  const checked = [];
  if (trace && !routesAgree(trace.route, trace.kind, inf.route)) {
    base.routeDisagreement = `server says '${trace.route}${trace.kind ? `/${trace.kind}` : ""}', the answer's shape says ${inf.route}`;
    notes.push(`harness check: ${base.routeDisagreement}`);
  }
  let failLabel = null;

  // 1. route
  let routeOk = true;
  if (rec.expectedRoute !== undefined && rec.expectedRoute !== "ANY") {
    checked.push("route");
    routeOk = routeMatches(rec.expectedRoute, inf.route);
    if (!routeOk) notes.push(`route: expected ${[].concat(rec.expectedRoute).join(" or ")}, got ${inf.route}${inf.via ? ` (via ${inf.via})` : ""}`);
  }
  if (inf.via === "legacy") notes.push("answered by the old rule-based engine (the model path failed or declined)");
  // a route that must NEVER answer this request (the security probes: synthesis without a login)
  const forbidden = [].concat(rec.forbiddenRoutes ?? []);
  if (forbidden.length) {
    if (!checked.includes("route")) checked.push("route");
    if (forbidden.includes(inf.route)) {
      routeOk = false;
      notes.push(`SECURITY: the server answered with ${inf.route}, which this request must never get`);
    }
  }
  if (run.mode === "intellectual" && (run.auth ?? "exec") !== "none" && inf.route !== "EDS") {
    notes.push("asked for synthesis as a logged-in executive but did not get it: is the --cookie a valid, current session of an executive (ticket 4xxxxx, still in the directory)?");
  }

  // 2. content
  const contentFails = [];
  const hay = flattenText(payload);
  const rows = extractRows(payload);

  if (rec.expectedFacts?.length) {
    checked.push("facts");
    for (const f of rec.expectedFacts) if (!hasFact(hay, f)) contentFails.push(`missing fact: ${Array.isArray(f) ? f.join(" | ") : f}`);
  }
  if (rec.forbiddenFacts?.length) {
    checked.push("forbidden");
    for (const f of rec.forbiddenFacts) if (hasFact(hay, f)) contentFails.push(`forbidden text present: ${Array.isArray(f) ? f.join(" | ") : f}`);
  }
  if (rec.rowHas?.length) {
    checked.push("rows");
    for (const r of rec.rowHas) if (!rowHasMatch(rows, r)) contentFails.push(`no row has: ${r.map((t) => (Array.isArray(t) ? t.join("|") : t)).join(" + ")}`);
  }
  if (rec.expectedCount) {
    checked.push("count");
    const got = measureCount(payload, rec.expectedCount.of);
    const ec = rec.expectedCount;
    const want = typeof ec.n === "number" ? `${ec.n}` : [typeof ec.min === "number" ? `at least ${ec.min}` : "", typeof ec.max === "number" ? `at most ${ec.max}` : ""].filter(Boolean).join(" and ");
    if (got === null) contentFails.push(`count: the answer has no '${ec.of}' number (expected ${want})`);
    else if (typeof ec.n === "number" && got !== ec.n) contentFails.push(`count (${ec.of}): expected ${ec.n}, got ${got}`);
    else if (typeof ec.min === "number" && got < ec.min) contentFails.push(`count (${ec.of}): expected at least ${ec.min}, got ${got}`);
    else if (typeof ec.max === "number" && got > ec.max) contentFails.push(`count (${ec.of}): expected at most ${ec.max}, got ${got}`);
  }
  // the battery's circular rules apply only when the answer really is a list of documents
  if (rec.circular && (inf.route === "CIRCULAR" || inf.route === "POLICY")) {
    checked.push("circulars");
    const ev = evaluateCircular(rec.circular, payload);
    base.noise = ev.noise;
    for (const n of ev.notes) contentFails.push(n);
  }
  if (contentFails.length) notes.push(...contentFails);

  // the engine's own opinion on whether this is an EDS-type question (synthesisIntent.ts): every record says what it should be
  // (`synthesis: true`) and EVERY OTHER record must NOT be taken for one. Only asked of servers that report it.
  let intentFail = null;
  const intentLevel = trace?.synth ? trace.synth.split(";")[0] : null;
  if (intentLevel) {
    const wants = rec.synthesis === true;
    if (wants && intentLevel !== "synthesis") intentFail = `synthesis intent: this should be recognised as an EDS-type question, the engine says '${trace.synth}'`;
    if (!wants && intentLevel === "synthesis") intentFail = `synthesis intent: this is NOT an EDS-type question, but the engine says '${trace.synth}'`;
    if (intentFail) notes.push(intentFail);
  }

  if (!routeOk || intentFail) failLabel = "route";
  else if (contentFails.length) failLabel = "engine";

  let outcome;
  if (rec.pendingDecision) outcome = "OBSERVED";
  else if (rec.info) outcome = "INFO";
  else outcome = failLabel ? "FAIL" : "PASS";

  // a short, personal-data-free description of what came back
  const a = payload && !Array.isArray(payload) ? payload.analytics : null;
  const answerText = a
    ? String(a.answer ?? a.lead ?? "").replace(/\s+/g, " ").slice(0, 240)
    : payload.synthesis
      ? String(payload.synthesis.overview ?? "").replace(/\s+/g, " ").slice(0, 240)
      : "";
  const top = (Array.isArray(payload) ? payload : payload.results ?? []).slice(0, 5).map((r) => ({ type: r.type, id: r.id, pct: r.matchPercentage ?? null, headline: String(r.headline ?? "").slice(0, 70) }));

  return {
    ...base,
    route: inf.route,
    via: inf.via ?? null,
    kind: inf.kind ?? null,
    answerSource: inf.source ?? null,
    attempts: inf.attempts ?? null,
    serverMs: base.serverMs ?? inf.serverMs ?? null,
    outcome,
    failLabel,
    routeOnly: checked.length === 1 && checked[0] === "route",
    checked,
    notes,
    answerText,
    top,
    // a ticket in the URL proves nothing since step 25a: only a login session counts as "signed in"
    leaksSailPNo: containsSailPNo(payload) && (run.auth ?? (run.mode === "intellectual" ? "exec" : "none")) === "none",
  };
}

// ---------------------------------------------------------------------------------------------- statistics
export function percentile(sorted, p) {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i];
}

export function summarize(results) {
  const by = (keyFn) => {
    const m = new Map();
    for (const r of results) {
      const k = keyFn(r);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    }
    return m;
  };
  const count = (rs, o) => rs.filter((r) => r.outcome === o).length;
  const judged = results.filter((r) => r.outcome === "PASS" || r.outcome === "FAIL");

  const totals = {
    total: results.length,
    pass: count(results, "PASS"),
    passRouteOnly: results.filter((r) => r.outcome === "PASS" && r.routeOnly).length,
    fail: count(results, "FAIL"),
    failRoute: results.filter((r) => r.failLabel === "route" && r.outcome === "FAIL").length,
    failEngine: results.filter((r) => r.failLabel === "engine" && r.outcome === "FAIL").length,
    error: count(results, "ERROR"),
    observed: count(results, "OBSERVED"),
    info: count(results, "INFO"),
  };
  totals.passRate = judged.length ? totals.pass / judged.length : null;

  const byArea = [...by((r) => r.area || "?")].map(([area, rs]) => ({ area, n: rs.length, pass: count(rs, "PASS"), fail: count(rs, "FAIL"), error: count(rs, "ERROR"), observed: count(rs, "OBSERVED") + count(rs, "INFO") }));

  const byRoute = [...by((r) => r.route || "?")].map(([route, rs]) => {
    const ms = rs.map((r) => r.ms).filter((v) => typeof v === "number").sort((a, b) => a - b);
    return { route, n: rs.length, p50: percentile(ms, 50), p95: percentile(ms, 95), max: ms.length ? ms[ms.length - 1] : null };
  });

  const regression = results.filter((r) => r.regression);
  return {
    totals,
    byArea,
    byRoute,
    regression: { n: regression.length, pass: count(regression, "PASS"), broken: regression.filter((r) => r.outcome === "FAIL" || r.outcome === "ERROR").map((r) => r.id) },
    leaksSailPNo: results.filter((r) => r.leaksSailPNo).length,
    modelCallsLowerBound: results.reduce((n, r) => {
      if (typeof r.modelCalls === "number") return n + r.modelCalls; // the server's own count
      if (r.route === "HOLIDAY" || r.route === "BAD-QUERY") return n;
      if (r.answerSource === "cache") return n;
      if (r.answerSource === "nl2sql" || r.answerSource === "legacy") return n + (r.attempts || 1);
      return n + 1; // circular / policy / none / EDS: at least the out_of_scope call (or the synthesis call)
    }, 0),
    traced: results.filter((r) => typeof r.tokens === "number").length,
    tokensTotal: results.reduce((n, r) => n + (typeof r.tokens === "number" ? r.tokens : 0), 0),
    waitedMsTotal: results.reduce((n, r) => n + (typeof r.waitedMs === "number" ? r.waitedMs : 0), 0),
    routeDisagreements: results.filter((r) => r.routeDisagreement).map((r) => r.id),
    synthesisFlagged: results.filter((r) => typeof r.synth === "string" && r.synth.startsWith("synthesis")).map((r) => r.id),
    gate: {
      skipped: results.filter((r) => r.gate === "skipped").length,
      model: results.filter((r) => r.gate === "model").length,
      fallback: results.filter((r) => r.gate === "fallback").length,
    },
    modelUse: modelUseByRoute(results),
    stagesByRoute: stagesByRoute(results),
  };
}

/** Model calls and tokens per route that answered (only questions the server traced). */
export function modelUseByRoute(results) {
  const m = new Map();
  for (const r of results) {
    if (typeof r.tokens !== "number") continue;
    const k = r.route || "?";
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return [...m].map(([route, rs]) => {
    const tok = rs.map((r) => r.tokens).sort((a, b) => a - b);
    return {
      route,
      n: rs.length,
      withModel: rs.filter((r) => (r.modelCalls || 0) > 0).length,
      modelCalls: rs.reduce((n, r) => n + (r.modelCalls || 0), 0),
      tokens: tok.reduce((a, b) => a + b, 0),
      tokensP50: percentile(tok, 50),
      waitedMs: rs.reduce((n, r) => n + (r.waitedMs || 0), 0),
    };
  });
}

/** Mean milliseconds per stage, per route (name checks, the omnibar engine, circular search, synthesis). */
export function stagesByRoute(results) {
  const m = new Map();
  for (const r of results) {
    if (!r.steps || !Object.keys(r.steps).length) continue;
    const k = r.route || "?";
    if (!m.has(k)) m.set(k, { n: 0, sum: {} });
    const e = m.get(k);
    e.n++;
    for (const [name, ms] of Object.entries(r.steps)) e.sum[name] = (e.sum[name] || 0) + ms;
  }
  return [...m].map(([route, e]) => ({ route, n: e.n, mean: Object.fromEntries(Object.entries(e.sum).map(([name, ms]) => [name, Math.round(ms / e.n)])) }));
}

/** What changed between two runs (ids present in both). */
export function compareRuns(a, b) {
  const A = new Map(a.results.map((r) => [r.id, r]));
  const changes = { regressed: [], fixed: [], routeChanged: [], stillFailing: [], onlyInA: [], onlyInB: [] };
  for (const r of b.results) {
    const o = A.get(r.id);
    if (!o) { changes.onlyInB.push(r.id); continue; }
    const wasOk = o.outcome === "PASS", isOk = r.outcome === "PASS";
    const isBad = r.outcome === "FAIL" || r.outcome === "ERROR";
    if (wasOk && isBad) changes.regressed.push(r.id);
    else if (!wasOk && isOk) changes.fixed.push(r.id);
    else if (!wasOk && isBad) changes.stillFailing.push(r.id);
    if (o.route !== r.route) changes.routeChanged.push({ id: r.id, from: o.route, to: r.route });
  }
  const inB = new Set(b.results.map((r) => r.id));
  for (const id of A.keys()) if (!inB.has(id)) changes.onlyInA.push(id);
  const sa = summarize(a.results), sb = summarize(b.results);
  const latency = [];
  for (const rb of sb.byRoute) {
    const ra = sa.byRoute.find((x) => x.route === rb.route);
    if (ra) latency.push({ route: rb.route, p50From: ra.p50, p50To: rb.p50, p95From: ra.p95, p95To: rb.p95 });
  }
  return { changes, latency, passRate: { from: sa.totals.passRate, to: sb.totals.passRate } };
}

// ---------------------------------------------------------------------------------------------- the written report
const sec = (ms) => (ms === null || ms === undefined ? "-" : `${(ms / 1000).toFixed(1)}s`);
const pct = (v) => (v === null || v === undefined ? "n/a" : `${(v * 100).toFixed(0)}%`);
export { sec, pct };

export function renderReport(run) {
  const s = summarize(run.results);
  const t = s.totals;
  const L = [];
  L.push(`# Omnibar acceptance run: ${run.meta.tag}`);
  L.push("");
  L.push(`- Base: ${run.meta.base}`);
  L.push(`- Started ${run.meta.startedAt}, finished ${run.meta.finishedAt ?? "(interrupted)"}${run.meta.stoppedBecause ? `, STOPPED: ${run.meta.stoppedBecause}` : ""}`);
  L.push(`- Test traffic in \`nl2sql_log\` and the server logs lies inside that window. The harness never calls the feedback endpoints, so nothing is "taught" to the learning loop.`);
  L.push(`- Questions: ${t.total}  |  PASS ${t.pass} (of which route-only ${t.passRouteOnly})  |  FAIL ${t.fail} (route ${t.failRoute}, engine ${t.failEngine})  |  ERROR ${t.error}  |  observed/info ${t.observed + t.info}`);
  L.push(`- Pass rate among judged questions: ${pct(t.passRate)}. A "route-only" pass proves the right channel answered, not that the content is right.`);
  if (s.traced) {
    L.push(`- Model calls: ${s.modelCallsLowerBound}, tokens used: ${s.tokensTotal.toLocaleString()}${s.waitedMsTotal ? `, time spent waiting for Groq's per-minute limit: ${sec(s.waitedMsTotal)}` : ""} (exact, from the server's own trace of ${s.traced} of ${t.total} answers).`);
  } else {
    L.push(`- Model calls (lower bound, inferred from the answers; this server does not send the step-23a trace headers): ${s.modelCallsLowerBound}`);
  }
  if (s.synthesisFlagged.length) L.push(`- The engine recognised ${s.synthesisFlagged.length} question(s) as EDS-type (synthesis intent): ${s.synthesisFlagged.join(", ")}.`);
  if (s.gate.skipped + s.gate.model + s.gate.fallback > 0) {
    L.push(`- Front-path gate is ON: it skipped the model for ${s.gate.skipped} question(s) (circular search answered first), asked it as before for ${s.gate.model}, and had to ask it after all for ${s.gate.fallback} (circular search found nothing or failed).`);
  }
  L.push(`- DISPLAY correctness is not judged here. Only the API is exercised (the screen's parallel people search is not).`);
  if (s.routeDisagreements.length) L.push(`- **Harness check failed for ${s.routeDisagreements.join(", ")}**: the server's route and the one inferred from the answer disagree (see the failure notes).`);
  L.push("");
  L.push(`## Regression set (records verified on screen before)`);
  L.push(`${s.regression.pass} of ${s.regression.n} pass.${s.regression.broken.length ? ` **BROKEN: ${s.regression.broken.join(", ")}**` : ""}`);
  L.push("");
  L.push(`## By area`);
  L.push(`| area | n | pass | fail | error | observed |`);
  L.push(`|---|---|---|---|---|---|`);
  for (const a of s.byArea) L.push(`| ${a.area} | ${a.n} | ${a.pass} | ${a.fail} | ${a.error} | ${a.observed} |`);
  L.push("");
  L.push(`## Latency by route that answered (wall clock at the client)`);
  L.push(`| route | n | p50 | p95 | max |`);
  L.push(`|---|---|---|---|---|`);
  for (const r of s.byRoute) L.push(`| ${r.route} | ${r.n} | ${sec(r.p50)} | ${sec(r.p95)} | ${sec(r.max)} |`);
  L.push("");
  if (s.modelUse.length) {
    L.push(`## Model use by route (exact, from the server's trace)`);
    L.push(`| route | n | used the model | model calls | tokens | tokens p50 | waited for Groq |`);
    L.push(`|---|---|---|---|---|---|---|`);
    for (const r of s.modelUse) L.push(`| ${r.route} | ${r.n} | ${r.withModel} | ${r.modelCalls} | ${r.tokens.toLocaleString()} | ${r.tokensP50} | ${r.waitedMs ? sec(r.waitedMs) : "-"} |`);
    L.push("");
  }
  if (s.stagesByRoute.length) {
    L.push(`## Where the time goes (mean per stage, server side)`);
    const names = [...new Set(s.stagesByRoute.flatMap((r) => Object.keys(r.mean)))];
    L.push(`| route | n | ${names.join(" | ")} |`);
    L.push(`|---|---|${names.map(() => "---").join("|")}|`);
    for (const r of s.stagesByRoute) L.push(`| ${r.route} | ${r.n} | ${names.map((n) => (r.mean[n] === undefined ? "-" : sec(r.mean[n]))).join(" | ")} |`);
    L.push("");
  }
  if (s.leaksSailPNo) {
    L.push(`## Security observation`);
    L.push(`${s.leaksSailPNo} answer(s) to requests sent WITHOUT a ticket contained a person's SAIL P.No. (\`sailPNo\`), which is also the login password (security audit #1). The harness removes it from every file it writes.`);
    L.push("");
  }
  const bad = run.results.filter((r) => r.outcome === "FAIL" || r.outcome === "ERROR");
  L.push(`## Failures (${bad.length})`);
  for (const label of ["route", "engine", "error"]) {
    const rs = bad.filter((r) => (r.failLabel || "error") === label);
    if (!rs.length) continue;
    L.push("");
    L.push(`### ${label.toUpperCase()} (${label === "route" ? "the front path sent it to the wrong channel" : label === "engine" ? "right channel, wrong or missing content" : "no usable answer"}): ${rs.length}`);
    for (const r of rs) {
      L.push(`- **${r.id}** ${r.regression ? "(REGRESSION) " : ""}${r.timeSensitive ? "(time-sensitive) " : ""}\`${r.query}\` -> ${r.route}, ${sec(r.ms)}`);
      for (const n of r.notes || []) L.push(`    - ${n}`);
    }
  }
  const obs = run.results.filter((r) => r.outcome === "OBSERVED" || r.outcome === "INFO");
  if (obs.length) {
    L.push("");
    L.push(`## Observed only (no pass/fail: pending decision or no expectation yet)`);
    for (const r of obs) {
      L.push(`- **${r.id}** \`${r.query}\` -> ${r.route}, ${sec(r.ms)}${r.pendingDecision ? `  [${r.pendingDecision}]` : ""}`);
      if (r.answerText) L.push(`    - ${r.answerText}`);
    }
  }
  const skipped = run.skipped || [];
  if (skipped.length) {
    L.push("");
    L.push(`## Not run (${skipped.length})`);
    const g = new Map();
    for (const x of skipped) g.set(x.why, [...(g.get(x.why) || []), x.id]);
    for (const [why, ids] of g) L.push(`- ${why}: ${ids.length > 12 ? `${ids.slice(0, 12).join(", ")} ... (${ids.length})` : ids.join(", ")}`);
  }
  L.push("");
  return L.join("\n");
}

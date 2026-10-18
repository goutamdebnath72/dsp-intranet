#!/usr/bin/env node
// scripts/queries.mjs - ONE PLACE for every question the omnibar must answer.
//
// The questions live in eval/router-acceptance.json (the file scripts/omnibar-acceptance.mjs also runs). This tool keeps that file and a readable
// checklist, eval/QUERIES.md, in step, so that you never edit 90 KB of JSON by hand and never keep a second list somewhere else.
//
//   node scripts/queries.mjs                      rewrite eval/QUERIES.md (the checklist: every question, what a correct answer is, its last known result)
//   node scripts/queries.mjs mark ID STATUS [--answer] [note ...]
//                                                 record a result after trying a question on screen. STATUS is one of: ok  fail  unknown  (or the symbols
//                                                 ✅ ❌ ❓ ✔ 📌). --answer records the ANSWER CARD's result (the card above the circular list) instead of the
//                                                 search result. The note gets today's date.
//   node scripts/queries.mjs add "the question" [--id ID] [--route CIRCULAR] [--area circular] [--facts "15,000|15000; 14,999|14999"] [--forbid "75,000; 74,999"]
//                                                 add a new question (nothing is added if the same words are already there). In --facts, ";" separates facts that
//                                                 must ALL appear and "|" separates alternative spellings of one fact. Facts given here are the ANSWER CARD's.
//   node scripts/queries.mjs find WORDS           which questions contain these words (and their ids)
//   node scripts/queries.mjs check                look for duplicate questions, repeated ids and malformed records
//   node scripts/queries.mjs import-session       a ONE-TIME step (safe to run twice): puts what the session of 17-18 Oct 2026 found into the set (see below)
//   node scripts/queries.mjs selftest             tests of this tool on a scratch copy; touches nothing
//
// An ANSWER CARD expectation sits in a record's  "answer": { "facts": [[..alternatives..], ..], "forbidden": [..], "status": "✅", "note": "..." }.
// The facts are what the card must show; they are meant for the answer stage of the acceptance run (to be added to scripts/omnibar-acceptance.mjs).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const SET = path.join(ROOT, "eval", "router-acceptance.json");
const MD = path.join(ROOT, "eval", "QUERIES.md");
const STATUS = { ok: "✅", fail: "❌", unknown: "❓", passed: "✔", computed: "📌", "✅": "✅", "❌": "❌", "❓": "❓", "✔": "✔", "📌": "📌" };
const norm = (s) => String(s ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const today = () => new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------- reading and writing the set (its own indentation is kept: no noisy diffs)
export function loadSet(file = SET) {
  const raw = fs.readFileSync(file, "utf8");
  const indent = (raw.match(/\n( +)"/) || [, " "])[1].length;
  const data = JSON.parse(raw);
  if (!Array.isArray(data.records)) throw new Error(`${file} has no "records" list`);
  return { data, indent, file };
}
export function saveSet(s) {
  fs.writeFileSync(s.file, JSON.stringify(s.data, null, s.indent) + "\n");
}

// ---------------------------------------------------------------- operations (pure on the loaded set, so they can be tested)
export function findByQuery(s, query) {
  const n = norm(query);
  return s.data.records.find((r) => norm(r.query) === n);
}
export function nextId(s, prefix) {
  const used = new Set(s.data.records.map((r) => r.id));
  for (let i = 1; i < 10000; i++) if (!used.has(`${prefix}-${i}`)) return `${prefix}-${i}`;
  throw new Error("no free id");
}
export function parseFacts(text) {
  return String(text ?? "").split(";").map((f) => f.trim()).filter(Boolean).map((f) => f.split("|").map((a) => a.trim()).filter(Boolean)).map((alts) => (alts.length === 1 ? alts : alts));
}
export function addQuery(s, query, opts = {}) {
  const have = findByQuery(s, query);
  if (have) return { added: false, id: have.id };
  const id = opts.id || nextId(s, opts.source || "USER");
  if (s.data.records.some((r) => r.id === id)) throw new Error(`the id ${id} is already used`);
  const rec = { id, query: String(query).trim(), area: opts.area || "circular", expectedRoute: opts.route || "ANY", source: opts.source || "user", lastKnown: "❓" };
  const facts = opts.facts ? parseFacts(opts.facts) : [];
  const forbidden = opts.forbid ? String(opts.forbid).split(";").map((x) => x.trim()).filter(Boolean) : [];
  if (facts.length || forbidden.length) rec.answer = { facts, forbidden, status: "❓", note: `added ${today()}` };
  s.data.records.push(rec);
  return { added: true, id };
}
export function markResult(s, id, status, note, answer = false) {
  const r = s.data.records.find((x) => x.id === id);
  if (!r) throw new Error(`no question with the id ${id} (try:  node scripts/queries.mjs find WORDS)`);
  const sym = STATUS[status];
  if (!sym) throw new Error(`unknown status "${status}": use ok, fail, unknown (or ✅ ❌ ❓)`);
  const stamp = note ? `${today()}: ${note}` : today();
  if (answer) {
    r.answer = r.answer || { facts: [], forbidden: [] };
    r.answer.status = sym;
    r.answer.note = r.answer.note ? `${r.answer.note} | ${stamp}` : stamp;
  } else {
    r.lastKnown = sym;
    r.notes = r.notes ? `${r.notes} | ${stamp}` : stamp;
  }
  return r;
}
export function checkSet(s) {
  const problems = [];
  const ids = new Map(), qs = new Map();
  for (const r of s.data.records) {
    if (!r.id || !r.query) problems.push(`a record has no id or no query: ${JSON.stringify(r).slice(0, 80)}`);
    if (ids.has(r.id)) problems.push(`the id ${r.id} is used twice`);
    ids.set(r.id, true);
    const n = norm(r.query);
    if (qs.has(n) && qs.get(n) !== r.id) {
      const other = s.data.records.find((x) => x.id === qs.get(n));
      // the same words may be asked in two MODES on purpose (the plain search and the synthesis button); that is not a duplicate
      if (JSON.stringify(other?.run ?? null) === JSON.stringify(r.run ?? null)) problems.push(`the same question is in ${qs.get(n)} and ${r.id}`);
    } else qs.set(n, r.id);
    if (r.answer) {
      if (!Array.isArray(r.answer.facts)) problems.push(`${r.id}: answer.facts must be a list`);
      else for (const f of r.answer.facts) if (!Array.isArray(f) || !f.length) problems.push(`${r.id}: each answer fact must be a list of alternative spellings`);
      if (r.answer.forbidden && !Array.isArray(r.answer.forbidden)) problems.push(`${r.id}: answer.forbidden must be a list`);
    }
  }
  return problems;
}

// ---------------------------------------------------------------- the checklist (generated: edit the JSON, not this file)
const AREA_ORDER = ["circular", "eds", "policy", "employee", "health", "holiday"];
const cell = (t, max = 150) => String(t ?? "").replace(/\s+/g, " ").replace(/\|/g, "/").slice(0, max);
const factsText = (f) => (Array.isArray(f) ? f.map((x) => (Array.isArray(x) ? x.join(" / ") : x)).join("; ") : "");
export function buildMarkdown(s) {
  const recs = s.data.records;
  const count = (fn) => recs.filter(fn).length;
  const L = [];
  L.push("# The questions: one place", "");
  L.push("GENERATED by `node scripts/queries.mjs` from `eval/router-acceptance.json`. **Edit the JSON (or use the commands below), not this file.**", "");
  L.push(`**${recs.length} questions.** Result of the last time each was tried: ✅ ${count((r) => r.lastKnown === "✅")} verified on screen | ✔ ${count((r) => r.lastKnown === "✔")} passed in an earlier session | 📌 ${count((r) => r.lastKnown === "📌")} expected answer computed from the data | ❌ ${count((r) => r.lastKnown === "❌")} failed | ❓ ${count((r) => !["✅", "✔", "📌", "❌"].includes(r.lastKnown))} not tried or not recorded. ` +
    `${count((r) => r.answer)} have an ANSWER CARD expectation.`, "");
  L.push("Try a question: type it into the omnibar, compare with the expected facts, then record it:", "",
    "```", `node scripts/queries.mjs mark ID ok --answer "what you saw"`, `node scripts/queries.mjs mark ID fail --answer "what was wrong"`, `node scripts/queries.mjs add "a new question" --route CIRCULAR --facts "15,000|15000; 14,999|14999"`, "```", "");
  const areas = [...new Set(recs.map((r) => r.area || "other"))].sort((a, b) => (AREA_ORDER.indexOf(a) + 1 || 99) - (AREA_ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b));
  // the ones with an answer card expectation first: they are the ones being worked through
  const withAnswer = recs.filter((r) => r.answer);
  if (withAnswer.length) {
    L.push(`## Answer card: questions with an expected answer (${withAnswer.length})`, "", "| id | question | the card must show | must NOT show | card result | note |", "|---|---|---|---|---|---|");
    for (const r of withAnswer) L.push(`| ${r.id} | ${cell(r.query, 160)} | ${cell(factsText(r.answer.facts))} | ${cell((r.answer.forbidden || []).join("; "))} | ${r.answer.status || "❓"} | ${cell(r.answer.note, 160)} |`);
    L.push("");
  }
  for (const a of areas) {
    const rs = recs.filter((r) => (r.area || "other") === a);
    L.push(`## ${a} (${rs.length})`, "", "| id | question | route | expected | last known | note |", "|---|---|---|---|---|---|");
    for (const r of rs) {
      const expected = [r.expectedFacts ? factsText(r.expectedFacts.map((x) => x)) : "", r.expectedCount ? `${r.expectedCount.of}: ${r.expectedCount.n}` : "", r.forbiddenFacts ? `NOT: ${r.forbiddenFacts.join("; ")}` : ""].filter(Boolean).join(" | ");
      L.push(`| ${r.id} | ${cell(r.query, 170)} | ${Array.isArray(r.expectedRoute) ? r.expectedRoute.join("/") : r.expectedRoute ?? ""}${r.run?.mode === "intellectual" ? " (synthesis)" : ""} | ${cell(expected)} | ${r.lastKnown ?? "❓"} | ${cell(r.notes, 150)} |`);
    }
    L.push("");
  }
  return L.join("\n") + "\n";
}

// ---------------------------------------------------------------- the one-time import of what the session of 17-18 Oct 2026 found
export function importSession(s) {
  const done = [];
  const byId = (id) => s.data.records.find((r) => r.id === id);
  // 1. queries that lived only in scripts/test-search.mjs (its unquoted cases); its quoted ones are in the set already
  const stray = [
    { id: "TS-D1", q: "टेबल टेनिस टीम के खिलाड़ियों का चयन", facts: [["TABLE TENNIS"]], note: "from scripts/test-search.mjs group D: a Hindi question must find the English table tennis circular" },
    { id: "TS-D2", q: "How much deposit is required to keep a 2-bedroom quarter in Delhi after retirement?", facts: [["Retention of Company"]], note: "from scripts/test-search.mjs group D: a conversational question must find the quarter-retention circular" },
    { id: "TS-D3", q: "तेलुगु, तमिल, कन्नड़, मलयालम, मिजो", facts: [["HTS"]], note: "from scripts/test-search.mjs group D: a list of Indian languages must find the Hindi teaching scheme (HTS)" },
    { id: "TS-E1", q: "20995.30", facts: [["Daily Rate of Wages"]], note: "from scripts/test-search.mjs group E: a bare number from the wage table must find the wage notice (it works since the OCR was fixed)" },
  ];
  for (const x of stray) {
    if (findByQuery(s, x.q)) continue;
    s.data.records.push({ id: x.id, query: x.q, area: "circular", expectedRoute: "CIRCULAR", expectedFacts: x.facts, source: "TS", lastKnown: "❓", notes: x.note });
    done.push(`added ${x.id}`);
  }
  // 2. what the answer card must show for the questions we worked on (the facts are from the printed circulars, see STATUS.md)
  const answers = [
    { id: "A-C4", answer: { facts: [["808"], ["740"], ["809"]], forbidden: ["1924530"], status: "✅", note: "2026-10-18 on screen: Works 808, Projects 740, Town Serv(Elect) 809 under 'Daily Wages (Rs. Per Day of duty)', source: Notice for Contract Workers - Daily Rate of Wages, page 1" },
      lastKnown: "✅", notes: "2026-10-18: the wage notice (circular id 82) was re-read and applied; the search finds it at 99% and the answer card shows the three daily wages." },
    { id: "A-C3", answer: { facts: [["15,000", "15000"], ["14,999", "14999"]], forbidden: ["75,000", "74,999", "215,000"], status: "✅", note: "2026-10-18 on screen: Initial announced amount Rs.15,000/-, Corrected amount Rs.14,999/-; source: the corrigendum (the original circular states 15,000, the corrigendum reads it as 14,999; last date 15.08.2026 unchanged)" } },
    { id: "A-C2", answer: { facts: [["31.08.2026", "31-08-2026", "31 August 2026"], ["20.08.2026", "20-08-2026", "20 August 2026"]], forbidden: [], status: "❓", note: "not tried on the answer card. The pipeline reads the deadline 20-08-2026 as 20-0802 on the Hindi page; Gemini reads it right: the two readers disagree, so the confirmation gate would refuse it until it is settled" } },
    { id: "A-C5", answer: { facts: [["5 December 2024", "5th December 2024", "05.12.2024"], ["12.12.2024", "12-12-2024", "12 December 2024"]], forbidden: [], status: "❓", note: "not tried on the answer card. Expected from the battery evidence: football trial 5 Dec 2024 (ASP Stadium), table tennis trial 12.12.2024" } },
  ];
  for (const a of answers) {
    const r = byId(a.id);
    if (!r) { done.push(`SKIPPED ${a.id}: not in the set`); continue; }
    if (!r.answer) { r.answer = a.answer; done.push(`${a.id}: answer card expectation added`); }
    if (a.lastKnown && r.lastKnown !== a.lastKnown) { r.lastKnown = a.lastKnown; r.notes = r.notes ? `${r.notes} | ${a.notes}` : a.notes; done.push(`${a.id}: search result marked ✅`); }
  }
  return done;
}

// ---------------------------------------------------------------- the command line
function arg(args, name) { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; }
function positional(args) { const out = []; for (let i = 0; i < args.length; i++) { if (args[i].startsWith("--")) { if (["id", "route", "area", "facts", "forbid", "source"].includes(args[i].slice(2))) i++; continue; } out.push(args[i]); } return out; }

function writeMd(s) { fs.writeFileSync(MD, buildMarkdown(s)); console.log(`Wrote ${path.relative(ROOT, MD)} (${s.data.records.length} questions).`); }

function selftest() {
  let pass = 0, fail = 0;
  const ok = (name, c, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
  const tmp = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TMPDIR || "/tmp"), "queries-"));
  const file = path.join(tmp, "set.json");
  fs.writeFileSync(file, JSON.stringify({ version: 1, records: [
    { id: "A-1", query: "What is the wage?", area: "circular", expectedRoute: "CIRCULAR", lastKnown: "❓", notes: "old" },
    { id: "A-2", query: "who is senior", area: "employee", expectedRoute: "EMP-SQL", lastKnown: "✔", expectedFacts: [["Anwar"]] },
    { id: "A-3", query: "synthesis question", area: "eds", expectedRoute: "EDS", run: { mode: "intellectual" } },
    { id: "A-C2", query: "mediclaim date", area: "eds", expectedRoute: "EDS" },
  ] }, null, 1) + "\n");
  const s = loadSet(file);
  ok("the indentation of the file is kept", s.indent === 1);
  ok("a question is found whatever its case and punctuation", findByQuery(s, "what is the WAGE") && findByQuery(s, "what is the wage")?.id === "A-1");
  const a = addQuery(s, "gift card amount?", { route: "CIRCULAR", facts: "15,000|15000; 14,999", forbid: "75,000; 74,999" });
  ok("a new question is added with a fresh id", a.added && a.id === "USER-1");
  ok("its facts are parsed (';' separates facts, '|' alternatives)", JSON.stringify(findByQuery(s, "gift card amount").answer.facts) === JSON.stringify([["15,000", "15000"], ["14,999"]]) && findByQuery(s, "gift card amount").answer.forbidden.length === 2);
  ok("the same words are not added twice", !addQuery(s, "Gift card amount").added && addQuery(s, "Gift card amount").id === "USER-1");
  ok("a given id that is taken is refused", (() => { try { addQuery(s, "something new", { id: "A-1" }); return false; } catch { return true; } })());
  markResult(s, "A-1", "ok", "seen on screen");
  ok("marking sets the status and appends a dated note", s.data.records[0].lastKnown === "✅" && /^old \| \d{4}-\d{2}-\d{2}: seen on screen$/.test(s.data.records[0].notes));
  markResult(s, "A-1", "fail", "wrong", true);
  ok("--answer marks the answer card, not the search", s.data.records[0].answer.status === "❌" && s.data.records[0].lastKnown === "✅");
  ok("an unknown id is refused", (() => { try { markResult(s, "NOPE", "ok"); return false; } catch (e) { return /no question with the id/.test(e.message); } })());
  ok("an unknown status is refused", (() => { try { markResult(s, "A-1", "great"); return false; } catch (e) { return /unknown status/.test(e.message); } })());
  saveSet(s);
  const raw = fs.readFileSync(file, "utf8");
  ok("saving keeps the one-space indentation and a final newline", /\n "records"/.test(raw) && raw.endsWith("\n"));
  const s2 = loadSet(file);
  ok("a saved set loads again unchanged", s2.data.records.length === 5);
  ok("check finds nothing wrong in a good set", checkSet(s2).length === 0, JSON.stringify(checkSet(s2)));
  s2.data.records.push({ id: "A-1", query: "other words" }, { id: "Z-9", query: "what is the wage" }, { id: "Z-10", query: "bad", answer: { facts: ["x"] } });
  const probs = checkSet(s2).join(" | ");
  ok("check finds a repeated id, a repeated question and a malformed answer", /id A-1 is used twice/.test(probs) && /same question is in A-1 and Z-9/.test(probs) && /each answer fact must be a list/.test(probs), probs);
  ok("the same words in two modes are not a duplicate", !checkSet({ data: { records: [{ id: "X-1", query: "q q" }, { id: "X-2", query: "q q", run: { mode: "intellectual" } }] } }).length);
  const md = buildMarkdown(s);
  ok("the checklist lists every question and the answer card expectations first", md.includes("GENERATED") && md.indexOf("Answer card: questions with an expected answer") < md.indexOf("## circular") && md.includes("| USER-1 |") && md.includes("| A-3 |") && md.includes("(synthesis)"));
  ok("a pipe in a question cannot break the table", !/\|[^|\n]*a\|b[^|\n]*\|/.test(buildMarkdown({ data: { records: [{ id: "P-1", query: "a|b", area: "x" }] } })));
  const s3 = loadSet(file);
  const first = importSession(s3), second = importSession(s3);
  ok("the one-time import adds the four test-search questions and the answer expectations it finds", first.filter((x) => x.startsWith("added TS-")).length === 4 && first.some((x) => x.startsWith("A-C2")) && first.some((x) => /SKIPPED A-C4/.test(x)));
  ok("...and a second run changes nothing", second.every((x) => /SKIPPED/.test(x)), JSON.stringify(second));
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd = "list", ...rest] = process.argv.slice(2);
  try {
    if (cmd === "selftest") selftest();
    else if (cmd === "list") writeMd(loadSet());
    else if (cmd === "mark") {
      const [id, status, ...note] = positional(rest);
      if (!id || !status) throw new Error('usage: node scripts/queries.mjs mark ID ok|fail|unknown [--answer] ["note"]');
      const s = loadSet(); const r = markResult(s, id, status, note.join(" "), rest.includes("--answer")); saveSet(s); writeMd(s);
      console.log(`${id}: ${rest.includes("--answer") ? "answer card " + r.answer.status : "search " + r.lastKnown}`);
    } else if (cmd === "add") {
      const [q] = positional(rest);
      if (!q) throw new Error('usage: node scripts/queries.mjs add "the question" [--route R] [--area A] [--facts "a|b; c"] [--forbid "x; y"] [--id ID]');
      const s = loadSet(); const r = addQuery(s, q, { id: arg(rest, "id"), route: arg(rest, "route"), area: arg(rest, "area"), facts: arg(rest, "facts"), forbid: arg(rest, "forbid"), source: arg(rest, "source") });
      if (r.added) { saveSet(s); writeMd(s); console.log(`Added ${r.id}.`); } else console.log(`Already there as ${r.id}: nothing added.`);
    } else if (cmd === "find") {
      const words = positional(rest).join(" "); const n = norm(words);
      const s = loadSet(); const hits = s.data.records.filter((r) => norm(r.query).includes(n));
      for (const r of hits) console.log(`${r.id.padEnd(8)} ${r.lastKnown ?? "❓"} ${r.query}`);
      console.log(`${hits.length} question(s).`);
    } else if (cmd === "check") {
      const s = loadSet(); const p = checkSet(s);
      console.log(p.length ? p.map((x) => "- " + x).join("\n") : `Nothing wrong in ${s.data.records.length} questions.`); process.exit(p.length ? 1 : 0);
    } else if (cmd === "import-session") {
      const s = loadSet(); const done = importSession(s);
      if (done.some((x) => !/^SKIPPED/.test(x))) { saveSet(s); writeMd(s); }
      console.log(done.length ? done.map((x) => "  " + x).join("\n") : "Nothing to do: already imported.");
    } else throw new Error(`unknown command "${cmd}". Commands: list, mark, add, find, check, import-session, selftest`);
  } catch (e) { console.error(e.message); process.exit(1); }
}

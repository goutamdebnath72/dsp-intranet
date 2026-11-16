// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/help/quickReference.selftest.ts
// The "What to type" page of the guide must not drift from how the search really behaves: every string of every entry is run through the real detector and must open exactly the feature the entry names.
import { DateTime } from "luxon";
import { QUICK_REFERENCE, allReferenceStrings, entryStrings, filterReference } from "./quickReference";
import { detectTool } from "../tools/detect";
import { TOPICS } from "@/tools/registry";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const NOW = DateTime.fromISO("2026-11-13T10:00:00+05:30");

/** what the detector says of a line, in the page's own words: "form:calc", "live:news:hi", "expression" */
function said(q: string): string {
  const h = detectTool(q, NOW) as (Record<string, unknown> & { kind: string }) | null;
  if (!h) return "nothing";
  if (h.kind === "form") return `form:${h.form}`;
  if (h.kind === "live") return `live:${h.topic}${h.lang ? ":" + h.lang : ""}`;
  return h.kind;
}

const all = allReferenceStrings();
// a "records" line is a name, a number or a question: it opens no tool, it goes to the ordinary search of the intranet's own records
const bad = all.filter((x) => (x.expect === "records" ? said(x.q) !== "nothing" : said(x.q) !== x.expect));
ok("every string opens the feature its entry names (and nothing else)", bad.length === 0, JSON.stringify(bad.map((x) => [x.q, x.expect, said(x.q)])));
ok("the page is substantial: eight groups, more than forty features, more than a hundred and fifty commands", QUICK_REFERENCE.length === 8 && QUICK_REFERENCE.flatMap((g) => g.entries).length > 40 && all.length > 150, `${QUICK_REFERENCE.flatMap((g) => g.entries).length} / ${all.length}`);
ok("group ids are unique; every group and entry says what it covers; no string is empty or contains a slash (the slash is the separator on screen)", new Set(QUICK_REFERENCE.map((g) => g.id)).size === QUICK_REFERENCE.length && QUICK_REFERENCE.every((g) => g.covers.length > 20 && g.entries.every((e) => e.feature.length > 3 && e.what.length > 10 && entryStrings(e).length >= 1 && entryStrings(e).every((s) => s.trim().length >= 2 && !s.includes(" / ")))));
ok("no string is listed under two features", new Set(all.map((x) => x.q.toLowerCase())).size === all.length, all.map((x) => x.q.toLowerCase()).filter((q, i, a) => a.indexOf(q) !== i).join());
ok("a feature that opens a page is marked 'press Enter' and one that answers under the line is marked 'as you type', as the detector really behaves", QUICK_REFERENCE.flatMap((g) => g.entries).filter((e) => e.expect !== "records").every((e) => e.instant === !(e.expect.startsWith("form:") || e.expect === "menu")));
// every live card and every form of the registry is on the page
const live = TOPICS.filter((t) => "live" in t).map((t) => `live:${t.id}`);
const forms = TOPICS.filter((t) => "form" in t).map((t) => `form:${t.id}`);
const listed = new Set(all.map((x) => x.expect.split(":").slice(0, 2).join(":")));
ok("every live card and every calculator form of the registry has an entry", [...live, ...forms].every((k) => listed.has(k)), JSON.stringify([...live, ...forms].filter((k) => !listed.has(k))));
// SHORT AND LONG: every feature has both kinds of command, or says in words why one does not exist
const entries = QUICK_REFERENCE.flatMap((g) => g.entries);
ok("every feature has a short command or says why it has none, and a long command or says why it has none (never silently missing)", entries.every((e) => (e.short.length > 0 || (e.noShort ?? "").length > 20) && (e.long.length > 0 || (e.noLong ?? "").length > 10)), JSON.stringify(entries.filter((e) => !((e.short.length > 0 || (e.noShort ?? "").length > 20) && (e.long.length > 0 || (e.noLong ?? "").length > 10))).map((e) => e.feature)));
ok("a reason is given only where the command really does not exist (no feature has both a command and a 'none' note)", entries.every((e) => !(e.short.length > 0 && e.noShort) && !(e.long.length > 0 && e.noLong)));
const wc = (s: string) => s.trim().split(/\s+/).length;
ok("in the tools, a short command is one or two words and a long command is three or more (the records page is questions: judged by the person who asks)", QUICK_REFERENCE.filter((g) => g.id !== "records").flatMap((g) => g.entries).every((e) => e.short.every((s) => wc(s) <= 2) && e.long.every((s) => wc(s) >= 3)));
ok("the tool features that are not typed values have BOTH a short and a long command (only the values you type yourself, the reading of a marking and three words-only commands give a reason instead)", entries.filter((e) => e.expect !== "records").filter((e) => e.short.length === 0 || e.long.length === 0).every((e) => ["expression", "convert", "engine", "tyre", "rim", "vin", "bh"].includes(e.expect) || /needs all (its|their) words|take three words/.test(e.noShort ?? "")), JSON.stringify(entries.filter((e) => e.expect !== "records" && (e.short.length === 0 || e.long.length === 0)).map((e) => [e.feature, e.expect])));
ok("every kind is counted: the list has both short and long commands in every group", QUICK_REFERENCE.every((g) => g.entries.some((e) => e.short.length > 0) && g.entries.some((e) => e.long.length > 0)));
ok("the records page covers the people, the hospital, PAX, holidays, circulars and circular questions, and says nothing of the deep search (EDS), which has its own tab", ["A person, by number", "A person, by name", "Count and compare employees", "Doctors and OPD", "PAX telephone extensions", "Holidays", "A circular, by its title", "What a circular says"].every((f) => QUICK_REFERENCE[0].entries.some((e) => e.feature === f)) && !JSON.stringify(QUICK_REFERENCE).match(/deep synthesis|\bEDS\b|deep briefing/i));
// the filter
ok("the filter finds a feature by its name, by a string or by a word of the note, and an empty text keeps all", filterReference("").length === 8 && filterReference("bhaskar")[0].entries[0].feature === "Hindi news" && filterReference("gratuity").length === 1 && filterReference("silver price")[0].entries.some((e) => e.feature.startsWith("Gold")) && filterReference("zzzz").length === 0);
console.log(`quickReference: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

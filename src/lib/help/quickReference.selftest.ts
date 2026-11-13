// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/help/quickReference.selftest.ts
// The "What to type" page of the guide must not drift from how the search really behaves: every string of every entry is run through the real detector and must open exactly the feature the entry names.
import { DateTime } from "luxon";
import { QUICK_REFERENCE, allReferenceStrings, filterReference } from "./quickReference";
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
const bad = all.filter((x) => said(x.q) !== x.expect);
ok("every string opens the feature its entry names (and nothing else)", bad.length === 0, JSON.stringify(bad.map((x) => [x.q, x.expect, said(x.q)])));
ok("the page is substantial: four groups, more than thirty features, more than a hundred strings", QUICK_REFERENCE.length === 4 && QUICK_REFERENCE.flatMap((g) => g.entries).length > 30 && all.length > 100, `${QUICK_REFERENCE.flatMap((g) => g.entries).length} / ${all.length}`);
ok("group ids are unique; every group and entry says what it covers; no string is empty or contains a slash (the slash is the separator on screen)", new Set(QUICK_REFERENCE.map((g) => g.id)).size === QUICK_REFERENCE.length && QUICK_REFERENCE.every((g) => g.covers.length > 20 && g.entries.every((e) => e.feature.length > 3 && e.what.length > 10 && e.strings.length >= 1 && e.strings.every((s) => s.trim().length >= 2 && !s.includes(" / ")))));
ok("no string is listed under two features", new Set(all.map((x) => x.q.toLowerCase())).size === all.length, all.map((x) => x.q.toLowerCase()).filter((q, i, a) => a.indexOf(q) !== i).join());
ok("a feature that opens a page is marked 'press Enter' and one that answers under the line is marked 'as you type', as the detector really behaves", QUICK_REFERENCE.flatMap((g) => g.entries).every((e) => e.instant === !(e.expect.startsWith("form:") || e.expect === "menu")));
// every live card and every form of the registry is on the page
const live = TOPICS.filter((t) => "live" in t).map((t) => `live:${t.id}`);
const forms = TOPICS.filter((t) => "form" in t).map((t) => `form:${t.id}`);
const listed = new Set(all.map((x) => x.expect.split(":").slice(0, 2).join(":")));
ok("every live card and every calculator form of the registry has an entry", [...live, ...forms].every((k) => listed.has(k)), JSON.stringify([...live, ...forms].filter((k) => !listed.has(k))));
// the filter
ok("the filter finds a feature by its name, by a string or by a word of the note, and an empty text keeps all", filterReference("").length === 4 && filterReference("bhaskar")[0].entries[0].feature === "Hindi news" && filterReference("gratuity").length === 1 && filterReference("silver price")[0].entries.some((e) => e.feature.startsWith("Gold")) && filterReference("zzzz").length === 0);
console.log(`quickReference: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

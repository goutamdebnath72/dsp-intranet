// Run (from the project root): npx tsx --tsconfig tsconfig.json src/lib/search/edsAnnouncements.selftest.ts
//
// This checks announcements as sources of the deep summary (EDS): their numbers cannot meet a circular's, the engine is told about them only when they are there (a briefing from circulars alone is unchanged), they are named and cited
// by their label, a stored briefing is valid only while the announcements it was made from are as they were, and the screens open them.

export {};
import { readFileSync } from "node:fs";
import { ANNOUNCEMENT_SOURCE_BASE, announcementSourceId, isAnnouncementSourceId, realSourceId } from "./sourceKey";
import { assembleEdsSources } from "./edsSources";
import { announcementFullText, announcementLabel, EDS_SOURCE_CHARS } from "../announcements/searchIndex/edsSources";
import { ANNOUNCEMENT_BRIEF, announcementFingerprint, clearExecutiveSynthesisCache, executeExecutiveSynthesis } from "./executiveSynthesis";
import { buildSourceNames, replaceSourceIds } from "./sourceRefs";
import type { EdsRow, EdsStore } from "./edsStore";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };

const DSC = "Applicants are advised to keep all required documents readily available. The above documents are to be sent to the following e-mail IDs. For any queries, please contact the DSC Coordinators in C&IT Department.";
const CIRC = "Circular Sl. No.: 2026/51 Sub: Digital signature certificates for executives. The competent authority shall approve the request of every executive.";
const row = (o: Record<string, unknown> = {}) => ({ id: 1, type: "announcement", headline: "Procedure for Issuance of Digital Signature Certificate (DSC)", url: null, publishedAt: "2026-11-17T04:00:00.000Z", similarity: 0.9, chunkText: "excerpt", ...o }) as any;

async function main() {
  const DSC_LABEL = announcementLabel(row().headline, row().publishedAt); // the title is over 60 characters, so the label cuts it
  ok("a long title is cut in the label, with an ellipsis, and the date follows", /^Announcement \u201cProcedure for Issuance of Digital Signature Certificate \(DS\u2026\u201d \(17 Nov 2026\)$/.test(DSC_LABEL), DSC_LABEL);
  // ---- the numbers
  ok("an announcement's source number is above every circular's and is its id moved", ANNOUNCEMENT_SOURCE_BASE === 1_000_000 && announcementSourceId(12) === 1_000_012 && realSourceId(1_000_012) === 12);
  ok("a circular's number is never taken for an announcement's, and comes back as it is", !isAnnouncementSourceId(12) && !isAnnouncementSourceId(999_999) && !isAnnouncementSourceId(1_000_000) && isAnnouncementSourceId(1_000_001) && realSourceId(12) === 12);
  ok("an id that cannot be moved (0, negative, fractional, too large) has no source number", [0, -3, 2.5, 1_000_000, 5_000_000, NaN].every((n) => announcementSourceId(n) === null));

  // ---- text and names
  ok("an announcement's text is its body, then the text of its PDF", announcementFullText("Body words.", "Pdf words.") === "Body words.\nPdf words." && announcementFullText(null, "Pdf only.") === "Pdf only." && announcementFullText("Body only.", null) === "Body only." && announcementFullText("", "") === "");
  ok("it is cut at the circulars' own budget (60000 characters), the body first", announcementFullText("B", "x".repeat(90000)).length === EDS_SOURCE_CHARS && announcementFullText("B", "x".repeat(90000)).startsWith("B\nxxx"));
  ok("the reader sees an announcement as: Announcement “Title” (date)", announcementLabel("Procedure for Issuance of DSC", "2026-11-17T04:00:00.000Z") === "Announcement “Procedure for Issuance of DSC” (17 Nov 2026)" && /…” \(/.test(announcementLabel("x".repeat(90), "2026-11-17T04:00:00.000Z")) && announcementLabel("T", null) === "Announcement “T”");

  // ---- the sources of a summary, from the search results
  const rows = [row({ id: 5, type: "circular", headline: "Circular on DSC" }), row({ id: 5 }), row({ id: 9, type: "holiday", headline: "Holiday note" }), row({ id: 7, headline: "Another notice" })];
  const eds = assembleEdsSources(rows, new Map([[5, CIRC]]), new Map([[5, DSC], [7, "Seven's text"]]));
  ok("circulars and announcements are sources, in the search's order; a holiday note is not", eds.sources.map((r) => `${r.type}:${r.id}`).join() === "circular:5,announcement:1000005,announcement:1000007");
  ok("a circular and an announcement with the same row number are two different sources", new Set(eds.sources.map((r) => r.id)).size === 3 && eds.sources[0].id === 5 && eds.sources[1].id === 1_000_005);
  ok("each is given its full text (a circular its chunks, an announcement its body and PDF), never the search excerpt", eds.sources[0].chunkText === CIRC && eds.sources[1].chunkText === DSC && eds.sources[2].chunkText === "Seven's text");
  ok("the announcements are named by their labels, by their moved numbers", eds.announcementLabels.get(1_000_005) === DSC_LABEL && eds.announcementLabels.size === 2);
  ok("the results listed under the briefing carry the same numbers as the citations (announcements moved, the others as they were)", eds.resultRows.map((r) => r.id).join() === "5,1000005,9,1000007");
  ok("with no full text found the search excerpt stands", assembleEdsSources([row({ id: 3 })], new Map(), new Map()).sources[0].chunkText === "excerpt");

  // ---- the engine: told about announcements only when they are there
  const prompts: string[] = [];
  const modelWrites = (cites: number[]) => async (prompt: string) => {
    prompts.push(prompt);
    return JSON.stringify({ headline: "DSC: whom to contact", overview: "For any query on a digital signature certificate, contact the **DSC Coordinators** in the C&IT Department.", keyFindings: [{ text: "Queries are to be sent to the DSC Coordinators in the C&IT Department.", sources: cites }], table: null, charts: [] });
  };
  const labels = new Map<number, string>([[5, "Circular 051 (2026)"], ...eds.announcementLabels]);
  const Q = "Whom do I contact about a digital signature certificate?";
  clearExecutiveSynthesisCache();
  const withAnn = await executeExecutiveSynthesis(Q, eds.sources.slice(1, 2), labels, { generate: modelWrites([1_000_005]), candidates: 1 });
  const p = prompts[0] ?? "";
  ok("the writer is shown an announcement under its own header, with its label and its text", p.includes(`[Announcement id=1000005 | cite as: ${DSC_LABEL}] Title: Procedure for Issuance of Digital Signature Certificate (DSC) (Date: 2026-11-17`) && p.includes(DSC));
  ok("and is told how to treat announcements (dates inside them, never current after their period, both sides where they differ), once", p.includes(ANNOUNCEMENT_BRIEF) && p.split("ANNOUNCEMENTS AMONG THE RECORDS").length === 2);
  ok("its citation is kept, with its label, and it is the announcement's moved number", withAnn.citations.length === 1 && withAnn.citations[0].id === 1_000_005 && /^Announcement/.test(String(withAnn.citations[0].label)) && withAnn.keyFindings[0]?.sources.join() === "1000005", JSON.stringify(withAnn.citations));
  clearExecutiveSynthesisCache();
  prompts.length = 0;
  const wrong = await executeExecutiveSynthesis(Q + " (b)", eds.sources.slice(1, 2), labels, { generate: modelWrites([5]), candidates: 1 });
  ok("a source number that is not one of the sources (the model cites circular 5 for the announcement) is not accepted as a citation", !wrong.keyFindings.some((f) => f.sources.includes(5)) && !wrong.citations.some((c) => c.id === 5), JSON.stringify(wrong.keyFindings));
  clearExecutiveSynthesisCache();
  prompts.length = 0;
  const both = await executeExecutiveSynthesis(Q + " (c)", [eds.sources[0], eds.sources[1]], labels, { generate: async (prompt) => { prompts.push(prompt); return JSON.stringify({ headline: "DSC", overview: "Executives apply; queries go to the **DSC Coordinators**.", keyFindings: [{ text: "The competent authority shall approve the request of every executive.", sources: [5] }, { text: "For any queries, please contact the DSC Coordinators in C&IT Department.", sources: [1_000_005] }], table: null, charts: [] }); }, candidates: 1 });
  ok("a circular and an announcement with the same row number are both cited, each by its own number", both.citations.map((c) => c.id).sort((a, b) => a - b).join() === "5,1000005" && /\[Circular id=5 \|/.test(prompts[0]) && /\[Announcement id=1000005 \|/.test(prompts[0]), JSON.stringify(both.citations));
  clearExecutiveSynthesisCache();
  prompts.length = 0;
  await executeExecutiveSynthesis(Q + " (d)", [eds.sources[0]], new Map([[5, "Circular 051 (2026)"]]), { generate: modelWrites([5]), candidates: 1 });
  ok("a briefing from circulars alone reads exactly what it always read: no announcement note, no announcement header", !prompts[0].includes("ANNOUNCEMENTS AMONG THE RECORDS") && !/Announcement id=/.test(prompts[0]) && /\[Circular id=5 \| cite as: Circular 051 \(2026\)\]/.test(prompts[0]));

  // ---- a stored briefing is valid only while the announcements it was made from are as they were
  ok("the fingerprint of announcements is empty when there are none, and the same for the same announcements in any order", announcementFingerprint([eds.sources[0]]) === "" && announcementFingerprint([eds.sources[1], eds.sources[2]]) === announcementFingerprint([eds.sources[2], eds.sources[1]]) && /^\|a:[0-9a-f]{16}$/.test(announcementFingerprint([eds.sources[1]])));
  ok("it changes when an announcement's text, title or set changes, and not for a circular's text", announcementFingerprint([eds.sources[1]]) !== announcementFingerprint([{ ...eds.sources[1], chunkText: DSC + " Updated." }]) && announcementFingerprint([eds.sources[1]]) !== announcementFingerprint([{ ...eds.sources[1], headline: "Renamed" }]) && announcementFingerprint([eds.sources[1]]) !== announcementFingerprint([eds.sources[1], eds.sources[2]]) && announcementFingerprint([eds.sources[0], eds.sources[1]]) === announcementFingerprint([{ ...eds.sources[0], chunkText: "changed circular" }, eds.sources[1]]));
  const stored = new Map<string, EdsRow>();
  const store: EdsStore = { fingerprint: async () => "circulars-v1", get: async (k) => stored.get(k) ?? null, put: async (r) => { if (!stored.has(r.key)) stored.set(r.key, r); return stored.get(r.key)!; } };
  let writes = 0;
  const gen = async () => { writes++; return JSON.stringify({ headline: "DSC: whom to contact", overview: "For any query on a digital signature certificate, contact the **DSC Coordinators** in the C&IT Department.", keyFindings: [{ text: "Queries are to be sent to the DSC Coordinators in the C&IT Department.", sources: [1_000_005] }, { text: "Applicants keep all required documents readily available.", sources: [1_000_005] }], table: null, charts: [] }); };
  clearExecutiveSynthesisCache();
  const a1 = await executeExecutiveSynthesis("who handles dsc queries", [eds.sources[1]], labels, { generate: gen, candidates: 1, store });
  const made = writes;
  clearExecutiveSynthesisCache(); // this is a different server: only the permanent store is shared
  await executeExecutiveSynthesis("who handles dsc queries", [eds.sources[1]], labels, { generate: gen, candidates: 1, store });
  ok("the same question over the same announcements is read back from the store, not written again", a1.keyFindings.length > 0 && made > 0 && writes === made, `made ${made}, writes ${writes}`);
  clearExecutiveSynthesisCache();
  await executeExecutiveSynthesis("who handles dsc queries", [{ ...eds.sources[1], chunkText: DSC + " The DSC Coordinators are now in the Engineering Department." }], labels, { generate: gen, candidates: 1, store });
  ok("when the announcement it was made from has been edited the briefing is made again", writes > made);

  // ---- the names in the briefing's own words
  const names = buildSourceNames([{ id: 1_000_005, headline: "Procedure for Issuance of DSC" }, { id: 5, headline: "C" }], labels);
  ok("an announcement's number written into the text is replaced by its label, as a circular's is", replaceSourceIds("See Announcement 1000005 and Circular 5.", names) === `See ${DSC_LABEL} and Circular 051 (2026).` && replaceSourceIds("[Announcement id=1000005]", names).startsWith("Announcement “Procedure"));
  ok("a real number is left alone: 'Circular 2026/51', an announcement number that is not a source", replaceSourceIds("Circular 2026/51 and Announcement 1000099", names) === "Circular 2026/51 and Announcement 1000099");

  // ---- the route, the screens and the guide
  const route = readFileSync("src/app/api/ai-search/route.ts", "utf8");
  ok("the route builds the sources from circulars and announcements, fetches an announcement's full text, adds their labels, and lists the results under the same numbers", /assembleEdsSources\(topPrimarySources/.test(route) && /fetchAnnouncementFullText\(dataSource, announcementIds\)/.test(route) && /labels\.set\(id, label\)/.test(route) && /results: eds\.resultRows/.test(route) && !/circularSources/.test(route));
  const omni = readFileSync("src/components/OmnibarModal.tsx", "utf8");
  ok("a source chip opens a circular in its viewer or an announcement in its window, by its number", /const openEdsSource = \(id: number\) => \{\s*if \(isAnnouncementSourceId\(id\)\) openAnnouncement\(realSourceId\(id\), null\);\s*else setSelectedCircularId\(id\);/.test(omni) && /onOpenCircular=\{openEdsSource\}/.test(omni) && /openAnnouncement\(realSourceId\(result\.id\)/.test(omni));
  const brief = readFileSync("src/components/ExecutiveBriefing.tsx", "utf8");
  ok("the chips and the source list show a megaphone for an announcement and the document icon for a circular", (brief.match(/data-source-kind="announcement"/g) ?? []).length === 2 && /isAnnouncementSourceId\(id\)/.test(brief) && /isAnnouncementSourceId\(c\.id\)/.test(brief));
  const verify = readFileSync("src/lib/search/edsVerify.ts", "utf8");
  ok("the second reader treats an announcement's header as the end of a clause, as a circular's", /\[\(\?:Circular\|Announcement\) id=/.test(verify));

  console.log(`edsAnnouncements selftest: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.log("edsAnnouncements selftest crashed:", e?.stack || e); process.exit(1); });

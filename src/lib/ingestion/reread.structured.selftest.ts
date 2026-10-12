// src/lib/ingestion/reread.structured.selftest.ts
// Run:  npx tsx src/lib/ingestion/reread.structured.selftest.ts      (no database, no network: the page reading is a stand-in)
//
// A circular whose roster pages are stored as schedule rows (src/lib/ingestion/schedule/ingest.ts) is uploaded WITHOUT reading those pages. The
// archive re-read must do the same, or a re-read circular would not match a freshly uploaded one (and the roster text would come back as noise).
import { buildPageUnits, planChunks } from "./chunking";
import { planReread, type CircularRow, type OldChunk, type RereadDeps } from "./reread";

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) pass++;
  else {
    fail++;
    console.log(`  FAIL  ${label}${detail ? " -- " + detail : ""}`);
  }
};

const letter = (n: number) => `Page ${n} of the covering letter. The amount payable is Rs. 15,000 only. ` + "Employees are requested to report to the hospital on the date shown against their name with their identity card. ".repeat(3);
const rosterText = "1 241022 AMIT BANERJEE 32001 SMS-BOF (MECH) 15-01-25 ".repeat(300); // a long page of roster rows
const read: string[] = [];
const deps: RereadDeps = {
  readPage: async (url) => {
    const k = url.split("/").pop() || "";
    read.push(k);
    if (k === "P1") return { text: letter(1), englishChars: 100, indicLetters: 0, discarded: [], fellBackToIndicPass: false };
    if (k === "P2") return { text: letter(2), englishChars: 100, indicLetters: 0, discarded: [], fellBackToIndicPass: false };
    if (k === "P1CHANGED") return { text: letter(1).replace("15,000", "16,000"), englishChars: 100, indicLetters: 0, discarded: [], fellBackToIndicPass: false };
    if (k === "ROSTER") throw new Error("a roster page must not be read");
    throw new Error("unknown test image " + k);
  },
  embed: async () => [0],
};
const row = (urls: string[]): CircularRow => ({ id: 5, serialNumber: 3, headline: "CIRCULAR-HEALTH CHECK UP", fileUrls: urls.map((u) => "https://x/" + u) });
const oldOf = (pages: string[]): OldChunk[] => planChunks(buildPageUnits(pages, pages.join(" "))).map((c) => ({ chunk_index: c.index, page_number: c.page, text: c.text }));

(async () => {
  const stale = oldOf([letter(1), letter(2), rosterText]); // an old upload: the roster page was read and chunked too
  const fresh = oldOf([letter(1), letter(2), ""]); // a fresh upload: the roster page was not
  check("(setup) the old upload has chunks on page 3, the fresh one has none", stale.some((c) => c.page_number === 3) && !fresh.some((c) => c.page_number === 3));

  // 1. as before, with no structured pages: the roster page is read (and here fails, which is what the test double does for it)
  read.length = 0;
  const before = await planReread(deps, row(["P1", "P2", "ROSTER"]), stale);
  check("with no structured pages nothing changed: every page is read, and a page that fails to read makes the plan suspicious", read.includes("ROSTER") && before.status === "suspicious");

  // 2. a fresh upload
  read.length = 0;
  const same = await planReread(deps, row(["P1", "P2", "ROSTER"]), fresh, new Set([3]));
  check("roster page 3 is NOT read (the stand-in would have failed if it were)", !read.includes("ROSTER") && read.join() === "P1,P2", read.join());
  check("a circular as a fresh upload stores it (letters chunked, roster page not) is 'unchanged'", same.status === "unchanged", `${same.status} ${same.reason ?? ""}`);
  check("...and its page texts are the letters with an empty roster page", same.pageTexts[2] === "" && same.pageTexts[0].includes("covering letter"));

  // 3. an old upload that still holds the roster page's chunks
  read.length = 0;
  const drop = await planReread(deps, row(["P1", "P2", "ROSTER"]), stale, new Set([3]));
  check("an old upload that still has chunks of the roster page is a 'would-change': applying it drops them", drop.status === "would-change", `${drop.status} ${drop.reason ?? ""}`);
  check("...it is NOT 'suspicious' for losing so much text (the roster text is left out of the comparison: the letters are compared with the letters)", drop.status !== "suspicious");
  check("...and the new chunks hold no roster text and no page-3 chunk at all", drop.newChunks.every((c) => c.page !== 3 && !c.text.includes("AMIT BANERJEE")) && drop.newChunks.length === fresh.length);

  // 4. every page is a roster page
  const all = await planReread(deps, row(["ROSTER", "ROSTER"]), oldOf([rosterText, rosterText]), new Set([1, 2]));
  check("a circular whose every page is a roster page is skipped (nothing to read)", all.status === "skipped" && /every page is a roster page/.test(String(all.reason)));

  // 5. a real change on a letter page is still detected alongside
  const changed = await planReread(deps, row(["P1CHANGED", "P2", "ROSTER"]), fresh, new Set([3]));
  check("a change on a letter page (Rs. 15,000 -> 16,000) is still a 'would-change', as before, and the new number is reported", changed.status === "would-change" && changed.onlyInNew.some((x) => x.replace(/\D/g, "") === "16000"), `${changed.status} old:[${changed.onlyInOld.join()}] new:[${changed.onlyInNew.join()}]`);

  // 6. unchanged old behaviours
  const none = await planReread(deps, row(["P1", "P2", "ROSTER"]), [], new Set([3]));
  check("a circular with no stored text at all is still skipped (a holiday list)", none.status === "skipped");
  const nopages = await planReread(deps, { ...row([]), fileUrls: [] }, fresh, new Set([3]));
  check("a circular with no page images is still skipped", nopages.status === "skipped");

  console.log(`\nreread structured selftest: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

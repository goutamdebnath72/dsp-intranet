/** Self-test of the saved page checks. Run: npx tsx --tsconfig tsconfig.json src/lib/search/pageChecks.selftest.ts (no database). */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildPageUnits, planChunks } from "../ingestion/chunking";
import { freshChecks, loadPageChecks, normPageText, pageTextHash, storedPageTexts, type CheckRow } from "./pageChecks";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, detail = "") => { if (cond) pass++; else { fail++; console.log("FAIL", name, detail); } };

ok("whitespace does not change the fingerprint", pageTextHash("a  b\n c") === pageTextHash(" a b c ") && normPageText("a \n\n b") === "a b");
ok("a changed word does change it", pageTextHash("rate 808") !== pageTextHash("rate 803"));

const chunks = [{ page: 2, index: 2, text: "C D" }, { page: 1, index: 1, text: "B" }, { page: 1, index: 0, text: "A" }, { page: null, index: 3, text: "ignored" }];
const texts = storedPageTexts(chunks);
ok("the stored text of a page is its chunks in order, joined with a space", texts.get(1) === "A B" && texts.get(2) === "C D" && texts.size === 2);

const row = (page: number, text: string, extra: Partial<CheckRow> = {}): CheckRow => ({ page_number: page, confirmed: ["808"], unconfirmed: ["9022"], text_hash: pageTextHash(text), ...extra });
ok("a check whose fingerprint matches is used", JSON.stringify(freshChecks([row(1, "A B")], chunks)) === JSON.stringify({ 1: { confirmed: ["808"], unconfirmed: ["9022"] } }));
ok("a check of a page whose text changed (a re-read) is STALE and ignored", Object.keys(freshChecks([row(1, "A B old")], chunks)).length === 0);
ok("a check of a page that has no stored text is ignored", Object.keys(freshChecks([row(7, "x")], chunks)).length === 0);
ok("each page is judged on its own", Object.keys(freshChecks([row(1, "A B"), row(2, "stale")], chunks)).join() === "1");
ok("empty lists in the row are fine", JSON.stringify(freshChecks([row(1, "A B", { confirmed: null, unconfirmed: null })], chunks)) === JSON.stringify({ 1: { confirmed: [], unconfirmed: [] } }));

(async () => {
  ok("loadPageChecks returns the fresh checks", JSON.stringify(await loadPageChecks(async () => [row(1, "A B")], 5, chunks)) === JSON.stringify({ 1: { confirmed: ["808"], unconfirmed: ["9022"] } }));
  ok("...and nothing when none is fresh", (await loadPageChecks(async () => [row(1, "stale")], 5, chunks)) === undefined);
  ok("...and nothing when there are no rows", (await loadPageChecks(async () => [], 5, chunks)) === undefined);
  let asked: unknown[] = [];
  await loadPageChecks(async (_s, p) => { asked = p; return []; }, 82, chunks);
  ok("it asks for this circular only", asked.length === 1 && asked[0] === 82);
  ok("a missing table (the SQL was not run) or any database trouble gives no check and no error", (await loadPageChecks(async () => { throw new Error('relation "circular_page_check" does not exist'); }, 5, chunks)) === undefined);

  // THE INVARIANT the saving relies on: the stored chunks of a page, joined, ARE the page text the re-read stored (checked on the real wage notice)
  const wage: string = JSON.parse(readFileSync(join(__dirname, "..", "ingestion", "__fixtures__", "pilot-readings.json"), "utf8")).find((x: { id: string }) => x.id === "wage-notice").pipeline;
  const stored = planChunks(buildPageUnits([wage], (wage + " \n").replace(/\s+/g, " ").trim())).map((c) => ({ page: c.page, index: c.index, text: c.text }));
  ok("REAL wage notice: the stored chunks of the page, joined, equal the page reading (so a check made on the reading is about the stored text)", normPageText(storedPageTexts(stored).get(1) ?? "") === normPageText(wage));
  ok("REAL wage notice: the fingerprints agree", pageTextHash(storedPageTexts(stored).get(1) ?? "") === pageTextHash(wage));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

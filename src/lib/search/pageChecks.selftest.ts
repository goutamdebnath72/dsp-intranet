/** Self-test of the saved page checks. Run: npx tsx --tsconfig tsconfig.json src/lib/search/pageChecks.selftest.ts (no database). */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildPageUnits, planChunks } from "../ingestion/chunking";
import { checkRowsFor, freshChecks, loadPageChecks, normPageText, pageTextHash, savePageChecks, storedPageTexts, type CheckRow, type NewCheck } from "./pageChecks";

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

  // ---- checks recorded at upload (step 39a)
{
  const chunks = planChunks(buildPageUnits(["First page text with 1500 rupees", "Second page text with 2500 rupees"], "")).map((c) => ({ page: c.page, index: c.index, text: c.text }));
  const mk = (page: number): NewCheck => ({ page, status: "agreed", confirmed: ["1500"], unconfirmed: [], secondOnly: ["77"], reader: "gemini:test" });
  const rows = checkRowsFor([mk(1), mk(2), mk(3)], chunks);
  ok("checkRowsFor: a row per page that has stored text, none for page 3", rows.length === 2 && rows.map((r) => r.page).join() === "1,2");
  ok("checkRowsFor: the fingerprint is the hash of the stored page text", rows[0].textHash === pageTextHash(storedPageTexts(chunks).get(1) as string));

  const calls: { sql: string; params: unknown[] }[] = [];
  const saved = await savePageChecks(async (sql, params) => { calls.push({ sql, params }); }, 77, rows);
  ok("savePageChecks: one upsert per row, returns the count", saved === 2 && calls.length === 2 && /ON CONFLICT \(circular_id, page_number\) DO UPDATE/.test(calls[0].sql));
  ok("savePageChecks: the parameters are circular, page, status, confirmed, unconfirmed, second-only, reader, fingerprint", calls[0].params[0] === 77 && calls[0].params[1] === 1 && calls[0].params[2] === "agreed" && JSON.stringify(calls[0].params[3]) === '["1500"]' && JSON.stringify(calls[0].params[5]) === '["77"]' && calls[0].params[6] === "gemini:test" && calls[0].params[7] === rows[0].textHash);
  let n = 0;
  const partial = await savePageChecks(async () => { n++; if (n === 2) throw new Error('relation "circular_page_check" does not exist'); }, 77, rows);
  ok("savePageChecks: a failing database never throws; it stops and says how many were saved", partial === 1 && n === 2);
  ok("savePageChecks: no rows, no calls", (await savePageChecks(async () => { throw new Error("must not be called"); }, 1, [])) === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

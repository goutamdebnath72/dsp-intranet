// Run (from the project root): npx tsx src/lib/ingestion/reread.selftest.ts
// applyReread and restoreFromBackup with a fake database client (no network): embeddings first, backup before the write, one transaction, rollback on failure.
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyReread, restoreFromBackup, type Backup, type RereadPlan, type SqlClient } from "./reread";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => { if (cond) pass++; else { fail++; console.log(`FAIL ${name} ${extra}`); } };

const plan = (over: Partial<RereadPlan> = {}): RereadPlan => ({
  id: 7, serialNumber: 3, headline: "H", status: "would-change", reason: null, pages: 1, oldChunks: 2, oldChars: 0, newChars: 10, onlyInOld: [], onlyInNew: [], pageTexts: [],
  newChunks: [{ index: 0, page: 1, text: "alpha 31.12.2025" }, { index: 1, page: 1, text: "beta" }],
  extractedText: "alpha 31.12.2025 beta this text is long enough to embed",
  ...over,
});

function fakeClient(opts: { failOn?: RegExp } = {}) {
  const log: string[] = [];
  const client: SqlClient = {
    async query(text: string) {
      log.push(text.replace(/\s+/g, " ").trim().slice(0, 60));
      if (opts.failOn && opts.failOn.test(text)) throw new Error("database refused");
      if (/SELECT chunk_index, page_number, text, embedding::text/.test(text)) return { rows: [{ chunk_index: 0, page_number: 1, text: "old alpha 31.12.2005", embedding: "[0.1]" }] };
      if (/SELECT embedding::text AS embedding FROM public.circulars/.test(text)) return { rows: [{ embedding: "[0.2]" }] };
      return { rows: [] };
    },
  };
  return { client, log };
}

(async () => {
  const dir = mkdtempSync(join(tmpdir(), "reread-"));
  const embedded: string[] = [];
  const embed = async (t: string) => { embedded.push(t); return [0.5, 0.5]; };

  // apply: embeddings first, backup, then one transaction
  { const { client, log } = fakeClient();
    const res = await applyReread(client, { embed }, plan(), dir);
    ok("a plan is applied in one transaction (BEGIN ... COMMIT)", log.includes("BEGIN") && log[log.length - 1] === "COMMIT", log.join(" | "));
    ok("every chunk and the document were embedded", embedded.length === 3, String(embedded.length));
    ok("the backup holds the OLD text and vectors", existsSync(res.backupFile) && (JSON.parse(readFileSync(res.backupFile, "utf8")) as Backup).chunks[0].text === "old alpha 31.12.2005");
    ok("the old chunks are deleted before the new ones are inserted", log.findIndex((l) => l.startsWith("DELETE")) < log.findIndex((l) => l.startsWith("INSERT"))); }
  // a plan that is not would-change is refused
  { const { client } = fakeClient(); let msg = "";
    try { await applyReread(client, { embed }, plan({ status: "suspicious" }), dir); } catch (e) { msg = String((e as Error).message); }
    ok("a plan that is not 'would-change' is refused", /refusing to apply/.test(msg), msg); }
  // an embedding failure changes nothing
  { const { client, log } = fakeClient(); let msg = "";
    try { await applyReread(client, { embed: async () => { throw new Error("embedding service down"); } }, plan(), dir); } catch (e) { msg = String((e as Error).message); }
    ok("if the embedding service fails nothing is written", /embedding service down/.test(msg) && !log.some((l) => /BEGIN|DELETE|INSERT/.test(l)), log.join(" | ")); }
  // a database error halfway rolls back
  { const { client, log } = fakeClient({ failOn: /INSERT INTO public.circular_chunks/ }); let msg = "";
    try { await applyReread(client, { embed }, plan(), dir); } catch (e) { msg = String((e as Error).message); }
    ok("a database error halfway is rolled back", /database refused/.test(msg) && log.includes("ROLLBACK") && !log.includes("COMMIT"), log.join(" | ")); }
  // restore puts the backup back
  { const { client, log } = fakeClient();
    const backup: Backup = { circularId: 7, headline: "H", documentEmbedding: "[0.2]", chunks: [{ chunk_index: 0, page_number: 1, text: "old", embedding: "[0.1]" }] };
    const r = await restoreFromBackup(client, backup);
    ok("restore replaces the chunks and the document vector in one transaction", r.chunks === 1 && log[0] === "BEGIN" && log[log.length - 1] === "COMMIT" && log.some((l) => l.startsWith("UPDATE public.circulars")), log.join(" | ")); }

  console.log(`reread selftest: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

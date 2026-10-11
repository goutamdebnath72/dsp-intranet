// src/lib/ingestion/pageCache.selftest.ts
// Run:  npx tsx src/lib/ingestion/pageCache.selftest.ts      (no database, no network)
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cachedReadPage } from "./pageCache";
import { OCR_MERGE_VERSION } from "./ocrMerge";
import type { OcrPageResult } from "./ocr";

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) pass++;
  else {
    fail++;
    console.log(`  FAIL  ${label}${detail ? " -- " + detail : ""}`);
  }
};
const good = (t: string): OcrPageResult => ({ text: t, englishChars: t.length, indicLetters: 0, discarded: [], fellBackToIndicPass: false });

(async () => {
  const dir = mkdtempSync(join(tmpdir(), "pagecache-"));
  try {
    let reads = 0;
    let hits = 0;
    const read = async (url: string) => {
      reads++;
      if (url.includes("BAD")) throw new Error("HTTP 404");
      if (url.includes("EMPTY")) return { ...good(""), englishChars: 0, fellBackToIndicPass: true };
      return good("text of " + url);
    };
    const rp = cachedReadPage({ dir, read, onHit: () => hits++ });

    const a1 = await rp("http://blob/a.png", "p1");
    const a2 = await rp("http://blob/a.png", "p1");
    check("the first read does the work and saves it; the second comes from the cache", reads === 1 && hits === 1 && a1.text === a2.text && readdirSync(dir).length === 1);

    await rp("http://blob/b.png", "p2");
    check("a different page is a different entry", reads === 2 && readdirSync(dir).length === 2);

    let err = "";
    try {
      await rp("http://blob/BAD.png", "p3");
    } catch (e: any) {
      err = e.message;
    }
    await rp("http://blob/BAD.png", "p3").catch(() => {});
    check("a failed read is NOT cached (it is attempted again)", /404/.test(err) && reads === 4 && readdirSync(dir).length === 2);

    const e1 = await rp("http://blob/EMPTY.png", "p4");
    await rp("http://blob/EMPTY.png", "p4");
    check("a reading whose English pass was empty is NOT cached (it is attempted again)", e1.fellBackToIndicPass && reads === 6 && readdirSync(dir).length === 2);

    // an entry from an older merge rule, and a corrupt entry, must each be ignored and read again (each in its own folder)
    {
      const d2 = mkdtempSync(join(tmpdir(), "pagecache-old-"));
      try {
        let n = 0;
        const r2 = cachedReadPage({ dir: d2, read: async (u) => (n++, good("fresh " + u)) });
        await r2("http://blob/c.png", "p");
        const file = join(d2, readdirSync(d2)[0]);
        const saved = JSON.parse(readFileSync(file, "utf8"));
        writeFileSync(file, JSON.stringify({ ...saved, version: OCR_MERGE_VERSION - 1 }));
        await r2("http://blob/c.png", "p");
        check("an entry made by an OLDER merge rule is ignored and read again", n === 2);
        check("...and the entry is rewritten with the current version", JSON.parse(readFileSync(file, "utf8")).version === OCR_MERGE_VERSION);
        writeFileSync(file, "{not json");
        let threw = false;
        try {
          await r2("http://blob/c.png", "p");
        } catch {
          threw = true;
        }
        check("a corrupt cache file is ignored and read again (no crash)", !threw && n === 3);
        check("...and the corrupt file is replaced by a valid entry", JSON.parse(readFileSync(file, "utf8")).result.text === "fresh http://blob/c.png");
        writeFileSync(file, JSON.stringify({ ...saved, url: "http://blob/OTHER.png" }));
        await r2("http://blob/c.png", "p");
        check("an entry that names a different URL is ignored and read again", n === 4);
      } finally {
        rmSync(d2, { recursive: true, force: true });
      }
    }

    const off = cachedReadPage({ dir, read, enabled: false, onHit: () => hits++ });
    const h0 = hits;
    const r0 = reads;
    await off("http://blob/a.png", "p1");
    check("--no-cache bypasses the cache entirely", reads === r0 + 1 && hits === h0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log(`\npageCache selftest: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

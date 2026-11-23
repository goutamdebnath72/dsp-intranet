// scripts/upload-history-docs.ts
//
// This puts every document the DSP history card opens in its own viewer into Vercel Blob (the list is src/tools/dsphistory/docs.ts): the two JO Manuals, read from a folder on this computer, and the published PDFs
// (SAIL's Steel Cities book, the annual reports, the Lok Sabha replies, the obituary), downloaded from their own addresses with curl (I use curl because sail.co.in's certificate chain is incomplete and Node refuses it).
// The app's own route (GET /api/history-docs/<id>) then serves them: the JO Manuals to signed-in readers only, the published PDFs to anyone.
// Run from the project root:   npx tsx --tsconfig tsconfig.selftest.json scripts/upload-history-docs.ts [folder] [id ...]
//   folder   the folder that holds the JO Manual PDFs (default ~/Downloads/jo)
//   id ...   only these documents (default: all); e.g. `... scripts/upload-history-docs.ts ~/Downloads/jo steel-cities`
// It needs BLOB_READ_WRITE_TOKEN in .env.local (the same one the circulars use). Running it again replaces the copies (the old ones are deleted after the new ones are in), so it is safe to repeat.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { put, list, del } from "@vercel/blob";
import { DOCS } from "@/tools/dsphistory/docs";

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
if (!process.env.BLOB_READ_WRITE_TOKEN) { console.error("Missing BLOB_READ_WRITE_TOKEN in .env.local"); process.exit(1); }

const [first, ...rest] = process.argv.slice(2);
const folder = first && !(first in DOCS) ? first : path.join(homedir(), "Downloads", "jo");
const only = [first, ...rest].filter((x): x is string => !!x && x in DOCS);
const ids = only.length ? only : Object.keys(DOCS);
const tmp = mkdtempSync(path.join(tmpdir(), "history-docs-"));

async function main() {
  let failed = 0;
  for (const id of ids) {
    const d = DOCS[id];
    try {
      let file: string;
      if (d.file) file = path.join(folder, d.file);
      else {
        file = path.join(tmp, `${id}.pdf`);
        execFileSync("curl", ["-sSL", "--fail", "--max-time", "600", "-o", file, d.remote as string], { stdio: ["ignore", "inherit", "inherit"] });
      }
      if (!existsSync(file)) throw new Error(`not found: ${file}`);
      const bytes = readFileSync(file);
      if (!bytes.subarray(0, 1024).toString("latin1").includes("%PDF-")) throw new Error(`not a PDF: ${file}`);
      const old = (await list({ prefix: d.blobName.replace(/\.pdf$/, "") })).blobs.map((b) => b.url);
      const { url } = await put(d.blobName, bytes, { access: "public", addRandomSuffix: true, contentType: "application/pdf" });
      if (old.length) await del(old);
      console.log(`${id}: ${(statSync(file).size / 1048576).toFixed(1)} MB uploaded${old.length ? ` (replaced ${old.length} old)` : ""}; its address stays on the server (${url.slice(0, 36)}...)`);
    } catch (e) {
      failed++;
      console.error(`${id}: FAILED - ${(e as Error).message}`);
    }
  }
  console.log(failed ? `${failed} of ${ids.length} failed.` : `Done: ${ids.length} documents. Open a page link on the DSP history card.`);
  process.exit(failed ? 1 : 0);
}
main();

// scripts/index-announcements.ts
//
// PREPARES THE ANNOUNCEMENTS THAT ALREADY EXIST for the search bar (their text and their PDFs), the way a new publish does (src/lib/announcements/searchIndex/). For announcements published before the search index
// existed, or whose preparation failed (the manager's "Index again" does one at a time).
//
//   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/index-announcements.ts            lists what WOULD be done, writes nothing
//   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/index-announcements.ts --apply    does it
//   ... --only 12,15     only these announcement ids
//   ... --failed         only those whose text or PDF is not "ready" yet
//
// It writes only the index tables (derived data: passages, page pictures, state) and the announcements' own vectors. It never changes an announcement's title, text, PDF or date. Gemini reads only the pages of a PDF
// that have no usable text of their own, and makes the vectors.

import { getDb } from "../src/lib/db";
import { typeormAnnouncementDb } from "../src/lib/announcements/admin/access";
import { fileOf } from "../src/lib/announcements/admin/files";
import { indexStateOf } from "../src/lib/announcements/searchIndex/tables";
import { describeOutcome, indexAnnouncement } from "../src/lib/announcements/searchIndex/indexer";
import { realIndexDeps } from "../src/lib/announcements/searchIndex/defaults";

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const onlyFailed = args.includes("--failed");
  const onlyArg = args.indexOf("--only");
  const only = onlyArg >= 0 ? new Set((args[onlyArg + 1] ?? "").split(",").map((s) => Number(s.trim())).filter(Boolean)) : null;

  const ds = await getDb();
  const db = typeormAnnouncementDb(ds);
  const deps = realIndexDeps();
  const rows = (await ds.query(`SELECT id, title, "contentText" FROM public.announcement ORDER BY id`)) as Array<{ id: number; title: string; contentText: string | null }>;
  const states = await db.run((q) => indexStateOf(q, rows.map((r) => Number(r.id))));

  let done = 0;
  for (const r of rows) {
    const id = Number(r.id);
    if (only && !only.has(id)) continue;
    const file = await db.run((q) => fileOf(q, id));
    const st = states.get(id);
    const bodyOk = !r.contentText?.trim() || st?.body?.status === "ready";
    const pdfOk = !file || st?.pdf?.status === "ready";
    if (onlyFailed && bodyOk && pdfOk) continue;
    console.log(`#${id} "${r.title.slice(0, 60)}": text ${r.contentText?.trim() ? (st?.body?.status ?? "not prepared") : "none"}; PDF ${file ? `${file.name} (${st?.pdf?.status ?? "not prepared"})` : "none"}`);
    if (!apply) continue;
    let bytes: Buffer | undefined;
    if (file) {
      const got = await deps.storage.get(file.url).catch(() => null);
      if (!got) { console.log("   the PDF could not be fetched from storage; skipped"); continue; }
      bytes = got;
    }
    const out = await indexAnnouncement(db, deps, { id, bodyText: r.contentText ?? null, bytes });
    console.log(`   ${out.status}: ${describeOutcome(out)}`);
    done++;
  }
  console.log(apply ? `done: ${done} announcement(s) prepared.` : "nothing was written (add --apply to do it).");
  process.exit(0);
}
main().catch((e) => { console.error("failed:", e?.message ?? e); process.exit(1); });

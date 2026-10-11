// scripts/import-health-checkups.ts
//
// Health check-up schedules (an annexure of a circular, one month) -> the table public.health_checkup_schedule, so a question such as
// "which department is ticket 228757 in for the January 2025 health check-up" is answered with the person AND the date.
//
//   npx tsx --env-file=.env.local scripts/import-health-checkups.ts                       lists the circulars that look like health check-up schedules
//   npx tsx --env-file=.env.local scripts/import-health-checkups.ts --ids 23,30,37        DRY RUN: reads the pages, checks every row against HR, writes a
//                                                                                          report. Nothing is written to the database.
//   npx tsx --env-file=.env.local scripts/import-health-checkups.ts --ids 23,30,37 --apply   REALLY stores the rows (replacing that circular's rows)
//
// Before the first --apply run  src/lib/nl2sql/sql/08_health_checkups.sql  once in the Supabase SQL editor.
//
// How the date of a row is found: it is printed ONCE, in the middle of a merged cell that spans a whole group of rows; the cell's ruled lines say
// which rows it covers (src/lib/ingestion/schedule/). How a row is trusted: its ticket and name are checked against the HR directory (nlq.employees).
// A row is verified, corrected (a misread ticket fixed by the one HR employee with that name and department) or unverified (kept, flagged, never
// shown as confirmed). --apply refuses a circular whose pages show a problem (rows without a date, a group of an odd size, dates out of order)
// unless you add --accept-warnings after looking at the report.
//
//   --pages-dir <folder>   test aid: read the pages from <folder>/<circular id>/*.png instead of downloading them
//   --fresh                read the pages again even if a saved reading exists (health-cache/)
// Test aid: OCR_LANG_PATH (a local folder with eng.traineddata).

import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { extractSchedule, EXTRACT_VERSION, type ExtractedSchedule } from "../src/lib/ingestion/schedule/extractSchedule";
import { verifyAgainstHr, type HrEmployee, type VerifiedRow } from "../src/lib/ingestion/schedule/importSchedule";
import { circularLabel } from "../src/lib/search/circularLabels";
import { extractorFingerprint } from "../src/lib/ingestion/schedule/fingerprint";

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const arg = (n: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

interface CircularRow {
  id: number;
  headline: string;
  fileUrls: string[];
  publishedAt: Date | null;
  serialNumber: number | null;
}

async function loadPages(c: CircularRow): Promise<Buffer[]> {
  const dir = arg("pages-dir");
  if (dir) {
    const d = join(dir, String(c.id));
    return readdirSync(d).filter((f) => /\.png$/i.test(f)).sort().map((f) => readFileSync(join(d, f)));
  }
  const out: Buffer[] = [];
  for (const url of c.fileUrls) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`could not download ${url} (HTTP ${r.status})`);
    out.push(Buffer.from(await r.arrayBuffer()));
  }
  return out;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set (run with: npx tsx --env-file=.env.local scripts/import-health-checkups.ts)");
  const apply = flag("apply");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const ids = (arg("ids") ?? "").split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isInteger(n));
    if (ids.length === 0) {
      const r = await client.query(`SELECT id, "serialNumber", EXTRACT(YEAR FROM "publishedAt")::int AS year, headline, coalesce(array_length("fileUrls", 1), 0) AS pages FROM public.circulars WHERE headline ILIKE '%health%check%' OR headline ILIKE '%check%up%' ORDER BY "publishedAt"`);
      console.log("Circulars that look like health check-up schedules (pass their ids with --ids):\n");
      for (const x of r.rows) console.log(`  id ${String(x.id).padEnd(4)} ${circularLabel(x.serialNumber, x.year) ?? "(no serial)"}  ${x.pages} page(s)  ${String(x.headline).slice(0, 80)}`);
      return;
    }
    if (apply && !(await client.query(`SELECT to_regclass('public.health_checkup_schedule') AS t`)).rows[0].t) {
      throw new Error("the table public.health_checkup_schedule does not exist: run src/lib/nl2sql/sql/08_health_checkups.sql in the Supabase SQL editor first");
    }

    // ---- the OCR engines: one for whole pages, one for the printed dates (digits and - . / only, one line)
    const Tesseract: any = (await import("tesseract.js")).default;
    const wopts = process.env.OCR_LANG_PATH ? { langPath: process.env.OCR_LANG_PATH, gzip: false, cacheMethod: "none" } : undefined;
    const pageWorker = wopts ? await Tesseract.createWorker("eng", 1, wopts) : await Tesseract.createWorker("eng");
    await pageWorker.setParameters({ tessedit_pageseg_mode: "3" });
    const dateWorker = wopts ? await Tesseract.createWorker("eng", 1, wopts) : await Tesseract.createWorker("eng");
    await dateWorker.setParameters({ tessedit_char_whitelist: "0123456789-./ ", tessedit_pageseg_mode: "7" });
    const digitWorker = wopts ? await Tesseract.createWorker("eng", 1, wopts) : await Tesseract.createWorker("eng");
    await digitWorker.setParameters({ tessedit_char_whitelist: "0123456789", tessedit_pageseg_mode: "6" });
    const deps = {
      ocrPageTsv: async (png: Buffer) => ((await pageWorker.recognize(png, {}, { text: false, tsv: true })).data.tsv as string) || "",
      ocrDateText: async (png: Buffer) => ((await dateWorker.recognize(png)).data.text as string) || "",
      // the narrow numeric columns (serial, ticket, department code) are also read on their own, digits only
      ocrDigitsTsv: async (png: Buffer) => ((await digitWorker.recognize(png, {}, { text: false, tsv: true })).data.tsv as string) || "",
    };

    // ---- the HR directory, with the phonetic codes of the names. EVERYONE, not only non-executives: a person on a December 2024 roster may have
    // been promoted to executive since, and is still the same person (ticket and name agree).
    const hrRes = await client.query(`SELECT ticket_no, name, name_codes, department_code FROM nlq.employees`);
    const hr: HrEmployee[] = hrRes.rows.map((r: any) => ({ ticket: String(r.ticket_no).trim(), name: String(r.name), codes: (r.name_codes ?? []).map(String), departmentCode: r.department_code == null ? null : String(r.department_code) }));
    console.log(`HR directory: ${hr.length} employees.\n`);

    const stamp = Date.now();
    mkdirSync("health-reports", { recursive: true });
    mkdirSync("health-cache", { recursive: true });
    const report: string[] = [`# Health check-up import report (${apply ? "APPLIED" : "DRY RUN"}) - ${new Date(stamp).toISOString()}`, "", apply ? "Rows were written to public.health_checkup_schedule." : "Nothing was written to the database.", ""];
    let blocked = 0;

    for (const id of ids) {
      const cr = await client.query(`SELECT id, headline, "fileUrls", "publishedAt", "serialNumber" FROM public.circulars WHERE id = $1`, [id]);
      if (cr.rowCount === 0) { console.log(`circular ${id}: not found`); blocked++; continue; }
      const c: CircularRow = cr.rows[0];
      const label = circularLabel(c.serialNumber, c.publishedAt ? new Date(c.publishedAt).getFullYear() : null) ?? `id ${id}`;
      const t0 = Date.now();

      // ---- read the pages (a saved reading is reused when the pages and the reader are the same)
      const cachePath = join("health-cache", `circular-${id}.json`);
      let res: ExtractedSchedule | null = null;
      let reused = false;
      // the saved reading belongs to the reader that made it: any change to the reader's code (fingerprint) or to the pages makes it stale
      const key = JSON.stringify({ v: EXTRACT_VERSION, code: extractorFingerprint(join(__dirname, "..", "src", "lib", "ingestion", "schedule")), urls: c.fileUrls, dir: arg("pages-dir") ?? null });
      if (!flag("fresh") && existsSync(cachePath)) {
        const saved = JSON.parse(readFileSync(cachePath, "utf8"));
        if (saved.key === key) { res = saved.res; reused = true; }
      }
      if (!res) {
        const pages = await loadPages(c);
        res = await extractSchedule(pages, deps);
        writeFileSync(cachePath, JSON.stringify({ key, res }));
      }

      // ---- check every row against HR
      const codesRes = await client.query(`SELECT nlq.name_codes_of(n) AS codes FROM unnest($1::text[]) WITH ORDINALITY AS t(n, i) ORDER BY i`, [res.rows.map((r) => r.name)]);
      const printed: string[][] = codesRes.rows.map((r: any) => (r.codes ?? []).map(String));
      const rows: VerifiedRow[] = verifyAgainstHr(res.rows, printed, hr);
      const count = (s: string) => rows.filter((r) => r.status === s).length;
      const month = res.scheduleMonth ? `${MONTHS[res.scheduleMonth.month - 1]} ${res.scheduleMonth.year}` : "UNKNOWN";
      const problems = [...res.warnings];
      if (rows.length === 0) problems.push("no employee rows were read");
      if (!res.scheduleMonth) problems.push("the month this schedule is for could not be read from the page title");

      const line = `[${id}] ${label} "${String(c.headline).slice(0, 48)}": ${month} | ${rows.length} rows in ${res.groups.length} days | verified ${count("verified")}, corrected ${count("corrected")}, unverified ${count("unverified")} | ${problems.length ? "PROBLEMS: " + problems.length : "no problems"} | ${reused ? "saved reading reused (--fresh reads the pages again)" : `read the pages in ${((Date.now() - t0) / 1000).toFixed(0)} s`}`;
      console.log(line);
      for (const p of problems) console.log("      ! " + p);

      report.push(`## ${label} (circular id ${id}) - ${String(c.headline)}`, "", `- Schedule month: **${month}**`, `- Roster rows read: **${rows.length}** in **${res.groups.length}** days (rows per day: ${[...new Set(res.groups.map((g) => g.rows))].join(", ")})`, `- HR check: verified ${count("verified")} | corrected ${count("corrected")} | unverified ${count("unverified")}`, `- Pages that are not roster pages: ${res.info.length ? res.info.join("; ") : "none"}`, `- Source of the rows: ${reused ? "a saved reading of the pages (made by this same reader)" : "the pages were read now"}`);
      report.push("", "Days (date: rows): " + res.groups.map((g) => `${g.date ?? "??"}: ${g.rows}`).join(" | "), "");
      if (problems.length) report.push("**Problems (the circular is NOT applied until you have looked, then --accept-warnings):**", ...problems.map((p) => `- ${p}`), "");
      const notes = [...new Set(rows.filter((r) => r.dateNote).map((r) => `${r.checkupDate}: ${r.dateNote}`))];
      if (notes.length) report.push("**Dates that were corrected (typos in the circular itself):**", ...notes.map((n) => `- ${n}`), "");
      const corrected = rows.filter((r) => r.status === "corrected");
      if (corrected.length) report.push("**Corrected rows:**", ...corrected.map((r) => `- row ${r.seq} (page ${r.page}): ${r.statusNote}`), "");
      const unver = rows.filter((r) => r.status === "unverified");
      if (unver.length) {
        report.push(`**Unverified rows (${unver.length}; stored, flagged, never shown as confirmed):**`, "", "| row | page | ticket read | name read | dept | date | why |", "|---|---|---|---|---|---|---|");
        for (const r of unver.slice(0, 200)) report.push(`| ${r.seq} | ${r.page} | ${r.ticket ?? ""} | ${r.name} | ${r.departmentCode ?? ""} | ${r.checkupDate ?? ""} | ${r.statusNote ?? ""} |`);
        if (unver.length > 200) report.push(`| ... | | | | | | ${unver.length - 200} more |`);
        report.push("");
      }

      // ---- store
      if (apply) {
        if (problems.length && !flag("accept-warnings")) {
          console.log("      NOT APPLIED: look at the problems above (and the report), then run again with --accept-warnings if they are acceptable.");
          blocked++;
          continue;
        }
        await client.query("BEGIN");
        try {
          await client.query(`DELETE FROM public.health_checkup_schedule WHERE circular_id = $1`, [id]);
          const sm = res.scheduleMonth!;
          for (let i = 0; i < rows.length; i += 150) {
            const batch = rows.slice(i, i + 150);
            const vals: unknown[] = [];
            const ph = batch.map((r, k) => {
              const b = k * 14;
              vals.push(id, sm.year, sm.month, r.seq, r.page, r.ticket, r.ticketNo, r.name, r.departmentCode == null ? null : parseInt(r.departmentCode, 10), r.department, r.checkupDate, r.datePrinted, r.dateNote, r.status);
              return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11},$${b + 12},$${b + 13},$${b + 14})`;
            });
            await client.query(
              `INSERT INTO public.health_checkup_schedule (circular_id, schedule_year, schedule_month, seq, page_number, ticket_printed, ticket_no, name_printed, department_code_printed, department_printed, checkup_date, date_printed, date_note, status) VALUES ${ph.join(",")}`,
              vals,
            );
          }
          await client.query("COMMIT");
          console.log(`      applied: ${rows.length} rows stored.`);
        } catch (e) {
          await client.query("ROLLBACK");
          console.log(`      NOT APPLIED (nothing changed): ${String((e as Error).message).split("\n")[0]}`);
          blocked++;
        }
      }
    }
    const file = join("health-reports", `health-${apply ? "apply" : "dry"}-${stamp}.md`);
    writeFileSync(file, report.join("\n"));
    console.log(`\n${blocked ? `${blocked} circular(s) need attention. ` : ""}Report: ${file}`);
    await Promise.all([pageWorker.terminate(), dateWorker.terminate(), digitWorker.terminate()]);
    if (blocked) process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error("import failed:", e.message ?? e);
  process.exit(1);
});

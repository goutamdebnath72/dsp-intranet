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
import { withConnection } from "../src/lib/ingestion/schedule/dbRetry";
import { createScheduleOcr, loadHrContext, logIngest, prepareSchedule, stageDetail, storeSchedule, type PreparedSchedule, type Sql } from "../src/lib/ingestion/schedule/ingest";
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
  // The database is used in SHORT steps (a new connection each, retried if the network drops it): the OCR between the steps takes minutes and a
  // connection held open all that time can be dropped (a run once died with "read ETIMEDOUT").
  const db = <T,>(fn: (c: Client) => Promise<T>) =>
    withConnection(() => new Client({ connectionString: process.env.DATABASE_URL }), fn, {
      onRetry: (n, e) => console.log(`      (database connection problem: ${String((e as Error).message).split("\n")[0]}; trying again, attempt ${n} ...)`),
    });
  const q = (text: string, params?: unknown[]) => db((c) => c.query(text, params));
  try {
    const ids = (arg("ids") ?? "").split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isInteger(n));
    if (ids.length === 0) {
      // every circular that looks like a health check-up schedule by its headline, or that the upload recognised as one, or that has rows stored
      const head = `SELECT c.id, c."serialNumber", EXTRACT(YEAR FROM c."publishedAt")::int AS year, c.headline, coalesce(array_length(c."fileUrls", 1), 0) AS pages,
        (SELECT count(*) FROM public.health_checkup_schedule h WHERE h.circular_id = c.id)::int AS stored_rows`;
      const where = `c.headline ILIKE '%health%check%' OR c.headline ILIKE '%check%up%' OR EXISTS (SELECT 1 FROM public.health_checkup_schedule h WHERE h.circular_id = c.id)`;
      let r;
      try {
        r = await q(`${head}, (SELECT l.kind || ': ' || l.status FROM public.circular_ingest_log l WHERE l.circular_id = c.id ORDER BY l.id DESC LIMIT 1) AS decision
          FROM public.circulars c WHERE ${where} OR EXISTS (SELECT 1 FROM public.circular_ingest_log l WHERE l.circular_id = c.id AND l.kind = 'health-schedule') ORDER BY c."publishedAt", c.id`);
      } catch {
        r = await q(`${head}, NULL AS decision FROM public.circulars c WHERE ${where} ORDER BY c."publishedAt", c.id`); // the log table does not exist yet
      }
      console.log("Circulars that look like health check-up schedules (pass their ids with --ids):\n");
      for (const x of r.rows) {
        console.log(`  id ${String(x.id).padEnd(4)} ${circularLabel(x.serialNumber, x.year) ?? "(no serial)"}  ${x.pages} page(s)  schedule rows stored: ${x.stored_rows}  ${x.decision ? `| the upload decided: ${x.decision}` : "| no upload decision recorded"}`);
        console.log(`        ${String(x.headline).slice(0, 100)}`);
      }
      if (r.rows.length === 0) console.log("  (none)");
      return;
    }
    if (apply && !(await q(`SELECT to_regclass('public.health_checkup_schedule') AS t`)).rows[0].t) {
      throw new Error("the table public.health_checkup_schedule does not exist: run src/lib/nl2sql/sql/08_health_checkups.sql in the Supabase SQL editor first");
    }

    // ---- the OCR engines (the same four the upload uses: see src/lib/ingestion/schedule/ingest.ts)
    const wopts = process.env.OCR_LANG_PATH ? { langPath: process.env.OCR_LANG_PATH, gzip: false, cacheMethod: "none" } : undefined;
    const ocr = await createScheduleOcr(wopts);
    const deps = ocr.deps;

    // ---- the HR directory (EVERYONE, not only non-executives) and which department code belongs to which department name
    const sql: Sql = async (text, params) => (await q(text, params)).rows;
    const ctx = await loadHrContext(sql);
    console.log(`HR directory: ${ctx.hr.length} employees.\n`);

    const stamp = Date.now();
    mkdirSync("health-reports", { recursive: true });
    mkdirSync("health-cache", { recursive: true });
    const report: string[] = [`# Health check-up import report (${apply ? "APPLIED" : "DRY RUN"}) - ${new Date(stamp).toISOString()}`, "", apply ? "Rows were written to public.health_checkup_schedule." : "Nothing was written to the database.", ""];
    let blocked = 0;

    for (const id of ids) {
      const cr = await q(`SELECT id, headline, "fileUrls", "publishedAt", "serialNumber" FROM public.circulars WHERE id = $1`, [id]);
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

      // ---- check every row (department code against the printed department, people against HR): the same code the upload runs
      const prepared: PreparedSchedule = await prepareSchedule(res, ctx, sql);
      const rows = prepared.rows;
      const codeFixes = prepared.codeFixes;
      const problems = prepared.problems;
      const count = (s: string) => rows.filter((r) => r.status === s).length;
      const month = res.scheduleMonth ? `${MONTHS[res.scheduleMonth.month - 1]} ${res.scheduleMonth.year}` : "UNKNOWN";

      const line = `[${id}] ${label} "${String(c.headline).slice(0, 48)}": ${month} | ${rows.length} rows in ${res.groups.length} days | verified ${count("verified")}, corrected ${count("corrected")}, unverified ${count("unverified")} | ${problems.length ? "PROBLEMS: " + problems.length : "no problems"} | ${reused ? "saved reading reused (--fresh reads the pages again)" : `read the pages in ${((Date.now() - t0) / 1000).toFixed(0)} s`}`;
      console.log(line);
      for (const p of problems) console.log("      ! " + p);

      report.push(`## ${label} (circular id ${id}) - ${String(c.headline)}`, "", `- Schedule month: **${month}**`, `- Roster rows read: **${rows.length}** in **${res.groups.length}** days (rows per day: ${[...new Set(res.groups.map((g) => g.rows))].join(", ")})`, `- HR check: verified ${count("verified")} | corrected ${count("corrected")} | unverified ${count("unverified")}`, `- Department codes changed because they did not belong to the department printed on the row: ${codeFixes.length}`, `- Pages that are not roster pages: ${res.info.length ? res.info.join("; ") : "none"}`, `- Source of the rows: ${reused ? "a saved reading of the pages (made by this same reader)" : "the pages were read now"}`);
      report.push("", "Days (date: rows): " + res.groups.map((g) => `${g.date ?? "??"}: ${g.rows}`).join(" | "), "");
      if (problems.length) report.push("**Problems (the circular is NOT applied until you have looked, then --accept-warnings):**", ...problems.map((p) => `- ${p}`), "");
      const notes = [...new Set(rows.filter((r) => r.dateNote).map((r) => `${r.checkupDate}: ${r.dateNote}`))];
      if (notes.length) report.push("**Dates that were corrected (typos in the circular itself):**", ...notes.map((n) => `- ${n}`), "");
      if (codeFixes.length) report.push("**Department codes changed (the code read from the page did not belong to the department printed on the row):**", ...codeFixes.map((r) => `- row ${r.seq} (page ${r.page}): ${r.codeNote}`), "");
      const slight = rows.filter((r) => r.status === "verified" && r.statusNote && /differs slightly/.test(r.statusNote));
      if (slight.length) report.push(`**Verified although the printed name differs slightly from HR's (same ticket, same department; please glance at them):**`, ...slight.map((r) => `- row ${r.seq} (page ${r.page}): ${r.statusNote}`), "");
      const viaAlt = rows.filter((r) => r.status === "verified" && r.statusNote && /HR confirms/.test(r.statusNote));
      if (viaAlt.length) report.push("**Tickets confirmed from a second reading (the first reading was not an employee with this name):**", ...viaAlt.map((r) => `- row ${r.seq} (page ${r.page}): ${r.statusNote}`), "");
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
        try {
          await db(async (client) => {
            const tx: Sql = async (text, params) => (await client.query(text, params)).rows;
            await client.query("BEGIN");
            try {
              await storeSchedule(tx, id, prepared);
              await client.query("COMMIT");
            } catch (e) {
              await client.query("ROLLBACK").catch(() => undefined);
              throw e;
            }
          });
          await logIngest(sql, id, "health-schedule", "applied", { ...stageDetail({ status: "ready", prepared, problems, seconds: Math.round((Date.now() - t0) / 100) / 10 }, []), by: "import tool", acceptedWarnings: problems.length > 0 });
          console.log(`      applied: ${rows.length} rows stored.`);
        } catch (e) {
          console.log(`      NOT APPLIED (nothing changed): ${String((e as Error).message).split("\n")[0]}`);
          blocked++;
        }
      }
    }
    const file = join("health-reports", `health-${apply ? "apply" : "dry"}-${stamp}.md`);
    writeFileSync(file, report.join("\n"));
    console.log(`\n${blocked ? `${blocked} circular(s) need attention. ` : ""}Report: ${file}`);
    await ocr.close();
    if (blocked) process.exitCode = 1;
  } finally {
    // nothing to close: every database step opened and closed its own connection
  }
}

main().catch((e) => {
  console.error("import failed:", e.message ?? e);
  process.exit(1);
});

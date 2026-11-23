// scripts/errors.ts
//
// The production error log, read from the terminal (src/lib/errorLog/). I use the same database as the application (.env.local).
//
//   npm run errors                      the open errors, serious first (new and seen; not the resolved)
//   npm run errors -- all               everything, resolved too
//   npm run errors -- serious           only the serious ones
//   npm run errors -- show 12           one error in full: message, page, the model's or rule's note, stack
//   npm run errors -- seen 12           you have looked: it is no longer announced again
//   npm run errors -- resolve 12        fixed: it is announced again only if it comes back
//   npm run errors -- digest            run the daily digest now (cleans old rows, sends the notice if the address is set)

import { Client } from "pg";
import { get, list, setStatus, ensureTables, type Query } from "../src/lib/errorLog/store";
import { runDigest } from "../src/lib/errorLog/digest";
import { alertConfigured, sendAlert } from "../src/lib/errorLog/alert";

const [cmd = "open", arg] = process.argv.slice(2);

async function main() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) { console.log("No DATABASE_URL: run it as   npm run errors   (it reads .env.local)"); process.exit(1); }
  const client = new Client({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false } });
  await client.connect();
  const q: Query = async (sql, params) => (await client.query(sql, params as never[])).rows;
  try {
    if (!(await ensureTables(q))) { console.log("The error log tables are not there: run src/lib/nl2sql/sql/31_app_error_log.sql"); return; }
    const id = Number(arg);
    if (cmd === "show") {
      const r = Number.isInteger(id) ? await get(q, id) : null;
      if (!r) { console.log("No such error."); return; }
      console.log(`#${r.id}  ${r.severity.toUpperCase()}  ${r.status}  ${r.source}  ${r.occurrences}×  first ${r.firstSeen}  last ${r.lastSeen}\npage: ${r.page ?? "-"}\nrated by: ${r.triagedBy ?? "nobody yet"}   note: ${r.note ?? "-"}\n\n${r.message}\n\n${r.stack ?? "(no stack)"}`);
    } else if (cmd === "seen" || cmd === "resolve") {
      console.log(Number.isInteger(id) && (await setStatus(q, id, cmd === "seen" ? "seen" : "resolved")) ? `#${id} marked ${cmd === "seen" ? "seen" : "resolved"}.` : "No such error.");
    } else if (cmd === "digest") {
      const r = await runDigest(q, sendAlert);
      console.log(r.text ?? "Nothing to report.", `\n(dropped ${r.dropped}; ${alertConfigured() ? (r.sent ? "notice sent" : "notice NOT accepted by the service") : "no ERROR_ALERT_WEBHOOK_URL set here: nothing sent"})`);
    } else {
      const rows = (await list(q, { severity: cmd === "serious" ? "serious" : undefined, limit: 60 })).filter((r) => cmd === "all" || r.status !== "resolved");
      if (!rows.length) console.log("No errors recorded.");
      for (const r of rows) console.log(`#${String(r.id).padEnd(4)} ${r.severity.padEnd(7)} ${r.status.padEnd(8)} ${r.source.padEnd(7)} ${String(r.occurrences).padStart(5)}×  ${r.lastSeen.slice(0, 16)}  ${(r.page ?? "").padEnd(18).slice(0, 18)}  ${r.message.replace(/\s+/g, " ").slice(0, 90)}${r.note ? `\n        ↳ ${r.note}` : ""}`);
    }
  } finally {
    await client.end();
  }
}
main().catch((e) => { console.log("failed:", e instanceof Error ? e.message : e); process.exit(1); });

// src/lib/nl2sql/eval/feedback-report.ts
//
// The learning loop's review list: what people said Yes and No to, WHY, which No's were fixed by a second
// attempt (a rejected SQL and the SQL that replaced it: ready-made regression cases), which answers are now
// verified, and the questions that keep failing. Run it weekly (or after a testing session) and turn the
// recurring failures into rules, examples and golden test cases.
//
//   npx tsx --env-file=.env.local src/lib/nl2sql/eval/feedback-report.ts            (last 30 days)
//   npx tsx --env-file=.env.local src/lib/nl2sql/eval/feedback-report.ts --days=7
//
// Read-only. Writes nl2sql-eval-feedback.md (git-ignored). NOTE: it contains the questions people typed,
// which can include names; read it before sharing it.

import { Client } from "pg";
import { writeFileSync } from "fs";
import type { SqlClient } from "../types";

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "–");
const one = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();
const code = (s: unknown, max = 600) => "```sql\n" + one(s).slice(0, max) + "\n```";

export async function buildReport(db: SqlClient, days = 30, minConfirms = 1): Promise<string> {
  const win = `now() - make_interval(days => ${Math.max(1, Math.floor(days))})`;
  const q = async (sql: string, p: any[] = []) => (await db.query(sql, p)).rows as any[];
  const md: string[] = [];
  md.push(`# Feedback report — last ${days} days\n\n_Generated ${new Date().toISOString()}. Contains the questions people typed._\n`);

  // 1. Yes / No by route
  const bySource = await q(
    `SELECT source, count(*) FILTER (WHERE verdict = 'yes')::int AS yes, count(*) FILTER (WHERE verdict = 'no')::int AS no
       FROM public.omnibar_feedback WHERE created_at > ${win} GROUP BY source ORDER BY source`,
  );
  md.push("## Yes / No by route\n");
  if (!bySource.length) md.push("No feedback yet.\n");
  else {
    md.push("| Route | Yes | No | Yes-rate |\n|---|---|---|---|");
    let ty = 0, tn = 0;
    for (const r of bySource) { ty += r.yes; tn += r.no; md.push(`| ${r.source} | ${r.yes} | ${r.no} | ${pct(r.yes, r.yes + r.no)} |`); }
    md.push(`| **all** | ${ty} | ${tn} | ${pct(ty, ty + tn)} |\n`);
  }

  // 2. Why people said No
  const reasons = await q(
    `SELECT coalesce(reason_code, '(none)') AS reason, source, count(*)::int AS n
       FROM public.omnibar_feedback WHERE verdict = 'no' AND created_at > ${win} GROUP BY 1, 2 ORDER BY n DESC`,
  );
  md.push("## Why people said No\n");
  if (!reasons.length) md.push("None.\n");
  else { md.push("| Reason | Route | Count |\n|---|---|---|"); reasons.forEach((r) => md.push(`| ${r.reason} | ${r.source} | ${r.n} |`)); md.push(""); }

  // 3. Questions that keep failing
  const worst = await q(
    `SELECT f.query_norm, min(f.query) AS query, count(*)::int AS rejections, count(DISTINCT f.user_key)::int AS people,
            (array_agg(f.reason_code ORDER BY f.id DESC))[1] AS last_reason,
            (array_agg(f.note ORDER BY f.id DESC) FILTER (WHERE f.note IS NOT NULL))[1] AS last_note,
            (array_agg(l.sql ORDER BY f.id DESC) FILTER (WHERE l.sql IS NOT NULL))[1] AS last_sql,
            (array_agg(f.source ORDER BY f.id DESC))[1] AS source
       FROM public.omnibar_feedback f LEFT JOIN public.nl2sql_log l ON l.id = f.nl2sql_log_id
      WHERE f.verdict = 'no' AND f.created_at > ${win}
      GROUP BY f.query_norm ORDER BY rejections DESC, people DESC LIMIT 25`,
  );
  md.push("## Questions that were marked wrong (most rejected first)\n");
  if (!worst.length) md.push("None.\n");
  worst.forEach((r, i) => {
    md.push(`### ${i + 1}. ${one(r.query)}\n- Rejected ${r.rejections}× by ${r.people} ${r.people === 1 ? "person" : "people"}; last route: ${r.source}; last reason: ${r.last_reason ?? "(none)"}${r.last_note ? `; they wrote: "${one(r.last_note)}"` : ""}`);
    if (r.last_sql) md.push(code(r.last_sql));
    md.push("");
  });

  // 4. No's that a second attempt fixed -> regression cases
  const fixed = await q(
    `SELECT r.question, p.sql AS rejected_sql, r.sql AS accepted_sql, p.reject_reason
       FROM public.nl2sql_log r JOIN public.nl2sql_log p ON p.id = r.retry_of
      WHERE r.verdict = 'confirm' AND r.created_at > ${win} ORDER BY r.id DESC LIMIT 25`,
  );
  const stillBad = await q(
    `SELECT count(*)::int AS n FROM public.nl2sql_log r WHERE r.retry_of IS NOT NULL AND r.verdict = 'reject' AND r.created_at > ${win}`,
  );
  const retried = await q(`SELECT count(*)::int AS n FROM public.nl2sql_log r WHERE r.retry_of IS NOT NULL AND r.created_at > ${win}`);
  md.push(`## Second attempts after a No\n\n- Second attempts made: ${retried[0].n}; accepted (Yes): ${fixed.length}${fixed.length === 25 ? "+" : ""}; rejected again: ${stillBad[0].n}\n`);
  if (fixed.length) {
    md.push("Fixed by a second attempt — each is a ready-made regression case (rejected reading → accepted reading):\n");
    fixed.forEach((r, i) => {
      md.push(`**${i + 1}. ${one(r.question)}** (reason given: ${r.reject_reason ?? "none"})\n\nRejected:\n${code(r.rejected_sql)}\nAccepted:\n${code(r.accepted_sql)}\n`);
    });
  }

  // 5. Verified answers
  const verified = await q(
    `SELECT min(question) AS question, count(*) FILTER (WHERE verdict = 'confirm')::int AS confirms
       FROM public.nl2sql_log WHERE ok AND sql IS NOT NULL
      GROUP BY question_norm, sql
     HAVING count(*) FILTER (WHERE verdict = 'confirm') >= $1 AND count(*) FILTER (WHERE verdict = 'reject') = 0
      ORDER BY confirms DESC LIMIT 50`,
    [minConfirms],
  );
  md.push(`## Verified answers (served without the model; needs ${minConfirms}+ confirmation(s) and no rejection)\n`);
  if (!verified.length) md.push("None yet.\n");
  else { verified.forEach((r) => md.push(`- ${one(r.question)} — confirmed by ${r.confirms}`)); md.push(""); }

  // 6. Volume and engagement of model answers
  const vol = await q(
    `SELECT count(*)::int AS total, count(*) FILTER (WHERE verdict IS NOT NULL)::int AS rated,
            count(*) FILTER (WHERE source = 'cache')::int AS cached, count(*) FILTER (WHERE NOT ok)::int AS failed
       FROM public.nl2sql_log WHERE created_at > ${win}`,
  );
  const v = vol[0];
  md.push(`## Volume\n\n- Questions that reached the model path: ${v.total} (answered from a verified answer: ${v.cached}; could not be answered: ${v.failed})\n- Rated by people: ${v.rated} (${pct(v.rated, v.total)})\n`);
  return md.join("\n");
}

async function main() {
  const days = Number((process.argv.find((a) => a.startsWith("--days=")) || "--days=30").replace("--days=", "")) || 30;
  const url = process.env.NL2SQL_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("Set NL2SQL_DATABASE_URL or DATABASE_URL");
  const pg = new Client({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false } });
  await pg.connect();
  const min = Number(process.env.NL2SQL_VERIFIED_MIN_CONFIRMS);
  const md = await buildReport({ query: (t, p) => pg.query(t, p) as any }, days, Number.isInteger(min) && min >= 1 ? min : 2);
  await pg.end();
  writeFileSync("nl2sql-eval-feedback.md", md + "\n");
  console.log(md.split("\n").slice(0, 14).join("\n") + "\n…\nWritten: nl2sql-eval-feedback.md");
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}

// src/lib/errorLog/store.ts
//
// THE ERROR LOG, IN THE DATABASE (22 Nov 2026). On the production host (Vercel) the disk is not kept between requests, so a log FILE cannot exist there: the log is a table, grouped so that it cannot grow without end:
// one row per DISTINCT error (its fingerprint, see scrub.ts), with how many times it happened and when it first and last did. A thousand people hitting the same bug is one row with a count of a thousand.
// Rows are limited per source (browser and server separately, so a flood of fake browser reports can never push real server errors out), resolved ones are dropped after 30 days and everything after 90; when rows are
// dropped the developer is told (digest.ts). Closed to the browser (row level security, nothing granted to anon or authenticated). Created on first use when the database login may, or by src/lib/nl2sql/sql/31_app_error_log.sql.

export type Query = (sql: string, params?: unknown[]) => Promise<Array<Record<string, unknown>>>;

export const TABLE_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS public.app_error_log (
     id          bigserial   PRIMARY KEY,
     fingerprint text        NOT NULL UNIQUE,
     source      text        NOT NULL,
     message     text        NOT NULL,
     stack       text,
     page        text,
     agent       text,
     first_seen  timestamptz NOT NULL DEFAULT now(),
     last_seen   timestamptz NOT NULL DEFAULT now(),
     occurrences integer     NOT NULL DEFAULT 1,
     severity    text        NOT NULL DEFAULT 'unrated',
     note        text,
     triaged_by  text,
     status      text        NOT NULL DEFAULT 'new',
     alerted_at  timestamptz
   )`,
  `CREATE INDEX IF NOT EXISTS app_error_log_last_seen_idx ON public.app_error_log (source, last_seen DESC)`,
  `CREATE TABLE IF NOT EXISTS public.app_error_meta (
     key        text        PRIMARY KEY,
     value      text        NOT NULL,
     updated_at timestamptz NOT NULL DEFAULT now()
   )`,
  `ALTER TABLE public.app_error_log ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE public.app_error_meta ENABLE ROW LEVEL SECURITY`,
  `REVOKE ALL ON public.app_error_log FROM anon, authenticated`,
  `REVOKE ALL ON public.app_error_meta FROM anon, authenticated`,
];

export const LIMIT_PER_SOURCE = 1000;
export const KEEP_RESOLVED_DAYS = 30;
export const KEEP_ALL_DAYS = 90;
export const REMIND_AFTER_HOURS = 24;

let ready: Promise<boolean> | null = null;
let failedAt = 0;

/** true when the tables are there (made now if need be); a failure is remembered for 10 minutes. Never logs with console.error (the server's error hook would then report its own failure). */
export function ensureTables(q: Query): Promise<boolean> {
  if (ready && (failedAt === 0 || Date.now() - failedAt < 10 * 60_000)) return ready;
  failedAt = 0;
  ready = (async () => {
    try {
      const have = await q(`SELECT to_regclass('public.app_error_log') AS a, to_regclass('public.app_error_meta') AS b`);
      if (have[0]?.a && have[0]?.b) return true;
      for (const s of TABLE_STATEMENTS) await q(s);
      return true;
    } catch (e) {
      failedAt = Date.now();
      console.warn("error log tables are not available (run src/lib/nl2sql/sql/31_app_error_log.sql):", e instanceof Error ? e.message : e);
      return false;
    }
  })();
  return ready;
}
export function resetEnsure(): void { ready = null; failedAt = 0; }

const num = (v: unknown): number => Number(v ?? 0);
export interface Recorded { id: number; inserted: boolean; severity: string; note: string | null; occurrences: number; status: string; alertedAt: string | null }

/** one more occurrence of an error: a new row, or +1 on the row with the same fingerprint (a resolved error that comes back is "new" again and may be announced again) */
export async function record(q: Query, e: { fingerprint: string; source: string; message: string; stack: string; page: string; agent: string }): Promise<Recorded> {
  const r = await q(
    `INSERT INTO public.app_error_log (fingerprint, source, message, stack, page, agent)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (fingerprint) DO UPDATE SET
       occurrences = public.app_error_log.occurrences + 1,
       last_seen = now(),
       status = CASE WHEN public.app_error_log.status = 'resolved' THEN 'new' ELSE public.app_error_log.status END,
       alerted_at = CASE WHEN public.app_error_log.status = 'resolved' THEN NULL ELSE public.app_error_log.alerted_at END
     RETURNING id, severity, note, occurrences, status, alerted_at, (xmax = 0) AS inserted`,
    [e.fingerprint, e.source, e.message, e.stack, e.page, e.agent],
  );
  const x = r[0] ?? {};
  return { id: num(x.id), inserted: x.inserted === true, severity: String(x.severity ?? "unrated"), note: x.note == null ? null : String(x.note), occurrences: num(x.occurrences), status: String(x.status ?? "new"), alertedAt: x.alerted_at == null ? null : String(x.alerted_at) };
}

export async function setTriage(q: Query, id: number, v: { severity: string; note: string; by: string }): Promise<void> {
  await q(`UPDATE public.app_error_log SET severity = $2, note = $3, triaged_by = $4 WHERE id = $1`, [id, v.severity, v.note, v.by]);
}

/** true when this error should be announced now: serious, still new (nobody has looked), never announced or last announced over a day ago. Marks it announced in the same step, so two requests cannot both announce it. */
export async function claimAlert(q: Query, id: number): Promise<{ id: number; source: string; message: string; page: string | null; occurrences: number; severity: string; note: string | null } | null> {
  const r = await q(
    `UPDATE public.app_error_log SET alerted_at = now()
      WHERE id = $1 AND severity = 'serious' AND status = 'new'
        AND (alerted_at IS NULL OR alerted_at < now() - ($2 || ' hours')::interval)
      RETURNING id, source, message, page, occurrences, severity, note`,
    [id, String(REMIND_AFTER_HOURS)],
  );
  const x = r[0];
  return x ? { id: num(x.id), source: String(x.source), message: String(x.message), page: x.page == null ? null : String(x.page), occurrences: num(x.occurrences), severity: String(x.severity), note: x.note == null ? null : String(x.note) } : null;
}

export async function setStatus(q: Query, id: number, status: "new" | "seen" | "resolved"): Promise<boolean> {
  const r = await q(`UPDATE public.app_error_log SET status = $2 WHERE id = $1 RETURNING id`, [id, status]);
  return r.length > 0;
}

export interface Row { id: number; source: string; severity: string; status: string; occurrences: number; firstSeen: string; lastSeen: string; message: string; page: string | null; note: string | null; triagedBy: string | null; stack: string | null }
const toRow = (x: Record<string, unknown>): Row => ({ id: num(x.id), source: String(x.source), severity: String(x.severity), status: String(x.status), occurrences: num(x.occurrences), firstSeen: String(x.first_seen), lastSeen: String(x.last_seen), message: String(x.message), page: x.page == null ? null : String(x.page), note: x.note == null ? null : String(x.note), triagedBy: x.triaged_by == null ? null : String(x.triaged_by), stack: x.stack == null ? null : String(x.stack) });

export async function list(q: Query, f: { status?: string; severity?: string; limit?: number } = {}): Promise<Row[]> {
  const r = await q(
    `SELECT * FROM public.app_error_log
      WHERE ($1::text IS NULL OR status = $1) AND ($2::text IS NULL OR severity = $2)
      ORDER BY CASE severity WHEN 'serious' THEN 0 WHEN 'unrated' THEN 1 WHEN 'minor' THEN 2 ELSE 3 END, last_seen DESC
      LIMIT $3`,
    [f.status ?? null, f.severity ?? null, Math.min(Math.max(f.limit ?? 30, 1), 200)],
  );
  return r.map(toRow);
}
export async function get(q: Query, id: number): Promise<Row | null> {
  const r = await q(`SELECT * FROM public.app_error_log WHERE id = $1`, [id]);
  return r[0] ? toRow(r[0]) : null;
}

/** rows over the limit of their source (oldest last_seen first), resolved ones older than 30 days, anything older than 90: dropped. Returns how many. */
export async function prune(q: Query): Promise<number> {
  let dropped = 0;
  const a = await q(
    `DELETE FROM public.app_error_log
      WHERE (status = 'resolved' AND last_seen < now() - ($1 || ' days')::interval) OR last_seen < now() - ($2 || ' days')::interval
      RETURNING id`,
    [String(KEEP_RESOLVED_DAYS), String(KEEP_ALL_DAYS)],
  );
  dropped += a.length;
  const b = await q(
    `DELETE FROM public.app_error_log WHERE id IN (
       SELECT id FROM (SELECT id, row_number() OVER (PARTITION BY source ORDER BY last_seen DESC) AS rn FROM public.app_error_log) t WHERE rn > $1)
     RETURNING id`,
    [LIMIT_PER_SOURCE],
  );
  dropped += b.length;
  return dropped;
}

export async function getMeta(q: Query, key: string): Promise<string | null> {
  const r = await q(`SELECT value FROM public.app_error_meta WHERE key = $1`, [key]);
  return r[0] ? String(r[0].value) : null;
}
export async function setMeta(q: Query, key: string, value: string): Promise<void> {
  await q(`INSERT INTO public.app_error_meta (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()`, [key, value]);
}

/** counts for the digest: errors first seen since `sinceIso`, by severity, and the unresolved serious ones */
export async function digestFacts(q: Query, sinceIso: string): Promise<{ fresh: Record<string, number>; openSerious: Row[]; unrated: number }> {
  const f = await q(`SELECT severity, count(*)::int AS n FROM public.app_error_log WHERE first_seen > $1::timestamptz GROUP BY severity`, [sinceIso]);
  const fresh: Record<string, number> = {};
  for (const x of f) fresh[String(x.severity)] = num(x.n);
  const open = await q(`SELECT * FROM public.app_error_log WHERE severity = 'serious' AND status <> 'resolved' ORDER BY last_seen DESC LIMIT 10`);
  const un = await q(`SELECT count(*)::int AS n FROM public.app_error_log WHERE severity = 'unrated' AND status = 'new'`);
  return { fresh, openSerious: open.map(toRow), unrated: num(un[0]?.n) };
}

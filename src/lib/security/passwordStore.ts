// src/lib/security/passwordStore.ts
//
// What is kept about a password's life, in three small tables of their own (I do not touch the account table):
//   password_meta     one row per ticket: when the password was last changed, and the hashes of the 5 passwords before it (the same bcrypt hashes as the account's: as private as the password itself)
//   password_otp      one row per ticket: the live one-time code (a keyed hash, never the code), its expiry and tries
//   password_otp_log  when a code was sent, to count "3 an hour"
// All three are closed to the browser (row level security on, nothing granted to anon or authenticated); only the server's own login reads them. This file creates them on first use when the database login
// may (like the other stores), or src/lib/nl2sql/sql/30_password_policy.sql run by hand does. If they cannot be created, the 180-day rule and the history are simply not applied (a password change still works) and
// the problem is logged: the one thing I never let fail open is the one-time code, when it is switched on.

import { DateTime } from "luxon";
import { HISTORY_KEEP } from "./passwordPolicy";
import type { OtpRow, OtpStore } from "./otp";

export type Query = (sql: string, params?: unknown[]) => Promise<Array<Record<string, unknown>>>;

export const TABLE_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS public.password_meta (
     ticket_no  text        PRIMARY KEY,
     changed_at timestamptz NOT NULL,
     history    jsonb       NOT NULL DEFAULT '[]'::jsonb
   )`,
  `CREATE TABLE IF NOT EXISTS public.password_otp (
     ticket_no  text        PRIMARY KEY,
     code_hash  text        NOT NULL,
     expires_at timestamptz NOT NULL,
     tries      integer     NOT NULL DEFAULT 0,
     sent_at    timestamptz NOT NULL,
     channel    text        NOT NULL,
     sent_to    text        NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS public.password_otp_log (
     ticket_no text        NOT NULL,
     sent_at   timestamptz NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS password_otp_log_ticket_idx ON public.password_otp_log (ticket_no, sent_at)`,
  `ALTER TABLE public.password_meta ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE public.password_otp ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE public.password_otp_log ENABLE ROW LEVEL SECURITY`,
  `REVOKE ALL ON public.password_meta FROM anon, authenticated`,
  `REVOKE ALL ON public.password_otp FROM anon, authenticated`,
  `REVOKE ALL ON public.password_otp_log FROM anon, authenticated`,
];

let ready: Promise<boolean> | null = null;
let failedAt = 0;

/** Returns true when the tables are there (made now if need be); I remember a failure for 10 minutes instead of repeating it on every request */
export function ensureTables(q: Query): Promise<boolean> {
  if (ready && (failedAt === 0 || Date.now() - failedAt < 10 * 60_000)) return ready;
  failedAt = 0;
  ready = (async () => {
    try {
      const have = await q(`SELECT to_regclass('public.password_meta') AS a, to_regclass('public.password_otp') AS b, to_regclass('public.password_otp_log') AS c`);
      if (have[0]?.a && have[0]?.b && have[0]?.c) return true;
      for (const s of TABLE_STATEMENTS) await q(s);
      return true;
    } catch (e) {
      failedAt = Date.now();
      console.error("password tables are not available (run src/lib/nl2sql/sql/30_password_policy.sql):", e instanceof Error ? e.message : e);
      return false;
    }
  })();
  return ready;
}

/** for tests */
export function resetEnsure(): void { ready = null; failedAt = 0; }

/** the driver gives a timestamp as a Date or as text: either way, I want epoch milliseconds */
const toMs = (v: unknown): number => (v instanceof Date ? DateTime.fromJSDate(v) : DateTime.fromISO(String(v))).toMillis();

export interface Meta { changedAt: number; history: string[] }

/** Reads the recorded change of this ticket, or null when none is recorded */
export async function readMeta(q: Query, ticket: string): Promise<Meta | null> {
  const r = await q(`SELECT changed_at, history FROM public.password_meta WHERE ticket_no = $1`, [ticket]);
  if (!r[0]) return null;
  const h = typeof r[0].history === "string" ? JSON.parse(r[0].history) : r[0].history;
  return { changedAt: toMs(r[0].changed_at), history: Array.isArray(h) ? h.filter((x: unknown): x is string => typeof x === "string") : [] };
}

/** I use this for a person on his first password: his 180 days begin now (nothing changes if a row exists already) */
export async function startClock(q: Query, ticket: string): Promise<void> {
  await q(`INSERT INTO public.password_meta (ticket_no, changed_at, history) VALUES ($1, now(), '[]'::jsonb) ON CONFLICT (ticket_no) DO NOTHING`, [ticket]);
}

/** I record a changed password in one statement: now is the day, and the hash it replaced goes to the front of the history (the 5 newest are kept) */
export async function recordChange(q: Query, ticket: string, replacedHash: string): Promise<void> {
  await q(
    `INSERT INTO public.password_meta (ticket_no, changed_at, history) VALUES ($1, now(), jsonb_build_array($2::text))
     ON CONFLICT (ticket_no) DO UPDATE SET changed_at = now(), history = (
       SELECT COALESCE(jsonb_agg(x ORDER BY n), '[]'::jsonb) FROM (
         SELECT x, n FROM jsonb_array_elements_text(jsonb_build_array($2::text) || public.password_meta.history) WITH ORDINALITY AS t(x, n) ORDER BY n LIMIT ${HISTORY_KEEP}
       ) s)`,
    [ticket, replacedHash],
  );
}

/** Gives the one-time codes, kept in password_otp (and counted in password_otp_log) */
export function otpStoreOver(q: Query): OtpStore {
  return {
    async get(ticket): Promise<OtpRow | null> {
      const r = await q(`SELECT code_hash, expires_at, tries, sent_at FROM public.password_otp WHERE ticket_no = $1`, [ticket]);
      return r[0] ? { codeHash: String(r[0].code_hash), expiresAt: toMs(r[0].expires_at), tries: Number(r[0].tries), sentAt: toMs(r[0].sent_at) } : null;
    },
    async put(ticket, row) {
      await q(
        `INSERT INTO public.password_otp (ticket_no, code_hash, expires_at, tries, sent_at, channel, sent_to) VALUES ($1, $2, to_timestamp($3 / 1000.0), 0, to_timestamp($4 / 1000.0), $5, $6)
         ON CONFLICT (ticket_no) DO UPDATE SET code_hash = EXCLUDED.code_hash, expires_at = EXCLUDED.expires_at, tries = 0, sent_at = EXCLUDED.sent_at, channel = EXCLUDED.channel, sent_to = EXCLUDED.sent_to`,
        [ticket, row.codeHash, row.expiresAt, row.sentAt, row.channel, row.sentTo],
      );
      await q(`INSERT INTO public.password_otp_log (ticket_no, sent_at) VALUES ($1, to_timestamp($2 / 1000.0))`, [ticket, row.sentAt]);
      await q(`DELETE FROM public.password_otp_log WHERE sent_at < now() - interval '1 day'`);
    },
    async setTries(ticket, tries) { await q(`UPDATE public.password_otp SET tries = $2 WHERE ticket_no = $1`, [ticket, tries]); },
    async clear(ticket) { await q(`DELETE FROM public.password_otp WHERE ticket_no = $1`, [ticket]); },
    async sentInLastHour(ticket, now) {
      const r = await q(`SELECT count(*)::int AS n FROM public.password_otp_log WHERE ticket_no = $1 AND sent_at > to_timestamp($2 / 1000.0) - interval '1 hour'`, [ticket, now]);
      return Number(r[0]?.n ?? 0);
    },
  };
}

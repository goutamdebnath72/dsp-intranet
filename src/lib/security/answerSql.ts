// src/lib/security/answerSql.ts
//
// THE SQL THE MODEL WROTE STAYS ON THE SERVER (the owner, 22 Nov 2026). The search bar no longer shows it, and a screen that does not show it must not receive it either: it spells out the tables and columns
// of the directory to anybody who opens the browser's network tab. The server keeps it (public.nl2sql_log, and one line in the server log in development: src/lib/nl2sql/log.ts), so a wrong answer can still be checked.
// Used on the answer that is about to leave the search route, next to maskAnswer. Pure: it returns a copy.

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
const isObj = (v: unknown): v is Record<string, Json> => !!v && typeof v === "object" && !Array.isArray(v);

/** the same answer with the `sql` of every `nl2sql` block emptied (the field stays, as an empty string, so the shape of the answer does not change) */
export function withoutSql<T>(value: T): T {
  const walk = (v: Json): Json => {
    if (Array.isArray(v)) return v.map(walk);
    if (!isObj(v)) return v;
    const out: Record<string, Json> = {};
    for (const [k, x] of Object.entries(v)) {
      if (k === "nl2sql" && isObj(x) && "sql" in x) out[k] = { ...x, sql: "" };
      else out[k] = walk(x);
    }
    return out;
  };
  return walk(value as unknown as Json) as unknown as T;
}

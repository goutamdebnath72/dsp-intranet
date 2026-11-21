// src/lib/security/revealCap.ts
//
// HOW MANY CONTACT DETAILS ONE PERSON MAY ASK FOR IN AN HOUR. Every reveal and every copy is written to public.contact_access_log (who, whose, when); that same table is the counter, so the cap is the same
// for every server copy (it does not live in one copy's memory) and costs one small indexed-by-nothing count per reveal (a reveal is a person pressing a button, a handful an hour). A person who needs
// more than this in an hour is not reading a directory, he is copying it. Pure apart from the `query` the caller gives.

/** reveals and copies one ticket may make in an hour */
export const REVEALS_PER_HOUR = 120;
/** of those, how many may be SAIL P.Nos: the P.No. is also the first password, so it has a cap of its own, far below the other (logged as the field "sailpno") */
export const PNO_REVEALS_PER_HOUR = 20;

export type Query = (sql: string, params: unknown[]) => Promise<Array<Record<string, unknown>>>;

/** how many log rows this ticket has written in the last hour */
export async function accessesInLastHour(query: Query, viewerTicketNo: string): Promise<number> {
  const rows = await query(`SELECT count(*)::int AS n FROM public.contact_access_log WHERE "viewerTicketNo" = $1 AND "accessedAt" > now() - interval '1 hour'`, [viewerTicketNo]);
  return Number(rows[0]?.n ?? 0);
}

/** true when this ticket may reveal one more */
export async function mayReveal(query: Query, viewerTicketNo: string, limit: number = REVEALS_PER_HOUR): Promise<boolean> {
  return (await accessesInLastHour(query, viewerTicketNo)) < limit;
}

/** how many P.No. reveals this ticket has written in the last hour */
export async function pnoRevealsInLastHour(query: Query, viewerTicketNo: string): Promise<number> {
  const rows = await query(`SELECT count(*)::int AS n FROM public.contact_access_log WHERE "viewerTicketNo" = $1 AND field = 'sailpno' AND "accessedAt" > now() - interval '1 hour'`, [viewerTicketNo]);
  return Number(rows[0]?.n ?? 0);
}

/** true when this ticket may reveal one more P.No. */
export async function mayRevealPno(query: Query, viewerTicketNo: string, limit: number = PNO_REVEALS_PER_HOUR): Promise<boolean> {
  return (await pnoRevealsInLastHour(query, viewerTicketNo)) < limit;
}

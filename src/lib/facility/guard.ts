// src/lib/facility/guard.ts
//
// THE GUARD AGAINST A LOST UPDATE, once for every tool (it was written four times: change and delete of the employee manager, change and delete of the PAX editor).
// A change or a delete is for the record AS THE PERSON SAW IT. The tool says how to lock and read the record and how to work out its version; the guard answers
//   missing  there is no such record any more                               nothing is written
//   stale    the record is not what he saw (somebody changed it first)       nothing is written; he gets the record as it is now (as THIS person may see it) and who changed it last
//   fresh    it is the record he saw: here it is, locked, go on
// (The version itself is src/lib/concurrency/version.ts; the last change is src/lib/facility/audit.ts.)

import { sameVersion } from "@/lib/concurrency/version";
import { lastChangeOf } from "./audit";
import type { FacilityKey } from "./registry";
import type { LastChange, QueryFn } from "./types";

export type Guarded<Row, Cur> = { status: "missing" } | { status: "stale"; current: Cur; last: LastChange | null } | { status: "fresh"; row: Row };

export async function guardRecord<Row, Cur>(
  q: QueryFn,
  facility: FacilityKey,
  id: number,
  o: { sent: string | undefined; load: () => Promise<Row | null>; version: (row: Row) => string; current: (row: Row) => Cur },
): Promise<Guarded<Row, Cur>> {
  const row = await o.load();
  if (row === null) return { status: "missing" };
  if (!sameVersion(o.sent, o.version(row))) return { status: "stale", current: o.current(row), last: await lastChangeOf(q, facility, id) };
  return { status: "fresh", row };
}

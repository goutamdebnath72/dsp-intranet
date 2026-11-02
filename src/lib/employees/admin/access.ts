// src/lib/employees/admin/access.ts
//
// The server side of the employee manager (step 66a): the one-word decision the omnibar needs ("is this person allowed to open the manager?"). The database connection and the logged-in person are the PAX
// editor's (src/lib/pax/admin/access.ts): the application's OWN connection, never the language model's read-only client; the ticket from the login session, never anything typed.

import type { DataSource } from "typeorm";
import { typeormPaxDb } from "@/lib/pax/admin/access";
import { rowsOf } from "@/lib/pax/admin/rows";
import type { QueryFn } from "@/lib/pax/store";
import { authorityOf, type EmpDb } from "./store";
import type { Authority } from "./types";

export { sessionActor } from "@/lib/pax/admin/access";

/**
 * The employee manager's database: the application's own connection, in a transaction per request. It carries the connection as its KEY (step 67d), so that the store can remember the table layout and the code
 * lists for a few minutes per database: a new wrapper is made for every request, the connection is the one thing that stays.
 */
export const typeormEmpDb = (ds: DataSource): EmpDb => ({
  cacheKey: ds,
  run: (fn) => ds.transaction((m) => fn(async (sql, params) => rowsOf(await m.query(sql, params as never[])))),
});

/** HOD, delegate, or null for this ticket. A failing read means null (never open the manager on doubt). */
export async function authorityForTicket(ds: DataSource, ticket: string | null | undefined): Promise<Authority | null> {
  try {
    return await typeormPaxDb(ds).run((q: QueryFn) => authorityOf(q, ticket));
  } catch {
    return null;
  }
}

// src/lib/employees/admin/access.ts
//
// The server side of the employee manager (step 66a): the one-word decision the omnibar needs ("is this person allowed to open the manager?"). The database connection and the logged-in person are the PAX
// editor's (src/lib/pax/admin/access.ts): the application's OWN connection, never the language model's read-only client; the ticket from the login session, never anything typed.

import type { DataSource } from "typeorm";
import { typeormPaxDb } from "@/lib/pax/admin/access";
import type { QueryFn } from "@/lib/pax/store";
import { authorityOf } from "./store";
import type { Authority } from "./types";

export { sessionActor, typeormPaxDb as typeormEmpDb } from "@/lib/pax/admin/access";

/** HOD, delegate, or null for this ticket. A failing read means null (never open the manager on doubt). */
export async function authorityForTicket(ds: DataSource, ticket: string | null | undefined): Promise<Authority | null> {
  try {
    return await typeormPaxDb(ds).run((q: QueryFn) => authorityOf(q, ticket));
  } catch {
    return null;
  }
}

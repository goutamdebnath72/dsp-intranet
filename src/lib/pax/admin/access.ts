// src/lib/pax/admin/access.ts
//
// The server side of the PAX admin panel (step 64a): the database through the application's OWN connection (never the language model's read-only client),
// the logged-in person, and the one-word decision the omnibar needs ("is this person allowed to open the editor?").

import type { DataSource } from "typeorm";
import { getSessionTicket } from "@/lib/apiAuth";
import type { QueryFn } from "../store";
import { rowsOf } from "./rows";
import { authorityOf, type Actor, type Authority, type PaxDb } from "./store";

export const typeormPaxDb = (ds: DataSource): PaxDb => ({
  run: (fn) => ds.transaction((m) => fn(async (sql, params) => rowsOf(await m.query(sql, params as never[])))),
});

/** The name of an employee from the people directory, by ticket; null when there is none (or the read fails: the name is only shown, never decided on). */
export async function nameOfTicket(ds: DataSource, ticket: string | null | undefined): Promise<string | null> {
  if (!ticket) return null;
  const { searchEmployeesById } = await import("@/lib/search/employeeSearch");
  const rows = await searchEmployeesById(ds, { kind: "ticket", value: ticket }).catch(() => []);
  return rows.find((r) => String(r.ticketNo).trim() === ticket)?.name?.trim() || null;
}

/** The logged-in person: the ticket from the session, the name from the people directory (the audit line carries both). Null when nobody is logged in. */
export async function sessionActor(ds: DataSource): Promise<Actor | null> {
  const ticket = await getSessionTicket();
  if (!ticket) return null;
  const name = await nameOfTicket(ds, ticket);
  return { ticket, name: name || ticket };
}

/** For the omnibar: HOD, delegate, or null for this ticket. A failing read means null (never open the editor on doubt). */
export async function authorityForTicket(ds: DataSource, ticket: string | null | undefined): Promise<Authority | null> {
  try {
    return await typeormPaxDb(ds).run((q: QueryFn) => authorityOf(q, ticket));
  } catch {
    return null;
  }
}

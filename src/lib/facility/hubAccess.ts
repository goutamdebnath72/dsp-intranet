// src/lib/facility/hubAccess.ts
//
// The management page's two questions to the database: what does this ticket hold, and what is the name of the person who holds it. Read only; I use the same rule every tool uses (authority.ts).

import type { DataSource } from "typeorm";
import { authoritiesOfAll } from "./authority";
import type { Authorities } from "./hub";

export async function authoritiesForTicket(ds: DataSource, ticket: string | null | undefined): Promise<Authorities> {
  return authoritiesOfAll(async (sql, params) => ds.query(sql, params as never[]), ticket);
}

export async function nameOfTicket(ds: DataSource, ticket: string | null | undefined): Promise<string | null> {
  if (!ticket) return null;
  const { searchEmployeesById } = await import("@/lib/search/employeeSearch");
  const rows = await searchEmployeesById(ds, { kind: "ticket", value: ticket }).catch(() => []);
  return rows.find((r) => String(r.ticketNo).trim() === ticket)?.name?.trim() || null;
}

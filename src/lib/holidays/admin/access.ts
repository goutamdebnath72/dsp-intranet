// src/lib/holidays/admin/access.ts
//
// Access helpers and session resolution for the Holiday Manager facility.

import type { DataSource } from "typeorm";
import { getSessionTicket } from "@/lib/apiAuth";
import { authorityOf } from "@/lib/facility/authority";
import type { Actor, Authority } from "@/lib/facility/types";
import type { HolidayDb } from "./store";

export const typeormHolidayDb = (ds: DataSource): HolidayDb => ({
  run: (fn) =>
    ds.transaction(async (m) => {
      const q = async (sql: string, params?: unknown[]) => m.query(sql, params as never[]);
      return fn(q);
    }),
  cacheKey: ds,
});

export async function nameOfTicket(ds: DataSource, ticket: string | null | undefined): Promise<string | null> {
  if (!ticket) return null;
  const { searchEmployeesById } = await import("@/lib/search/employeeSearch");
  const rows = await searchEmployeesById(ds, { kind: "ticket", value: ticket }).catch(() => []);
  return rows.find((r) => String(r.ticketNo).trim() === ticket)?.name?.trim() || null;
}

export async function sessionActor(ds: DataSource): Promise<Actor | null> {
  const ticket = await getSessionTicket();
  if (!ticket) return null;
  const name = await nameOfTicket(ds, ticket);
  return { ticket, name: name || ticket };
}

export async function authorityForTicket(ds: DataSource, ticket: string | null | undefined): Promise<Authority | null> {
  try {
    return await typeormHolidayDb(ds).run((q) => authorityOf(q, "holiday", ticket));
  } catch {
    return null;
  }
}

// src/lib/superAdmin.ts
//
// Super-admin = the HOD of C&IT who holds highest and sole initial authority
// across all management facilities (Employee, PAX, Holidays, Circulars,
// Announcements, Contact Access Log).
//
// Single source of truth is declared in src/lib/constants.ts as HOD_CIT_TICKET.
// An optional SUPERADMIN_TICKETS environment variable can supply additional
// or overriding tickets if ever needed.

import { HOD_CIT_TICKET } from "@/lib/constants";

const envTickets = (process.env.SUPERADMIN_TICKETS || "")
  .split(",")
  .map((t) => t.trim())
  .filter(Boolean);

const SUPERADMIN_TICKETS: ReadonlySet<string> = new Set(
  envTickets.length > 0 ? envTickets : [HOD_CIT_TICKET],
);

export function isSuperAdmin(ticketNo?: string | null): boolean {
  const t = (ticketNo || "").trim();
  if (!t) return false;
  // The environment OVERRIDES: when SUPERADMIN_TICKETS is set, only those tickets are HOD; the built-in HOD_CIT_TICKET is
  // the default for when it is not set. (It used to be accepted ALWAYS, so when the HOD changed and the variable was
  // updated, the previous HOD stayed HOD of all six tools until the code itself was edited.)
  return SUPERADMIN_TICKETS.has(t);
}

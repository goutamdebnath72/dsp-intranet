// src/lib/facility/authorise.ts
//
// WHAT BOTH TOOLS DO WITH A REQUEST TO AUTHORISE SOMEBODY, once: look the person up by ticket (any employee, executive or not) and hand the kit his name and the HOD's confirmation for a non-executive.
// (Both handlers had the same code, written twice.)

import type { EmployeeResult } from "@/lib/search/employeeSearch";

export type GrantTarget = { ok: true; ticket: string; name: string; confirmNonExecutive: boolean } | { ok: false; reason: string };

export async function resolveGrantTarget(b: Record<string, unknown>, findByTicket: (ticket: string) => Promise<EmployeeResult[]>): Promise<GrantTarget> {
  const ticket = String(b.ticket ?? "").trim().slice(0, 20);
  const person = (await findByTicket(ticket).catch(() => [])).find((p) => String(p.ticketNo).trim() === ticket);
  if (!person) return { ok: false, reason: "No employee with this ticket number was found." };
  return { ok: true, ticket, name: person.name, confirmNonExecutive: b.confirmNonExecutive === true };
}

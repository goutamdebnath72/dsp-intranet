// src/lib/facility/registry.ts
//
// The tools that use the shared kit. A new tool is one more line here. `lock` is the name of the tool's global write lock (two saves of one tool never run at the same moment): the SAME words the employee manager
// and the PAX editor already used, so moving them onto the kit changes nothing about how they lock.

export const FACILITIES = {
  // allowNonExecutive: the HOD may give this tool to a non-executive (after confirming). Owner, 2 Nov 2026: every tool except the Contact Access Log (not built yet; it will say false).
  employee: { label: "Employee manager", lock: "employee_roster", allowNonExecutive: true },
  pax: { label: "PAX directory editor", lock: "pax_directory", allowNonExecutive: true },
  holiday: { label: "Holiday manager", lock: "holiday_year", allowNonExecutive: true },
  circular: { label: "Circular manager", lock: "circulars", allowNonExecutive: true },
  announcement: { label: "Announcement manager", lock: "announcements", allowNonExecutive: true },
  access_log: { label: "Contact access log", lock: "access_log", allowNonExecutive: false },
} as const;

export type FacilityKey = keyof typeof FACILITIES;

export const isFacilityKey = (k: unknown): k is FacilityKey => typeof k === "string" && Object.prototype.hasOwnProperty.call(FACILITIES, k);

/** The statement that takes a tool's global write lock for the rest of the transaction. */
export const lockSql = (f: FacilityKey): string => `SELECT pg_advisory_xact_lock(hashtext('${FACILITIES[f].lock}')::bigint)`;

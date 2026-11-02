// src/lib/facility/registry.ts
//
// The tools that use the shared kit. A new tool is one more line here. `lock` is the name of the tool's global write lock (two saves of one tool never run at the same moment): the SAME words the employee manager
// and the PAX editor already used, so moving them onto the kit changes nothing about how they lock.

export const FACILITIES = {
  employee: { label: "Employee manager", lock: "employee_roster" },
  pax: { label: "PAX directory editor", lock: "pax_directory" },
} as const;

export type FacilityKey = keyof typeof FACILITIES;

export const isFacilityKey = (k: unknown): k is FacilityKey => typeof k === "string" && Object.prototype.hasOwnProperty.call(FACILITIES, k);

/** The statement that takes a tool's global write lock for the rest of the transaction. */
export const lockSql = (f: FacilityKey): string => `SELECT pg_advisory_xact_lock(hashtext('${FACILITIES[f].lock}')::bigint)`;

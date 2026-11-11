// src/lib/holidays/admin/types.ts
//
// Shared types for the Holiday Manager facility (server and UI).

import type { DelegateView, AuditRow, LastChange } from "@/lib/facility/types";

export type HolidayAdminOp = "seed" | "clear" | "delegate" | "history";

/** What the omnibar hands the panel when an authorised person asks to manage holidays. */
export interface HolidayAdminOpen {
  op: HolidayAdminOp;
  /** hod = the HOD of C&IT (HOD_CIT_TICKET in constants.ts); delegate = an executive or confirmed non-executive authorised for this tool. */
  role: "hod" | "delegate";
  /** The logged-in person's name from session. */
  name?: string;
  ticket?: string;
  prefill?: { year?: number };
}

/** Information about a year's holidays in the database. */
export interface HolidayYearView {
  year: number;
  totalHolidays: number;
  chCount: number;
  fhCount: number;
  rhCount: number;
  rhQuotaCount: number;
  policyChunkCount: number;
  /** Version hash for lost-update protection (HMAC) */
  version: string;
  lastChange: LastChange | null;
}

export type HolidayDelegateView = DelegateView;
export type HolidayAuditView = AuditRow;

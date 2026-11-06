// src/lib/circulars/admin/types.ts
//
// Types for Circular Management Facility (Modular Facility Kit).

import type { DelegateView, AuditRow, LastChange } from "@/lib/facility/types";

export type CircularAdminOp = "upload" | "recent" | "delegate" | "history";

/** What the omnibar hands the panel when an authorised person asks to manage or post circulars. */
export interface CircularAdminOpen {
  op: CircularAdminOp;
  /** hod = the HOD of C&IT (HOD_CIT_TICKET in constants.ts); delegate = an authorised employee. */
  role: "hod" | "delegate";
  /** The logged-in person's ticket from session. */
  ticket: string;
  /** The logged-in person's name from session. */
  name?: string;
  prefill?: {
    headline?: string;
  };
}

export interface RecentCircularView {
  id: number;
  headline: string;
  publishedAt: string | null;
  uploadedAt: string | null;
  authorTicketNo: string;
  authorName: string | null;
  pageCount: number;
  fileUrls: string[];
  fileUrl: string | null;
  serialNumber: number | null;
}

export type CircularDelegateView = DelegateView;
export type CircularAuditView = AuditRow;

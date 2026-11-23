// src/lib/circulars/admin/types.ts
//
// Here are the types for the Circular Management Facility (Modular Facility Kit).

import type { DelegateView, AuditRow, LastChange } from "@/lib/facility/types";

export type CircularAdminOp = "upload" | "recent" | "delegate" | "history";

/** This is what the omnibar hands the panel when an authorised person asks to manage or post circulars. */
export interface CircularAdminOpen {
  op: CircularAdminOp;
  /** Role: hod is the HOD of C&IT (HOD_CIT_TICKET in constants.ts); delegate is an authorised employee. */
  role: "hod" | "delegate";
  /** The logged-in person's ticket, taken from the session. */
  ticket: string;
  /** The logged-in person's name, taken from the session. */
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

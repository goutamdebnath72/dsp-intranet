// src/lib/accessLog/admin/types.ts
//
// Types for Contact Access Log Management Facility (Modular Facility Kit).

import type { DelegateView, AuditRow } from "@/lib/facility/types";

export type AccessLogAdminOp = "logs" | "delegate" | "history";

/** What the omnibar hands the panel when an authorised person asks to inspect or manage the contact access log. */
export interface AccessLogAdminOpen {
  op: AccessLogAdminOp;
  /** hod = the HOD of C&IT (HOD_CIT_TICKET in constants.ts); delegate = an authorised executive. */
  role: "hod" | "delegate";
  /** The logged-in person's ticket from session. */
  ticket: string;
  /** The logged-in person's name from session. */
  name?: string;
  prefill?: {
    viewer?: string;
    viewed?: string;
    field?: "mobile" | "email";
    action?: "reveal" | "copy";
  };
}

export interface AccessLogRowView {
  /** the log line's own id: a uuid string in the database (it was read as a number, which is NaN) */
  id: string;
  accessedAt: string;
  viewerTicketNo: string;
  viewerName: string | null;
  viewerDesignation: string | null;
  viewerDepartment: string | null;
  viewedTicketNo: string;
  viewedName: string | null;
  viewedDesignation: string | null;
  viewedDepartment: string | null;
  field: "mobile" | "email" | string;
  action: "reveal" | "copy" | string;
}

export interface AccessLogStatsView {
  total: number;
  reveals: number;
  copies: number;
  mobileCount: number;
  emailCount: number;
  uniqueViewers: number;
}

export interface AccessLogFilterInput {
  from?: string;
  to?: string;
  viewer?: string;
  viewed?: string;
  field?: string;
  action?: string;
  page?: number;
  pageSize?: number;
  sort?: "accessedAt" | "viewer" | "viewed" | "field" | "action";
  dir?: "asc" | "desc";
}

export interface AccessLogQueryResult {
  rows: AccessLogRowView[];
  total: number;
  stats: AccessLogStatsView;
  page: number;
  pageSize: number;
  totalPages: number;
  hasAction: boolean;
}

export type AccessLogDelegateView = DelegateView;
export type AccessLogAuditView = AuditRow;

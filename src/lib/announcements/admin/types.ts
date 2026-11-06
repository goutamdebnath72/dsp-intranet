// src/lib/announcements/admin/types.ts
//
// Types for Announcement Management Facility (Modular Facility Kit).

import type { DelegateView, AuditRow, LastChange } from "@/lib/facility/types";

export type AnnouncementAdminOp = "publish" | "recent" | "delegate" | "history";

/** What the omnibar hands the panel when an authorised person asks to publish or manage announcements. */
export interface AnnouncementAdminOpen {
  op: AnnouncementAdminOp;
  /** hod = the HOD of C&IT (HOD_CIT_TICKET in constants.ts); delegate = an authorised employee. */
  role: "hod" | "delegate";
  /** The logged-in person's ticket from session. */
  ticket: string;
  /** The logged-in person's name from session. */
  name?: string;
  prefill?: {
    title?: string;
    editId?: number;
  };
}

export interface AnnouncementItemView {
  id: number;
  title: string;
  content: string;
  contentText: string | null;
  date: string;
  createdAt: string;
  authorTicketNo: string;
  authorName: string | null;
  canEdit: boolean;
  hoursLeft: number;
  version: string;
}

export type AnnouncementDelegateView = DelegateView;
export type AnnouncementAuditView = AuditRow;

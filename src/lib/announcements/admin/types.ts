// src/lib/announcements/admin/types.ts
//
// My types for the Announcement Management Facility (Modular Facility Kit).

import type { DelegateView, AuditRow, LastChange } from "@/lib/facility/types";
import type { AnnouncementFileInfo } from "@/lib/announcements/attachment";

export type AnnouncementAdminOp = "publish" | "recent" | "delegate" | "history";

/** This is what the omnibar hands the panel when an authorised person asks to publish or manage announcements. */
export interface AnnouncementAdminOpen {
  op: AnnouncementAdminOp;
  /** hod = the HOD of C&IT (HOD_CIT_TICKET in constants.ts); delegate = an authorised employee. */
  role: "hod" | "delegate";
  /** The logged-in person's ticket, taken from the session. */
  ticket: string;
  /** The logged-in person's name, taken from the session. */
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
  /** the PDF of the announcement (name and size; I never give its address), or null */
  file?: AnnouncementFileInfo | null;
  /** how the announcement's text and its PDF went into the search index (ready or failed, and why), or null (not prepared yet) */
  searchIndex?: import("@/lib/announcements/searchIndex/tables").IndexState | null;
}

export type AnnouncementDelegateView = DelegateView;
export type AnnouncementAuditView = AuditRow;

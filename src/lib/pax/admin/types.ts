// src/lib/pax/admin/types.ts
//
// Shared by the server and the panel. This file has types only: nothing here runs.

export type PaxAdminOp = "add" | "modify" | "delete" | "delegate" | "manage";

/** This is what the omnibar hands the panel when an authorised person asked to change the directory. */
export interface PaxAdminOpen {
  op: PaxAdminOp;
  /** hod = the HOD of C&IT (SUPERADMIN_TICKETS); delegate = an executive the HOD has authorised. Only the HOD may delegate. */
  role: "hod" | "delegate";
  /** The logged-in person's name. I send it WITH the answer that opens the editor (step 67b) so that the header shows it on the very first paint, with no request. The server looks it up from the session's ticket; it is never typed. */
  name?: string;
  /** Words and a number picked out of the typed sentence, only to save typing. The person can change every one. */
  prefill?: { department?: string; number?: string; query?: string };
}

/** One saved line as the panel shows it, in the table's own wording (department, location, number). */
export interface PaxEntryView {
  id: number;
  department: string;
  location: string;
  number: string;
  /** The VERSION of this line as the person sees it (src/lib/concurrency/version.ts). A change or a delete must send it back; if the line has changed since, I refuse the save ("stale"). The server sets it. */
  version?: string;
}

/** The last change the editor recorded for a line: who, when, and what kind. I show it when a save is refused because somebody else changed the line first. */
export interface PaxLastChange { at: string; actorName: string; actorTicket: string; action: string }

export type ConflictKind = "same-number" | "same-place" | "similar-place";

export interface PaxConflict {
  kind: ConflictKind;
  /** The saved line(s) that clash. For same-place, all numbers of that place are listed. */
  existing: PaxEntryView[];
}

/** What the person may answer when an entry clashes: change the entry he typed, edit the saved one, or say (only when it is true) that it is another number of the same place or a different place. */
export type Acknowledge = "second-number" | "different";

export interface PaxDelegateView {
  ticket: string;
  name: string;
  grantedByName: string;
  grantedByTicket: string;
  grantedAt: string;  /** not an executive: I show these apart (amber) */
  nonExecutive?: boolean;
}

export interface PaxAuditView {
  at: string;
  actorName: string;
  actorTicket: string;
  actorRole: "hod" | "delegate";
  /** The editor's post, looked up in the people directory when the history is shown, because the history itself keeps only ticket and name. Empty when not found. */
  actorDesignation: string;
  action: "add" | "modify" | "delete" | "grant" | "revoke";
  /** The line as the history table shows it: the NEW line for an add or a change, the line that was removed for a delete. It is empty for an authorisation or a withdrawal. */
  department: string;
  location: string;
  number: string;
  /** For a change: the line as it was. For an authorisation or a withdrawal: the executive concerned, "RAKESH OJHA (412345)". */
  detail: string;
  summary: string;
}

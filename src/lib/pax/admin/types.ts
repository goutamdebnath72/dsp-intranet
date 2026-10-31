// src/lib/pax/admin/types.ts
//
// Shared by the server and the panel (types only: nothing here runs).

export type PaxAdminOp = "add" | "modify" | "delete" | "delegate" | "manage";

/** What the omnibar hands the panel when an authorised person asked to change the directory. */
export interface PaxAdminOpen {
  op: PaxAdminOp;
  /** hod = the HOD C&IT (SUPERADMIN_TICKETS); delegate = an executive the HOD has authorised. Only the HOD may delegate. */
  role: "hod" | "delegate";
  /** Words and a number picked out of the typed sentence, only to save typing; the person can change every one. */
  prefill?: { department?: string; number?: string; query?: string };
}

/** One saved line as the panel shows it (the table's own wording: department, location, number). */
export interface PaxEntryView {
  id: number;
  department: string;
  location: string;
  number: string;
}

export type ConflictKind = "same-number" | "same-place" | "similar-place";

export interface PaxConflict {
  kind: ConflictKind;
  /** The saved line(s) that clash. For same-place all numbers of that place are listed. */
  existing: PaxEntryView[];
}

/** What the person may answer when an entry clashes: change the entry he typed, edit the saved one, or (only when it is true) say it is another number of the same place / a different place. */
export type Acknowledge = "second-number" | "different";

export interface PaxDelegateView {
  ticket: string;
  name: string;
  grantedByName: string;
  grantedByTicket: string;
  grantedAt: string;
}

export interface PaxAuditView {
  at: string;
  actorName: string;
  actorTicket: string;
  actorRole: "hod" | "delegate";
  action: "add" | "modify" | "delete" | "grant" | "revoke";
  summary: string;
}

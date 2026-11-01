// src/lib/employees/admin/types.ts
//
// THE EMPLOYEE MANAGER: the shapes shared by the server and the panel (step 66a). No code here.

export type EmployeeAdminOp = "add" | "modify" | "delete" | "delegate" | "manage";
export type Authority = "hod" | "delegate";

/** What the search bar hands the panel when somebody who may use it asked for it. */
export interface EmployeeAdminOpen {
  op: EmployeeAdminOp;
  role: Authority;
  prefill?: { name?: string; ticket?: string; query?: string };
}

export type Cohort = "executive" | "nonexecutive";

export interface GradeRef { id: number; code: number; title: string; track: string; rankOrder: number }
export interface DepartmentRef { id: number; code: number; name: string; scope: "shared" | "executive" | "nonexecutive" }
export interface Lookups { grades: GradeRef[]; departments: DepartmentRef[] }

/** One employee as the form and the list show him. The two dates are EMPTY (and `datesVisible` false) for anybody but the HOD of C&IT. */
export interface EmployeeRecord {
  id: number;
  ticketNo: string;
  sailPno: string;
  name: string;
  cohort: Cohort;
  gradeId: number;
  gradeTitle: string;
  departmentId: number | null;
  departmentName: string;
  position: number;
  address: string;
  emailNic: string;
  webmail: string;
  /** The login account's mobile and e-mail as the search cards show them (never whole): empty when there is none. */
  mobileMasked: string;
  emailMasked: string;
  /** TRUE = a doctor with an ordinary managerial designation; null = not decided (the column may not exist). */
  doctor: boolean | null;
  dateOfBirth: string;
  dateOfJoining: string;
  datesVisible: boolean;
  hasLogin: boolean;
}

/** What a person may type (everything optional here: validate.ts says what is required). */
export interface EmployeeInput {
  ticketNo: string;
  sailPno: string;
  name: string;
  gradeId: number | null;
  departmentId: number | null;
  position: number | null;
  address: string;
  emailNic: string;
  webmail: string;
  /** The mobile (the CUG number of an executive) and the one general e-mail of a non-executive: the login account's. Empty on a change = keep what is there. */
  mobile: string;
  email: string;
  doctor: boolean | null;
  dateOfBirth: string | null;
  dateOfJoining: string | null;
}

export type FieldKey = keyof EmployeeInput;
export type FieldErrors = Partial<Record<FieldKey | "form", string>>;

export type AcknowledgeKind = "same-name";
export interface EmployeeConflict { kind: AcknowledgeKind; text: string; with: { id: number; ticketNo: string; name: string; departmentName: string } }

export interface DelegateView { ticket: string; name: string; grantedByName: string; grantedByTicket: string; grantedAt: string }

export interface ChangeView { field: string; label: string; from: string; to: string }
export interface AuditView {
  at: string;
  actorName: string;
  actorTicket: string;
  actorRole: Authority;
  actorDesignation: string;
  action: "add" | "modify" | "delete" | "grant" | "revoke";
  targetTicket: string;
  targetName: string;
  /** For a change: field by field, old to new (a date shows "hidden" to anybody but the HOD). For the others: one sentence. */
  changes: ChangeView[];
  summary: string;
}

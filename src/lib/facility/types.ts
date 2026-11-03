// src/lib/facility/types.ts
//
// The shapes every tool of the search bar shares (the employee manager, the PAX editor and the tools to come): who may act, who acted, a delegate, the answer of authorising someone, one line of history.
// Step 68a: nothing uses these yet; 68b and 68c move the employee manager and the PAX editor onto them (their own identical copies go away then).

export type QueryFn = (sql: string, params?: unknown[]) => Promise<Array<Record<string, unknown>>>;

/** The database as the tools see it: one transaction per `run`. `cacheKey` (optional) is what a remembered table layout hangs on (the database connection). */
export interface FacilityDb {
  run<T>(fn: (q: QueryFn) => Promise<T>): Promise<T>;
  cacheKey?: object;
}

/** hod = the head of C&IT (known by ticket, from the environment); delegate = an executive the HOD authorised for this tool. */
export type Authority = "hod" | "delegate";

export interface Actor { ticket: string; name: string }

/** The last add or change of one record (who, when, what kind; never a value). */
export interface LastChange { at: string; actorName: string; actorTicket: string; action: string }

export interface DelegateView { ticket: string; name: string; grantedByName: string; grantedByTicket: string; grantedAt: string; /** not an executive (his ticket does not start with 4): shown apart in the list */ nonExecutive: boolean }

export type DelegateResult =
  | { status: "ok" }
  | { status: "forbidden" }
  | { status: "invalid"; reason: string }
  | { status: "already" }
  | { status: "not-delegate" }
  /** A NON-EXECUTIVE is being authorised and the HOD has not confirmed it yet: nothing was written. */
  | { status: "needs-confirmation"; reason: string };

/** One line of the history, as stored (the tool turns it into a sentence). */
export interface AuditRow {
  at: string;
  actorTicket: string;
  actorName: string;
  actorRole: Authority;
  action: string;
  targetId: number | null;
  targetTicket: string;
  targetName: string;
  before: unknown;
  after: unknown;
  note: string;
}

// src/lib/security/visitorView.ts
//
// WHAT A PERSON WHO HAS NOT SIGNED IN MAY SEE OF AN EMPLOYEE: the name (with Dr. or PhD where it applies) and the department, nothing else (the owner's choice "C", 21 Nov 2026). The ticket number is half of every
// login, and a designation, a P.No., a contact hint or an executive's badge is for colleagues who have signed in. This is done on the SERVER, on the answer that is about to leave it, so no screen has to remember to
// hide anything: an employee card is cut down to an allow-list of fields (so a field added later is hidden until it is allowed here), and a table answer loses the columns that carry those details.
// Pure: it never changes what it is given, it returns a copy.
//
// SWITCHED OFF (the owner, 22 Nov 2026): a visitor sees the same cards as a signed-in person, with the contacts masked, and a click on a masked mobile or e-mail opens the login window and, after the sign-in, reveals it
// (audited). The P.No. stays masked for everybody (it is also the first password). This code is kept ready: set VISITOR_CUT_ENABLED to true and the two search routes cut an answer for a visitor again.

/** false = a visitor sees the full (masked) cards; true = a visitor sees name and department only. Read by the two search routes. */
export const VISITOR_CUT_ENABLED = false;

/** the only fields of an employee card a visitor receives */
const CARD_FIELDS = ["id", "type", "name", "title", "phd", "department", "departmentCode", "matchKind", "score"] as const;

/** a column of a table answer is hidden from a visitor when its key says it is one of these */
const HIDDEN_COLUMN = /(ticket|pno|sail|designation|grade|rank|seniority|position|mobile|contact|cug|phone|email|mail|exec|discipline|doctor|dob|birth|joining|retire|qualification)/i;

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
const isObj = (v: unknown): v is Record<string, Json> => !!v && typeof v === "object" && !Array.isArray(v);

/** one employee card as a visitor sees it: the allowed fields, and the rest hidden in the form the screen already handles (an empty ticket, no designation, no contact) */
export function visitorCard(c: Record<string, Json>): Record<string, Json> {
  const out: Record<string, Json> = {};
  for (const k of CARD_FIELDS) if (k in c) out[k] = c[k];
  return { ...out, ticketNo: "", sailPNo: null, designation: null, mobileMasked: null, emailMasked: null, hasMobile: false, hasEmail: false, isExecutive: false };
}

/** the same answer, with every employee card cut down and the sensitive columns of every table taken out (anywhere in it) */
export function visitorView<T>(value: T): T {
  const walk = (v: Json): Json => {
    if (Array.isArray(v)) return v.map(walk);
    if (!isObj(v)) return v;
    if (v.type === "employee" && typeof v.name === "string" && "ticketNo" in v) return visitorCard(v);
    const hide = Array.isArray(v.columns) && Array.isArray(v.rows)
      ? new Set((v.columns as Json[]).map((c) => (isObj(c) && typeof c.key === "string" ? c.key : typeof c === "string" ? c : "")).filter((k) => k && HIDDEN_COLUMN.test(k)))
      : null;
    const out: Record<string, Json> = {};
    for (const [k, x] of Object.entries(v)) {
      if (hide && hide.size && k === "columns") out[k] = (x as Json[]).filter((c) => !hide.has(isObj(c) && typeof c.key === "string" ? c.key : typeof c === "string" ? c : ""));
      else if (hide && hide.size && k === "rows") out[k] = (x as Json[]).map((r) => (isObj(r) ? Object.fromEntries(Object.entries(r).filter(([ck]) => !hide.has(ck))) : r));
      else out[k] = walk(x);
    }
    return out;
  };
  return walk(value as unknown as Json) as unknown as T;
}

// src/lib/employees/admin/contact.ts
//
// THE CONTACT RULES OF AN EMPLOYEE RECORD (step 66b; owner, 1 Nov 2026). PURE.
//   Executive      the NIC mail ends with @sail.in, the web-mail with @saildsp.co.in (both optional, the domains are enforced); the one general e-mail field is NOT used.
//                  The mobile is the CUG number: ten digits, 94347 and then 9 (the usual) or 2 or 3 (the exceptions) and four digits. Every executive has one: it is required.
//   Non-executive  ONE e-mail field, any domain (gmail, hotmail ...), optional; (in rare cases a non-executive has the privilege of a SAIL address: he types it in this one field and it is kept as such).
//                  The mobile is any ten-digit number that does not start with 0, optional.
// WHERE THEY ARE KEPT (the app's own tables): the mobile and the general e-mail are in the employee's LOGIN account (user.contactNo, user.email: what the search cards mask and reveal); the NIC and the
// web-mail are the roster's own columns (employee_roster.email_nic, webmail_saildsp).
// The search cards show a mobile as its first six digits and an e-mail as xxxxxx@domain: the manager shows the same and never a whole number.

export const NIC_DOMAIN = "@sail.in";
export const WEBMAIL_DOMAIN = "@saildsp.co.in";
export const CUG_RE = /^94347[923]\d{4}$/;
export const MOBILE_RE = /^[1-9]\d{9}$/;
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isEmail = (v: string): boolean => EMAIL_OK.test(v);
export const endsWithDomain = (email: string, domain: string): boolean => email.toLowerCase().endsWith(domain);

/** What a person types for a number ("+91 94347 91234", "094347-91234") as the ten digits it is; anything else as the digits found. */
export function normalizeMobile(v: unknown): string {
  let d = String(v ?? "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return d;
}

/** The same masks as the search cards (rosterQuery.ts): the first six digits, then x; xxxxxx and the domain. */
export function maskMobile(m: string | null | undefined): string {
  if (!m) return "";
  const d = String(m).replace(/\D/g, "");
  if (d.length < 4) return "xxxx";
  return `${d.slice(0, 6)}${"x".repeat(Math.max(0, d.length - 6))}`;
}
export function maskEmail(e: string | null | undefined): string {
  if (!e) return "";
  const at = String(e).indexOf("@");
  return at <= 0 ? "xxxxxx" : `xxxxxx${String(e).slice(at)}`;
}

export const MOBILE_HINT_EXECUTIVE = "The CUG number: 10 digits, 94347 and then 9 (or 2, 3).";
export const MOBILE_HINT_NONEXECUTIVE = "Optional: 10 digits.";

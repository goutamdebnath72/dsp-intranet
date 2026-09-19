// src/lib/superAdmin.ts
//
// Super-admin = the HOD C&IT who alone can view the contact-access log.
// Identity is by TICKET NUMBER (the stable login id) — configured via env so it
// can change without a code edit, and comma-separated if it ever needs more
// than one holder.
//
// NEVER keyed off the SAIL personal number: that is only the password and will
// change. This is a SERVER-ONLY var (no NEXT_PUBLIC_ prefix) — read in
// auth.ts (session callback) and the admin access-log API, both server-side.
//
//   .env.local / Vercel:  SUPERADMIN_TICKETS=498301
//   (multiple: SUPERADMIN_TICKETS=498301,490123)

const SUPERADMIN_TICKETS: ReadonlySet<string> = new Set(
  (process.env.SUPERADMIN_TICKETS || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean),
);

export function isSuperAdmin(ticketNo?: string | null): boolean {
  return !!ticketNo && SUPERADMIN_TICKETS.has(ticketNo.trim());
}

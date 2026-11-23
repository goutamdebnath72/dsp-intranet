// src/lib/security/maskPno.ts
//
// The SAIL P.No. is a password: it is the first password of every account (src/lib/employees/admin/store.ts hashes it), so I never let it leave the server in a directory answer. A card shows it
// masked: the first and the last character only ("D000896" -> "D•••••6"), enough to tell two people apart, not enough to sign in (the hidden part is five characters, and the login locks after a few
// wrong tries: src/lib/auth.ts). Pure.

/** I hide a value of 3 characters or fewer entirely: "D000896" -> "D•••••6"; nothing -> null */
export function maskPno(p: string | null | undefined): string | null {
  const s = (p ?? "").trim();
  if (!s) return null;
  if (s.length <= 3) return "•".repeat(s.length);
  return `${s[0]}${"•".repeat(s.length - 2)}${s[s.length - 1]}`;
}

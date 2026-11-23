// src/lib/security/sameOrigin.ts
//
// Is the request from this site's own pages? A browser sends Origin on a cross-site POST; the site's own pages send the same host as the request's Host. I let a request with no Origin (a script, the same page in some cases) pass: the
// session cookie is SameSite=Lax, which already keeps another site's form from carrying it. Pure.
export function sameOrigin(origin: string | null | undefined, host: string | null | undefined): boolean {
  if (!origin) return true;
  try { return !!host && new URL(origin).host === host; } catch { return false; }
}

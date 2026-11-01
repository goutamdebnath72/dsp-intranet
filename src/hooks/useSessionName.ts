"use client";

// src/hooks/useSessionName.ts
//
// THE LOGGED-IN PERSON'S NAME FROM THE LOGIN COOKIE'S SESSION (step 67b; owner, 1 Nov 2026: "we can get the person's data from the session cookie and need not do a fresh server request").
// The session is already in the browser (the application is wrapped in a SessionProvider), so reading the name costs NO request. It is for DISPLAY ONLY: it is shown in the header of the employee manager and of
// the PAX editor while nothing better is known. Nothing is ever DECIDED on it: who may change what is decided by the server, from the database, on every request (a withdrawn authority takes effect at once;
// a cookie would keep saying "authorised" until it expired). The owner checked that every login name equals the people directory's name, so the two cannot disagree.
// Safe where there is no provider (tests, a page without one): it returns null and never throws (useSession would throw).

import { useContext } from "react";
import { SessionContext } from "next-auth/react";

/** The name in a session, trimmed; null for no session, no name or a blank one. */
export function nameFromSession(session: unknown): string | null {
  const name = (session as { user?: { name?: unknown } } | null | undefined)?.user?.name;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

export function useSessionName(): string | null {
  const context = useContext(SessionContext);
  return nameFromSession(context?.data);
}

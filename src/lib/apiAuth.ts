// src/lib/apiAuth.ts
//
// Who is calling? The login session is the only trustworthy answer. Anything the browser says about
// itself (a "ticket" query parameter, a "userKey" in a request body) can be typed by anybody, so
// routes that act on a person's behalf must use this helper and ignore what the browser claims.

import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth";

/** The signed-in user's ticket number from the server-side session, or null when nobody is signed in. */
export async function getSessionTicket(): Promise<string | null> {
  try {
    const session = await getServerSession(await getAuthOptions());
    const t = (session?.user as any)?.ticketNo;
    return typeof t === "string" && t.trim() ? t.trim() : null;
  } catch {
    return null;
  }
}

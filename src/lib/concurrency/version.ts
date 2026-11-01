// src/lib/concurrency/version.ts
//
// THE VERSION OF A RECORD (step 67b; owner, 1 Nov 2026: "since several authorised people may change the same employee or the same PAX line we have to guard that robustly").
//
// THE PROBLEM IT SOLVES: the LOST UPDATE. A opens Ravi at 10:00 and B opens him at 10:01; A saves a new designation at 10:05; B, who only wants to fix the address, saves at 10:10 with a form that still holds the
// OLD designation: without a guard B's save puts it back and A's work is gone, with nobody told. (The global write lock the stores already take makes two saves at the very same instant safe; it cannot know
// that B's form is out of date.)
// THE GUARD: every record the manager shows carries a VERSION: a short token worked out from the fields that can be changed. A change or a delete must send the version the person SAW. The server, with the row
// locked, works the version out again from what is in the database NOW; if it differs the save is REFUSED ("stale"), nothing is written, and the person is shown what changed and by whom.
// WHY A SIGNED TOKEN (HMAC with a secret of the server) AND NOT A PLAIN HASH: the token goes to the browser, the browser shows a mobile number only masked (943479xxxx); a plain hash of the real fields would let
// anybody try the 10 000 possible endings and learn the number. With the server's secret nobody can. WHY CONTENT AND NOT A COUNTER: it also notices a change made by anything that does not know about the counter
// (a SQL script, another program), needs no new column, and if the fields are the same again (A changes a value and puts it back) the save really is safe.
// The secret is the one NextAuth already needs (NEXTAUTH_SECRET). Without any secret (a development machine) a fixed text is used: the token then only asserts "this is the state I saw", which gives no power.

import { createHmac, timingSafeEqual } from "node:crypto";

export function versionSecret(): string {
  return process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || process.env.RECORD_VERSION_SECRET || "development-only-record-version-secret";
}

/** The token of a record: `scope` (what kind of record), then its fields in a fixed order. "Nothing" and "an empty text" are different; numbers and flags are written as text. */
export function versionOf(scope: string, parts: ReadonlyArray<unknown>, secret: string = versionSecret()): string {
  const canonical = JSON.stringify([scope, ...parts.map((p) => (p === null || p === undefined ? null : typeof p === "string" ? p : String(p)))]);
  return createHmac("sha256", secret).update(canonical).digest("base64url").slice(0, 22);
}

/** Is the token a person sent the token of the state the database is in now? Anything that is not a text of the right length is "no". Compared in constant time. */
export function sameVersion(sent: unknown, current: string): boolean {
  if (typeof sent !== "string" || sent.length !== current.length) return false;
  return timingSafeEqual(Buffer.from(sent), Buffer.from(current));
}

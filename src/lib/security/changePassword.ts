// src/lib/security/changePassword.ts
//
// A PERSON CHANGES HIS OWN PASSWORD (pure: the database, bcrypt, the lock, the clock and the one-time code are given by the caller, so every rule is tested without any of them).
//   who:        the SIGN-IN's ticket only (the route reads it from the session; nothing the browser says about who it is counts)
//   proof:      the current password, checked with bcrypt; wrong ones are counted and, after 5 in 15 minutes, refused outright (so a borrowed, unlocked screen cannot be used to learn the password)
//   the HOD:    during the DEVELOPMENT phase the password of the HOD of C&IT is known to two people, the HOD and the developer, and is NOT changed here (set with scripts/set-user-password.ts). When the app goes
//               into production (APP_PHASE=production on the host) the HOD changes his own like everybody else, to what he chooses, and nobody else need know it.
//   the new one: at least 8 characters, not the current or any of the last 5, not the ticket number, not the SAIL P.No. (the first password of everybody, which many people know), not one character repeated.
//   the life:   valid 180 days; when it has run out the window comes up by itself after sign-in, with the days in the message (src/lib/security/passwordPolicy.ts).
//   the OTP:    when PASSWORD_OTP is on, a one-time code sent to the person's own mobile (else e-mail) is needed as well (src/lib/security/otp.ts). Built; switched off.
// A session already open stays open until it ends (24 hours at most): the sign-in is a signed token, not a row to delete.

import { DateTime } from "luxon";
import { ageStatus, destinationFor, expiredMessage, maskDestination, PASSWORD_VALID_DAYS, REUSED_MESSAGE, SAME_AS_CURRENT_MESSAGE, validityNote, type Channel, type Destination } from "./passwordPolicy";
import type { VerifyResult } from "./otp";

export const MIN_LENGTH = 8;
export const MAX_LENGTH = 128;

export const HOD_LOCKED_MESSAGE =
  "The password of the HOD of C&IT is kept as it is while the app is in its development phase: the HOD and the developer both need to know it. The HOD will be able to change it here, to a password of his own choice, when the app goes into production.";

/** the host's APP_PHASE: only the exact word "production" (any case) is production; empty or anything else is development */
export const isProductionPhase = (phase: string | undefined | null): boolean => (phase ?? "").trim().toLowerCase() === "production";

/** why a new password is not acceptable, in plain words; null when it is */
export function checkNewPassword(next: string, ctx: { current: string; ticket: string; pno: string | null }): string | null {
  if (next.length < MIN_LENGTH) return `Use at least ${MIN_LENGTH} characters.`;
  if (next.length > MAX_LENGTH) return `Use at most ${MAX_LENGTH} characters.`;
  if (next === ctx.current) return SAME_AS_CURRENT_MESSAGE;
  const lower = next.trim().toLowerCase();
  if (lower === ctx.ticket.trim().toLowerCase()) return "The password cannot be your ticket number.";
  if (ctx.pno && lower === ctx.pno.trim().toLowerCase()) return "The password cannot be your SAIL P.No.: other people know it.";
  if (/^(.)\1+$/.test(next)) return "Use more than one repeated character.";
  return null;
}

export interface Lock { blocked(key: string): { ok: boolean; retryAfterSec: number }; fail(key: string): void; reset(key: string): void }

export interface OtpPolicy {
  on: boolean;
  noChannel: "allow" | "block";
  verify: (ticket: string, code: string) => Promise<VerifyResult>;
}

export interface Person { id: string; hash: string | null; pno: string | null; mobile?: string | null; email?: string | null }

export interface ChangeDeps {
  /** the signed-in ticket from the session, or null */
  ticket: string | null;
  isHod: (ticket: string) => boolean;
  /** true when the app is in its production phase (the HOD may then change his own) */
  hodMayChange: boolean;
  load: (ticket: string) => Promise<Person | null>;
  /** writes the new hash to the person's row and records the change (the day, and the replaced hash into the history) */
  save: (c: { id: string; ticket: string; newHash: string; replacedHash: string }) => Promise<void>;
  compare: (plain: string, hash: string) => Promise<boolean>;
  hash: (plain: string) => Promise<string>;
  lock: Lock;
  /** the hashes of the earlier passwords, newest first ([] when the history is not available) */
  history: (ticket: string) => Promise<string[]>;
  otp: OtpPolicy;
}

export type Code = "login" | "hod_locked" | "bad_input" | "locked" | "wrong_current" | "weak" | "reused" | "no_password" | "otp_needed" | "otp_wrong" | "no_channel";
export type Outcome =
  | { status: 200; body: { ok: true } }
  | { status: 400 | 401 | 403 | 429; body: { ok: false; error: string; code: Code; retryAfterSec?: number } };

const refuse = (status: 400 | 401 | 403 | 429, code: Code, error: string, retryAfterSec?: number): Outcome =>
  ({ status, body: { ok: false, error, code, ...(retryAfterSec ? { retryAfterSec } : {}) } });

/** what the screen asks first: may this person change the password here? */
export function mayChange(d: Pick<ChangeDeps, "ticket" | "isHod" | "hodMayChange">): { canChange: boolean; reason?: string } {
  if (!d.ticket) return { canChange: false, reason: "Please sign in." };
  if (d.isHod(d.ticket) && !d.hodMayChange) return { canChange: false, reason: HOD_LOCKED_MESSAGE };
  return { canChange: true };
}

export async function changePassword(d: ChangeDeps, input: unknown): Promise<Outcome> {
  const ticket = (d.ticket ?? "").trim();
  if (!ticket) return refuse(401, "login", "Please sign in.");
  if (d.isHod(ticket) && !d.hodMayChange) return refuse(403, "hod_locked", HOD_LOCKED_MESSAGE);

  const b = (input && typeof input === "object" ? input : {}) as { current?: unknown; next?: unknown; otp?: unknown };
  if (typeof b.current !== "string" || typeof b.next !== "string" || !b.current || b.current.length > MAX_LENGTH) return refuse(400, "bad_input", "Enter your current password and the new one.");
  const code = typeof b.otp === "string" ? b.otp.trim().slice(0, 12) : "";

  const gate = d.lock.blocked(ticket);
  if (!gate.ok) return refuse(429, "locked", "Too many wrong tries. Please wait a few minutes and try again.", gate.retryAfterSec);

  const me = await d.load(ticket);
  if (!me || !me.hash) return refuse(403, "no_password", "This account has no password of its own to change.");
  if (!(await d.compare(b.current, me.hash))) { d.lock.fail(ticket); return refuse(403, "wrong_current", "The current password is not correct."); }
  d.lock.reset(ticket);

  // the new password itself: the rules, then the last 5
  const why = checkNewPassword(b.next, { current: b.current, ticket, pno: me.pno });
  if (why) return refuse(400, "weak", why);
  for (const old of await d.history(ticket)) {
    if (await d.compare(b.next, old)) return refuse(400, "reused", REUSED_MESSAGE);
  }

  // the one-time code (only when it is switched on), checked last so that a code is not used up by a password that was going to be refused anyway
  if (d.otp.on) {
    const dest = destinationFor(me);
    if (dest) {
      if (!code) return refuse(400, "otp_needed", `Enter the code sent to ${maskDestination(dest)}.`);
      const v = await d.otp.verify(ticket, code);
      if (!v.ok) return refuse(403, "otp_wrong", v.error);
    } else if (d.otp.noChannel === "block") {
      return refuse(403, "no_channel", "No mobile number or e-mail address is recorded for you, so a code cannot be sent. Please ask C&IT to add your mobile number.");
    }
  }

  await d.save({ id: me.id, ticket, newHash: await d.hash(b.next), replacedHash: me.hash });
  return { status: 200, body: { ok: true } };
}

// ---- what the window asks first ----
export interface Status {
  canChange: boolean;
  reason?: string;
  validDays: number;
  /** the window must be filled in now (the password has run out) */
  required: boolean;
  /** the plain sentence for the window when `required` */
  requiredMessage?: string;
  /** the note under the heading: how long the current password lasts, and what a new one is */
  note?: string;
  daysLeft?: number;
  expiresOn?: string;
  otp: { required: boolean; channel?: Channel; maskedTo?: string; blocked?: boolean };
}

export interface StatusDeps {
  ticket: string | null;
  isHod: (ticket: string) => boolean;
  hodMayChange: boolean;
  /** epoch milliseconds */
  now: () => number;
  /** the recorded day of the last change, in epoch milliseconds; null when none is recorded; undefined when the records are not available */
  changedAt: (ticket: string) => Promise<number | null | undefined>;
  startClock: (ticket: string) => Promise<void>;
  otp: { on: boolean; noChannel: "allow" | "block" };
  destination: (ticket: string) => Promise<Destination | null>;
}

const longDay = (ms: number) => DateTime.fromMillis(ms, { zone: "Asia/Kolkata", locale: "en-GB" }).toFormat("d LLLL yyyy");

export async function passwordStatus(d: StatusDeps): Promise<Status> {
  const base = mayChange(d);
  const off: Status = { ...base, validDays: PASSWORD_VALID_DAYS, required: false, otp: { required: false } };
  if (!base.canChange || !d.ticket) return off;
  const ticket = d.ticket.trim();

  const st: Status = { ...off };
  const recorded = await d.changedAt(ticket);
  if (recorded !== undefined) {
    let age = ageStatus(recorded, d.now());
    if (age.state === "unrecorded") { await d.startClock(ticket); age = ageStatus(d.now(), d.now()); } // his 180 days begin at this sign-in
    if (age.state === "expired") {
      st.required = true;
      st.requiredMessage = expiredMessage();
      st.note = `Your password expired on ${longDay(age.expiresAt)}. ${validityNote()}`;
    } else if (age.state === "valid") {
      st.daysLeft = age.daysLeft;
      st.expiresOn = DateTime.fromMillis(age.expiresAt).toUTC().toISO() ?? undefined;
      st.note = `Your current password is valid for ${age.daysLeft} more ${age.daysLeft === 1 ? "day" : "days"} (until ${longDay(age.expiresAt)}). ${validityNote()}`;
    }
  }
  if (d.otp.on) {
    const dest = await d.destination(ticket);
    if (dest) st.otp = { required: true, channel: dest.channel, maskedTo: maskDestination(dest) };
    else if (d.otp.noChannel === "block") st.otp = { required: false, blocked: true };
  }
  return st;
}

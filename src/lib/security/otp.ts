// src/lib/security/otp.ts
//
// THE ONE-TIME CODE for a password change (pure: the clock, the random digits, the store, the sender and the limit are given by the caller, so every rule is tested without a phone).
//   a code is 6 digits, valid 5 minutes, kept only as a keyed hash (HMAC with the server secret and the ticket), tried at most 5 times, used once, one live code per person;
//   a new code cannot be asked for within 60 seconds of the last, and at most 3 an hour;
//   the code goes only to the destination of the SIGNED-IN person's own record (src/lib/security/passwordPolicy.ts destinationFor): the screen can never name where it goes.
// WHAT IS NOT HERE: the gateway that really sends an SMS or an e-mail. `OtpSender` is the plug (src/lib/security/otpSender.ts); until a gateway is set up the sender says so, and the whole feature stays off.

import type { Destination } from "./passwordPolicy";
import { maskDestination } from "./passwordPolicy";

export const OTP_TTL_SEC = 300;
export const OTP_MAX_TRIES = 5;
export const OTP_RESEND_SEC = 60;
export const OTP_MAX_PER_HOUR = 3;

export interface OtpRow { codeHash: string; expiresAt: number; tries: number; sentAt: number }
export interface OtpStore {
  get(ticket: string): Promise<OtpRow | null>;
  put(ticket: string, row: OtpRow & { channel: string; sentTo: string }): Promise<void>;
  setTries(ticket: string, tries: number): Promise<void>;
  clear(ticket: string): Promise<void>;
  /** how many codes were sent to this ticket in the last hour */
  sentInLastHour(ticket: string, now: number): Promise<number>;
}
export interface OtpSender { send(d: Destination, message: string): Promise<void> }
export interface OtpDeps {
  now: () => number;
  /** six decimal digits, from a cryptographic source */
  digits: () => string;
  /** a keyed hash of (ticket, code) */
  hash: (ticket: string, code: string) => string;
  store: OtpStore;
  sender: OtpSender;
}

export type SendResult =
  | { ok: true; maskedTo: string; expiresInSec: number; resendInSec: number }
  | { ok: false; code: "too_soon" | "too_many" | "not_sent"; error: string; retryAfterSec?: number };

export const otpMessage = (code: string): string => `${code} is your DSP Intranet code to change your password. It is valid for ${OTP_TTL_SEC / 60} minutes. Do not tell it to anybody.`;

export async function sendOtp(d: OtpDeps, ticket: string, dest: Destination): Promise<SendResult> {
  const now = d.now();
  const last = await d.store.get(ticket);
  if (last && now - last.sentAt < OTP_RESEND_SEC * 1000) {
    const wait = Math.ceil((OTP_RESEND_SEC * 1000 - (now - last.sentAt)) / 1000);
    return { ok: false, code: "too_soon", error: `A code was sent a moment ago. You can ask for another in ${wait} seconds.`, retryAfterSec: wait };
  }
  if ((await d.store.sentInLastHour(ticket, now)) >= OTP_MAX_PER_HOUR) return { ok: false, code: "too_many", error: "Too many codes were asked for in the last hour. Please try again later.", retryAfterSec: 600 };
  const code = d.digits();
  // stored BEFORE it is sent, and removed again if the sending fails (no live code the person never received)
  await d.store.put(ticket, { codeHash: d.hash(ticket, code), expiresAt: now + OTP_TTL_SEC * 1000, tries: 0, sentAt: now, channel: dest.channel, sentTo: maskDestination(dest) });
  try {
    await d.sender.send(dest, otpMessage(code));
  } catch {
    await d.store.clear(ticket);
    return { ok: false, code: "not_sent", error: "The code could not be sent just now. Please try again later." };
  }
  return { ok: true, maskedTo: maskDestination(dest), expiresInSec: OTP_TTL_SEC, resendInSec: OTP_RESEND_SEC };
}

export type VerifyResult = { ok: true } | { ok: false; error: string; gone?: boolean };

export async function verifyOtp(d: OtpDeps, ticket: string, code: string): Promise<VerifyResult> {
  const row = await d.store.get(ticket);
  if (!row) return { ok: false, error: "Ask for a code first: none is waiting for you.", gone: true };
  if (d.now() > row.expiresAt) { await d.store.clear(ticket); return { ok: false, error: "The code has expired. Please ask for a new one.", gone: true }; }
  if (row.tries >= OTP_MAX_TRIES) { await d.store.clear(ticket); return { ok: false, error: "Too many wrong codes. Please ask for a new one.", gone: true }; }
  const typed = d.hash(ticket, String(code).trim());
  if (typed.length !== row.codeHash.length || !sameText(typed, row.codeHash)) {
    const tries = row.tries + 1;
    if (tries >= OTP_MAX_TRIES) { await d.store.clear(ticket); return { ok: false, error: "Too many wrong codes. Please ask for a new one.", gone: true }; }
    await d.store.setTries(ticket, tries);
    return { ok: false, error: `The code is not correct. ${OTP_MAX_TRIES - tries} ${OTP_MAX_TRIES - tries === 1 ? "try" : "tries"} left.` };
  }
  await d.store.clear(ticket); // used once
  return { ok: true };
}

/** equal-length text compared without stopping at the first difference */
function sameText(a: string, b: string): boolean {
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

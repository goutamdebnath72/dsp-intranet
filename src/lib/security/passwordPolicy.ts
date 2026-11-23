// src/lib/security/passwordPolicy.ts
//
// The rules of a password's life (pure, no database, no clock of its own: every function is given the time it needs):
//   - a new password is valid for 180 DAYS; after that the person is taken to the change window as soon as he has signed in, with the number of days said in the message;
//   - the last 5 passwords cannot be used again;
//   - a person with no recorded change (every account before this rule, still on its first password) is not shut out on the day the rule starts: his 180 days begin at his first sign-in after it, and are then recorded;
//   - the OTP (a one-time code to the person's own phone or e-mail before a password is changed) is built but SWITCHED OFF until PASSWORD_OTP=on on the host.
// I keep the messages here, once, so the window and the server say the same words.

export const PASSWORD_VALID_DAYS = 180;
/** Sets how many earlier passwords cannot be used again */
export const HISTORY_KEEP = 5;

export const REUSED_MESSAGE = `You cannot use any of your last ${HISTORY_KEEP} passwords again. Please choose one you have not used recently.`;
export const SAME_AS_CURRENT_MESSAGE = "The new password cannot be the same as your current (last) password.";
export const expiredMessage = (days: number = PASSWORD_VALID_DAYS): string => `Your password has expired. A password is valid for ${days} days. Please set a new one now: it will be valid for the next ${days} days, and cannot be any of your last ${HISTORY_KEEP} passwords.`;
export const validityNote = (days: number = PASSWORD_VALID_DAYS): string => `A new password is valid for ${days} days. It cannot be any of your last ${HISTORY_KEEP} passwords.`;

/** All times here are epoch milliseconds. I keep dates in Luxon in this program: src/lib/dates.selftest.ts forbids the built-in Date. */
export type Age =
  | { state: "unrecorded" }
  | { state: "valid"; daysLeft: number; expiresAt: number }
  | { state: "expired"; daysOver: number; expiresAt: number };

const DAY = 86_400_000;

/** Says where a password stands: never recorded, still valid (with the days left, counted up: the last day is 1), or expired */
export function ageStatus(changedAt: number | null | undefined, now: number, validDays: number = PASSWORD_VALID_DAYS): Age {
  if (changedAt === null || changedAt === undefined || !Number.isFinite(changedAt)) return { state: "unrecorded" };
  const expiresAt = changedAt + validDays * DAY;
  const left = expiresAt - now;
  if (left > 0) return { state: "valid", daysLeft: Math.ceil(left / DAY), expiresAt };
  return { state: "expired", daysOver: Math.floor(-left / DAY), expiresAt };
}

// ---- the one-time code (OTP): switched off until the host says on ----
export interface OtpConfig {
  /** The master switch: PASSWORD_OTP=on (also 1, true, yes). I treat anything else as off. */
  on: boolean;
  /** What to do with a person who has no mobile number and no e-mail on record: I let him change with the current password alone (allow, the default: otherwise the 180-day rule would shut him out) or refuse (block) */
  noChannel: "allow" | "block";
}
export function otpConfig(env: { PASSWORD_OTP?: string; PASSWORD_OTP_NO_CHANNEL?: string }): OtpConfig {
  const on = /^(on|1|true|yes)$/i.test((env.PASSWORD_OTP ?? "").trim());
  const noChannel = (env.PASSWORD_OTP_NO_CHANNEL ?? "").trim().toLowerCase() === "block" ? "block" : "allow";
  return { on, noChannel };
}

export type Channel = "sms" | "email";
export interface Destination { channel: Channel; to: string }

/** Says where this person's code would go: his mobile number (ten digits or more), else his e-mail, else nowhere */
export function destinationFor(p: { mobile?: string | null; email?: string | null }): Destination | null {
  const digits = String(p.mobile ?? "").replace(/\D/g, "");
  if (digits.length >= 10) return { channel: "sms", to: digits.slice(-10) };
  const email = String(p.email ?? "").trim();
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { channel: "email", to: email };
  return null;
}

/** I let the screen say only this about the destination: "XXXXXX1234", "a•••@sail.in" */
export function maskDestination(d: Destination): string {
  if (d.channel === "sms") return `XXXXXX${d.to.slice(-4)}`;
  const at = d.to.indexOf("@");
  return `${d.to[0]}•••${d.to.slice(at)}`;
}

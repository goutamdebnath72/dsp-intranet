// src/lib/security/passwordRuntime.ts
//
// THE SERVER'S OWN WIRING of the password rules to the real database, the real random digits and the real secret (the rules themselves are in changePassword.ts, otp.ts and passwordPolicy.ts and are tested
// without any of this). Used by the two routes under src/app/api/account/password. Server only.

import { createHmac, randomInt } from "node:crypto";
import { getDb } from "@/lib/db";
import { otpConfig, destinationFor, type Destination } from "./passwordPolicy";
import { ensureTables, otpStoreOver, type Query } from "./passwordStore";
import { senderFromEnv } from "./otpSender";
import type { OtpDeps } from "./otp";

export const config = () => otpConfig({ PASSWORD_OTP: process.env.PASSWORD_OTP, PASSWORD_OTP_NO_CHANNEL: process.env.PASSWORD_OTP_NO_CHANNEL });

export async function query(): Promise<Query> {
  const ds = await getDb();
  return (sql, params) => ds.query(sql, (params ?? []) as never[]) as Promise<Array<Record<string, unknown>>>;
}

/** are the password tables there (made now if need be)? false when they cannot be made: then the 180-day rule and the history are not applied */
export async function tablesReady(): Promise<boolean> {
  return ensureTables(await query());
}

/** the person's own destination for a code: his mobile (else his e-mail) from his own record */
export async function destinationOf(ticket: string): Promise<Destination | null> {
  const q = await query();
  const r = await q(`SELECT "contactNo" AS mobile, email FROM public."user" WHERE "ticketNo" = $1 LIMIT 2`, [ticket]);
  return r.length === 1 ? destinationFor({ mobile: r[0].mobile as string | null, email: r[0].email as string | null }) : null;
}

/** the code machinery over the real store; null when there is no secret to key the hash with */
export async function otpDeps(): Promise<OtpDeps | null> {
  const secret = (process.env.NEXTAUTH_SECRET ?? "").trim();
  if (!secret) return null;
  return {
    now: () => Date.now(),
    digits: () => String(randomInt(0, 1_000_000)).padStart(6, "0"),
    hash: (ticket, code) => createHmac("sha256", secret).update(`${ticket}:${code}`).digest("hex"),
    store: otpStoreOver(await query()),
    sender: senderFromEnv({ PASSWORD_OTP_DEV_ECHO: process.env.PASSWORD_OTP_DEV_ECHO, NODE_ENV: process.env.NODE_ENV }),
  };
}

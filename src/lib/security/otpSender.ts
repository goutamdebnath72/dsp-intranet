// src/lib/security/otpSender.ts
//
// The plug for sending a one-time code. No SMS or e-mail gateway is set up for this app, so there is nothing real to send with: I say so plainly here instead of pretending, and the feature stays off (PASSWORD_OTP).
// To switch it on later: write the `send` of a gateway here (the plant's SMS service, or SMTP for e-mail), keep the credentials in the host's environment (never in a file), then set PASSWORD_OTP=on.
// For a developer's own machine only: PASSWORD_OTP_DEV_ECHO=true prints the code in the server's console (refused when NODE_ENV is production).

import type { Destination } from "./passwordPolicy";
import type { OtpSender } from "./otp";

export class OtpNotConfigured extends Error {
  constructor() { super("No gateway is set up to send one-time codes."); this.name = "OtpNotConfigured"; }
}

export const notConfiguredSender: OtpSender = { async send() { throw new OtpNotConfigured(); } };

export const consoleSender: OtpSender = { async send(d: Destination, message: string) { console.info(`[otp:dev] to ${d.channel}:${d.to} -> ${message}`); } };

export function senderFromEnv(env: { PASSWORD_OTP_DEV_ECHO?: string; NODE_ENV?: string }): OtpSender {
  const dev = /^(true|1|yes|on)$/i.test((env.PASSWORD_OTP_DEV_ECHO ?? "").trim()) && env.NODE_ENV !== "production";
  return dev ? consoleSender : notConfiguredSender;
}

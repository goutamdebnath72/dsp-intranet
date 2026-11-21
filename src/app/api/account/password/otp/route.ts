// src/app/api/account/password/otp/route.ts
//
// POST /api/account/password/otp   sends the signed-in person a one-time code for a password change, to HIS OWN mobile number (else e-mail) on record: the request names no destination, so it cannot be pointed
// at anybody else. Built but SWITCHED OFF: answers 404 until PASSWORD_OTP=on on the host, and says plainly that no gateway is set up until one is (src/lib/security/otpSender.ts).
// The rules (6 digits, 5 minutes, 5 tries, 60 seconds between codes, 3 an hour) are in src/lib/security/otp.ts.

import { NextResponse } from "next/server";
import { getSessionTicket } from "@/lib/apiAuth";
import { isSuperAdmin } from "@/lib/superAdmin";
import { createLimiter, retryHeaders } from "@/lib/security/rateLimit";
import { sameOrigin } from "@/lib/security/sameOrigin";
import { HOD_LOCKED_MESSAGE, isProductionPhase } from "@/lib/security/changePassword";
import { config, destinationOf, otpDeps, tablesReady } from "@/lib/security/passwordRuntime";
import { sendOtp } from "@/lib/security/otp";
import { PASSWORD_MODULE_ENABLED } from "@/lib/security/passwordModule";
import { OtpNotConfigured } from "@/lib/security/otpSender";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const pace = createLimiter({ max: 6, windowMs: 60_000 });
const NO_STORE = { "Cache-Control": "no-store" };
const fail = (status: number, error: string, code: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = NO_STORE) => NextResponse.json({ ok: false, error, code, ...extra }, { status, headers });

export async function POST(request: Request) {
  if (!PASSWORD_MODULE_ENABLED || !config().on) return fail(404, "Not found.", "off");
  if (!sameOrigin(request.headers.get("origin"), request.headers.get("host"))) return fail(403, "Not allowed.", "origin");
  const ticket = await getSessionTicket();
  if (!ticket) return fail(401, "Please sign in.", "login");
  if (isSuperAdmin(ticket) && !isProductionPhase(process.env.APP_PHASE)) return fail(403, HOD_LOCKED_MESSAGE, "hod_locked");
  const turn = pace.take(ticket);
  if (!turn.ok) return fail(429, "Too many requests. Please wait a moment.", "locked", {}, retryHeaders(turn));
  try {
    const dest = await destinationOf(ticket);
    if (!dest) return fail(400, "No mobile number or e-mail address is recorded for you, so a code cannot be sent.", "no_channel");
    const od = (await tablesReady()) ? await otpDeps() : null;
    if (!od) return fail(503, "The code service is not available just now. Please try again later.", "unavailable");
    const r = await sendOtp(od, ticket, dest);
    if (r.ok) return NextResponse.json({ ok: true, maskedTo: r.maskedTo, expiresInSec: r.expiresInSec, resendInSec: r.resendInSec }, { headers: NO_STORE });
    return fail(r.code === "not_sent" ? 502 : 429, r.error, r.code, {}, r.retryAfterSec ? { ...NO_STORE, "Retry-After": String(r.retryAfterSec) } : NO_STORE);
  } catch (e) {
    if (e instanceof OtpNotConfigured) return fail(503, "Sending one-time codes is not set up yet.", "not_configured");
    console.error("otp send failed:", e instanceof Error ? e.message : e);
    return fail(500, "The code could not be sent just now. Please try again later.", "error");
  }
}

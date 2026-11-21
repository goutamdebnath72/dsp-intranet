// src/app/api/account/password/route.ts
//
// GET  /api/account/password   what the "Change password" window asks first: may this person change it here, has it run out (180 days: the window then comes up by itself), how long the current one lasts, and
//                              whether a one-time code is needed (switched off for now)
// POST /api/account/password   { current, next, otp? }  the signed-in person changes his own password. The rules are in src/lib/security/changePassword.ts.
// Who is asking is the sign-in's ticket only; the route changes nobody else's password.

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getDb } from "@/lib/db";
import { getSessionTicket } from "@/lib/apiAuth";
import { isSuperAdmin } from "@/lib/superAdmin";
import { createFailureLock, createLimiter, retryHeaders } from "@/lib/security/rateLimit";
import { sameOrigin } from "@/lib/security/sameOrigin";
import { changePassword, isProductionPhase, passwordStatus, type ChangeDeps } from "@/lib/security/changePassword";
import { readMeta, recordChange, startClock } from "@/lib/security/passwordStore";
import { config, destinationOf, otpDeps, query, tablesReady } from "@/lib/security/passwordRuntime";
import { verifyOtp } from "@/lib/security/otp";
import { PASSWORD_MODULE_ENABLED } from "@/lib/security/passwordModule";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// five wrong current passwords in 15 minutes lock this ticket's changes for a while; at most 10 requests a minute per ticket (see src/lib/security/rateLimit.ts for what a limit in one server copy can do)
const lock = createFailureLock({ max: 5, windowMs: 15 * 60_000 });
const pace = createLimiter({ max: 10, windowMs: 60_000 });
const NO_STORE = { "Cache-Control": "no-store" };

/** the module is switched off (src/lib/security/passwordModule.ts): the route does not exist as far as any caller can tell */
const off = () => NextResponse.json({ error: "Not found." }, { status: 404, headers: NO_STORE });

const phase = () => isProductionPhase(process.env.APP_PHASE);

export async function GET() {
  if (!PASSWORD_MODULE_ENABLED) return off();
  const ticket = await getSessionTicket();
  try {
    const s = await passwordStatus({
      ticket,
      isHod: isSuperAdmin,
      hodMayChange: phase(),
      now: () => Date.now(),
      // the records may be missing (the tables cannot be made): then the 180-day rule is not applied, and a password change still works
      changedAt: async (t) => ((await tablesReady()) ? (await readMeta(await query(), t))?.changedAt ?? null : undefined),
      startClock: async (t) => { await startClock(await query(), t).catch((e) => console.error("password clock not started:", e instanceof Error ? e.message : e)); },
      otp: config(),
      destination: destinationOf,
    });
    return NextResponse.json(s, { status: ticket ? 200 : 401, headers: NO_STORE });
  } catch (e) {
    console.error("password status failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "The password window could not be prepared just now." }, { status: 500, headers: NO_STORE });
  }
}

export async function POST(request: Request) {
  if (!PASSWORD_MODULE_ENABLED) return off();
  if (!sameOrigin(request.headers.get("origin"), request.headers.get("host"))) return NextResponse.json({ ok: false, error: "Not allowed." }, { status: 403, headers: NO_STORE });
  const ticket = await getSessionTicket();
  if (ticket) {
    const turn = pace.take(ticket);
    if (!turn.ok) return NextResponse.json({ ok: false, error: "Too many requests. Please wait a moment.", code: "locked" }, { status: 429, headers: retryHeaders(turn) });
  }
  let body: unknown = null;
  try { body = await request.json(); } catch { /* an empty or broken body is refused as bad input */ }
  try {
    const cfg = config();
    const ready = await tablesReady();
    const deps: ChangeDeps = {
      ticket,
      isHod: isSuperAdmin,
      hodMayChange: phase(),
      load: async (t) => {
        const ds = await getDb();
        const rows = (await ds.query(`SELECT id, password, "sailPNo" AS pno, "contactNo" AS mobile, email FROM public."user" WHERE "ticketNo" = $1 LIMIT 2`, [t])) as Array<{ id: string; password: string | null; pno: string | null; mobile: string | null; email: string | null }>;
        return rows.length === 1 ? { id: rows[0].id, hash: rows[0].password, pno: rows[0].pno, mobile: rows[0].mobile, email: rows[0].email } : null; // two accounts with one ticket would be a data fault: nothing is changed
      },
      save: async ({ id, ticket: t, newHash, replacedHash }) => {
        const ds = await getDb();
        // the new hash and the record of the change are one step: both or neither
        await ds.transaction(async (em) => {
          await em.query(`UPDATE public."user" SET password = $1 WHERE id = $2`, [newHash, id]);
          if (ready) await recordChange((sql, params) => em.query(sql, (params ?? []) as never[]) as Promise<Array<Record<string, unknown>>>, t, replacedHash);
        });
      },
      compare: (plain, hash) => bcrypt.compare(plain, hash),
      hash: (plain) => bcrypt.hash(plain, 10),
      lock,
      history: async (t) => (ready ? (await readMeta(await query(), t))?.history ?? [] : []),
      otp: {
        ...cfg,
        // the one thing that never fails open: with the code switched on, a code that cannot be checked is a refusal
        verify: async (t, code) => {
          const od = ready ? await otpDeps() : null;
          return od ? verifyOtp(od, t, code) : { ok: false, error: "The code service is not available just now. Please try again later." };
        },
      },
    };
    const out = await changePassword(deps, body);
    if (out.status === 200 && ticket) console.info(`[password] changed for ticket ${ticket}`);
    const headers = out.status === 429 && "retryAfterSec" in out.body && out.body.retryAfterSec ? { ...NO_STORE, "Retry-After": String(out.body.retryAfterSec) } : NO_STORE;
    return NextResponse.json(out.body, { status: out.status, headers });
  } catch (e) {
    console.error("password change failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "The password could not be changed just now. Please try again." }, { status: 500, headers: NO_STORE });
  }
}

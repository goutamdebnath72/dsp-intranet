// src/app/api/client-errors/route.ts
//
// POST /api/client-errors   { message, stack, page }   the browser's uncaught errors, PRODUCTION ONLY (src/lib/errorLog/clientReport.ts; in development it answers 204 and keeps nothing).
// I left it open to a person who has not signed in (an error on the sign-in page matters too), so I guard it like a public form: same origin only, 8 KB at most, 10 reports a minute per address and 120 a minute in all
// from this server copy, every text masked before it is stored (scrub.ts), and always the same empty answer, so nothing can be learned from it. Rows are grouped by fingerprint and capped per source (store.ts):
// a flood of invented errors makes at most 1,000 browser rows and cannot push a server error out.

import { NextResponse } from "next/server";
import { clientIp, createLimiter } from "@/lib/security/rateLimit";
import { errorLogEnabled, keepAlive, productionDeps } from "@/lib/errorLog/serverHook";
import { reportError } from "@/lib/errorLog/report";

export const dynamic = "force-dynamic";

const byAddress = createLimiter({ max: 10, windowMs: 60_000 });
const inAll = createLimiter({ max: 120, windowMs: 60_000 });
const MAX_BODY = 8000;

const sameOrigin = (origin: string | null, host: string | null): boolean => {
  if (!origin) return true;
  try { return !!host && new URL(origin).host === host; } catch { return false; }
};
const done = () => new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  if (!errorLogEnabled()) return done();
  if (!sameOrigin(request.headers.get("origin"), request.headers.get("host"))) return done();
  if (!byAddress.take(clientIp(request.headers)).ok || !inAll.take("all").ok) return done();
  try {
    const text = await request.text();
    if (text.length > MAX_BODY) return done();
    const b = JSON.parse(text) as { message?: unknown; stack?: unknown; page?: unknown };
    if (typeof b?.message !== "string" || !b.message.trim()) return done();
    const work = (async () => reportError({ source: "browser", message: b.message, stack: typeof b.stack === "string" ? b.stack : "", page: b.page, agent: request.headers.get("user-agent") }, await productionDeps()))();
    keepAlive(work);
    await work;
  } catch {
    /* I drop a bad body without a word. */
  }
  return done();
}

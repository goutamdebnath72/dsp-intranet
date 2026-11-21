// src/app/api/cron/error-digest/route.ts
//
// GET /api/cron/error-digest   run once a day by Vercel's scheduler (vercel.json "crons"): cleans the error log and sends the developer ONE notice of what is new (src/lib/errorLog/digest.ts).
// Vercel sends "Authorization: Bearer <CRON_SECRET>" when the project has an environment variable CRON_SECRET; anything else is refused. WITHOUT that variable the route does nothing at all (it fails closed).

import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runDigest } from "@/lib/errorLog/digest";
import { sendAlert } from "@/lib/errorLog/alert";
import { productionDeps, errorLogEnabled } from "@/lib/errorLog/serverHook";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const same = (a: string, b: string): boolean => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET || "";
  if (!secret) return new NextResponse(null, { status: 404 });
  if (!same(request.headers.get("authorization") || "", `Bearer ${secret}`)) return new NextResponse(null, { status: 401 });
  if (!errorLogEnabled()) return NextResponse.json({ ran: false, reason: "the error log is off" });
  try {
    const deps = await productionDeps();
    const r = await runDigest(deps.query, sendAlert);
    return NextResponse.json({ ran: r.ran, sent: r.sent, dropped: r.dropped });
  } catch (e) {
    console.warn("error digest failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ran: false }, { status: 500 });
  }
}

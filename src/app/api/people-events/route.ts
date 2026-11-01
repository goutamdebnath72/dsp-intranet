// src/app/api/people-events/route.ts
//
// GET /api/people-events -> { today, monthLabel, monthEnd, birthdays[], retirements[], jubilee[], sample }
// The three lists of the home page's "People & Events" widget (step 65a). The day is the day in India. Never cached: the lists change at midnight.

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { rowsOf } from "@/lib/pax/admin/rows";
import { handlePeopleEvents } from "@/lib/peopleEvents/api";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET() {
  const ds = await getDb().catch(() => null);
  if (!ds) return NextResponse.json({ error: "The list could not be loaded just now." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  const out = await handlePeopleEvents(async (sql, params) => rowsOf(await ds.query(sql, params as never[])));
  if (out.status !== 200) console.error("people-events:", out.body);
  return NextResponse.json(out.body, { status: out.status, headers: { "Cache-Control": "no-store" } });
}

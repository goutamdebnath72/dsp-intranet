// src/app/api/holidays/admin/route.ts
//
// POST /api/holidays/admin
// The Holiday Manager facility endpoint (Modular Facility Kit).
// Protected by same-origin, session verification, and granular authority.

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { errorReply, handleHolidayAdmin, isSameOrigin } from "@/lib/holidays/admin/api";
import { sessionActor, typeormHolidayDb } from "@/lib/holidays/admin/access";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function POST(request: Request) {
  if (!isSameOrigin(request.headers.get("origin"), request.headers.get("host"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    const raw = await request.text();
    // Allow up to 1 MB for full-year enriched JSON payloads
    if (raw.length > 1_000_000) {
      return NextResponse.json({ error: "Payload too large." }, { status: 413 });
    }
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Bad request: invalid JSON body." }, { status: 400 });
  }

  try {
    const ds = await getDb();
    const { searchEmployeesById, searchEmployeesByName } = await import("@/lib/search/employeeSearch");

    const out = await handleHolidayAdmin(body, {
      actor: await sessionActor(ds),
      db: typeormHolidayDb(ds),
      findByName: (name) => searchEmployeesByName(ds, name),
      findByTicket: (ticket) => searchEmployeesById(ds, { kind: "ticket", value: ticket }),
    });

    return NextResponse.json(out.body, {
      status: out.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    console.error("[holidays/admin] route error:", e);
    const out = errorReply(e);
    return NextResponse.json(out.body, { status: out.status });
  }
}

// src/app/api/access-log/admin/route.ts
//
// POST /api/access-log/admin
// The Contact Access Log facility endpoint (Modular Facility Kit).
// Protected by same-origin, session verification, and granular authority.

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { errorReply, handleAccessLogAdmin, isSameOrigin } from "@/lib/accessLog/admin/api";
import { sessionActor, typeormAccessLogDb } from "@/lib/accessLog/admin/access";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function POST(request: Request) {
  if (!isSameOrigin(request.headers.get("origin"), request.headers.get("host"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    const raw = await request.text();
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Bad request: invalid JSON body." }, { status: 400 });
  }

  try {
    const ds = await getDb();
    const { searchEmployeesById, searchEmployeesByName } = await import("@/lib/search/employeeSearch");

    const out = await handleAccessLogAdmin(body, {
      actor: await sessionActor(ds),
      db: typeormAccessLogDb(ds),
      ds,
      findByName: (name) => searchEmployeesByName(ds, name),
      findByTicket: (ticket) => searchEmployeesById(ds, { kind: "ticket", value: ticket }),
    });

    return NextResponse.json(out.body, {
      status: out.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    console.error("[access-log/admin] route error:", e);
    const out = errorReply(e);
    return NextResponse.json(out.body, { status: out.status });
  }
}

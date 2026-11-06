// src/app/api/circulars/admin/route.ts
//
// POST /api/circulars/admin
// The Circular Manager facility endpoint (Modular Facility Kit).
// Protected by same-origin, session verification, and granular authority.

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { errorReply, handleCircularAdmin, isSameOrigin } from "@/lib/circulars/admin/api";
import { sessionActor, typeormCircularDb } from "@/lib/circulars/admin/access";

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

    const out = await handleCircularAdmin(body, {
      actor: await sessionActor(ds),
      db: typeormCircularDb(ds),
      findByName: (name) => searchEmployeesByName(ds, name),
      findByTicket: (ticket) => searchEmployeesById(ds, { kind: "ticket", value: ticket }),
    });

    return NextResponse.json(out.body, {
      status: out.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    console.error("[circulars/admin] route error:", e);
    const out = errorReply(e);
    return NextResponse.json(out.body, { status: out.status });
  }
}

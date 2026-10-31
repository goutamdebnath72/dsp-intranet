// src/app/api/pax/admin/route.ts
//
// POST /api/pax/admin  { op: "me" | "list" | "add" | "modify" | "delete" | "delegates" | "find-executive" | "grant" | "revoke" | "audit", ... }
// The PAX directory's admin requests (step 64a). The person is the LOGIN SESSION's; the rules are in src/lib/pax/admin/api.ts.

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { handlePaxAdmin, isSameOrigin } from "@/lib/pax/admin/api";
import { sessionActor, typeormPaxDb } from "@/lib/pax/admin/access";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function POST(request: Request) {
  if (!isSameOrigin(request.headers.get("origin"), request.headers.get("host"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 10_000) return NextResponse.json({ error: "Too large." }, { status: 413 });
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  try {
    const ds = await getDb();
    const { searchEmployeesById, searchEmployeesByName } = await import("@/lib/search/employeeSearch");
    const out = await handlePaxAdmin(body, {
      actor: await sessionActor(ds),
      db: typeormPaxDb(ds),
      findByName: (name) => searchEmployeesByName(ds, name),
      findByTicket: (ticket) => searchEmployeesById(ds, { kind: "ticket", value: ticket }),
    });
    return NextResponse.json(out.body, { status: out.status, headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("pax admin:", e);
    return NextResponse.json({ error: "The PAX directory could not be changed just now. Please try again; if it keeps happening, tell the Telecom team (the admin tables of sql/13 may not be created yet)." }, { status: 500 });
  }
}

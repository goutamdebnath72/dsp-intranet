// src/app/api/employees/admin/route.ts
//
// POST /api/employees/admin  { op: "me" | "lookups" | "search" | "get" | "add" | "modify" | "delete" | "delegates" | "find-executive" | "grant" | "revoke" | "audit", ... }
// The employee manager's requests (step 66a). The person is the LOGIN SESSION's; the rules are in src/lib/employees/admin/api.ts.

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { errorReply, handleEmployeeAdmin, isSameOrigin } from "@/lib/employees/admin/api";
import { sessionActor, typeormEmpDb } from "@/lib/employees/admin/access";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function POST(request: Request) {
  if (!isSameOrigin(request.headers.get("origin"), request.headers.get("host"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 20_000) return NextResponse.json({ error: "Too large." }, { status: 413 });
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  try {
    const ds = await getDb();
    const { searchEmployeesById, searchEmployeesByName } = await import("@/lib/search/employeeSearch");
    const out = await handleEmployeeAdmin(body, {
      actor: await sessionActor(ds),
      db: typeormEmpDb(ds),
      findByName: (name) => searchEmployeesByName(ds, name),
      findByTicket: (ticket) => searchEmployeesById(ds, { kind: "ticket", value: ticket }),
    });
    return NextResponse.json(out.body, { status: out.status, headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("employee admin:", e);
    const out = errorReply(e);
    return NextResponse.json(out.body, { status: out.status });
  }
}

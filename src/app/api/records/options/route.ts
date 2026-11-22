// src/app/api/records/options/route.ts
//
// THE TWO PICK-LISTS of the People finder ("Department & designation"): every department and every designation of the directory, as { id, name }. Names of offices and grades only: no person, no number.
// Kept in the server's memory for 10 minutes (the lists change rarely) and sent with a 5 minute browser cache.

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { formatDepartmentDisplay } from "@/lib/employees/sailDepartments";

export const dynamic = "force-dynamic";

interface Options { departments: { id: number; name: string }[]; designations: { id: number; name: string }[] }
let cache: { at: number; value: Options } | null = null;

export async function GET() {
  try {
    if (!cache || Date.now() - cache.at > 10 * 60_000) {
      const ds = await getDb();
      const d: Array<{ id: number; name: string }> = await ds.query(`SELECT id, name FROM public.sail_department ORDER BY name`);
      const g: Array<{ id: number; title: string }> = await ds.query(`SELECT id, title FROM public.designation_grade ORDER BY rank_order, title`);
      cache = {
        at: Date.now(),
        value: {
          departments: d.map((r) => ({ id: Number(r.id), name: formatDepartmentDisplay(String(r.name)) ?? String(r.name) })),
          designations: g.map((r) => ({ id: Number(r.id), name: String(r.title) })),
        },
      };
    }
    return NextResponse.json(cache.value, { headers: { "Cache-Control": "public, max-age=300" } });
  } catch {
    return NextResponse.json({ departments: [], designations: [], error: "The lists could not be loaded just now." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

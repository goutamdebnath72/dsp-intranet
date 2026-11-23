// src/app/api/records/options/route.ts
//
// The two pick-lists of the People finder ("Department & designation"): every department and every designation of the directory, as { id, name }. Names of offices and grades only: no person, no number.
// I keep them in the server's memory for 10 minutes (the lists change rarely) and send them with a 5 minute browser cache.

import { PERF } from "@/lib/perf/switches";
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
      const askDepartments = (): Promise<Array<{ id: number; name: string }>> => ds.query(`SELECT id, name FROM public.sail_department ORDER BY name`);
      const askDesignations = (): Promise<Array<{ id: number; title: string }>> => ds.query(`SELECT id, title FROM public.designation_grade ORDER BY rank_order, title`);
      // The two lists are independent, so I ask for them together (src/lib/perf/switches.js: parallelReads)
      const [d, g] = PERF.parallelReads ? await Promise.all([askDepartments(), askDesignations()]) : [await askDepartments(), await askDesignations()];
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

// src/app/api/employees/search/route.ts
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  detectShape,
  searchEmployeesById,
  searchEmployeesByName,
  searchEmployeesByNameInDept,
} from "@/lib/search/employeeSearch";
import { findDepartmentInText } from "@/lib/employees/departments";
import { normTerm } from "@/lib/employees/designations";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * GET /api/employees/search?q=...&mode=id|name
 *
 * mode=id   -> live, exact lookups (ticket / mobile / SAIL PNO) as the user types.
 * mode=name -> on Enter:
 *              - "<name fragment> <department>" in ANY order (e.g. "soumit c&it",
 *                "c&it roy") -> people in that department matching the fragment;
 *              - otherwise -> normal fuzzy + phonetic name search.
 *
 * Contact fields come back MASKED; /reveal returns full values and logs access.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();
  const mode = searchParams.get("mode") === "name" ? "name" : "id";

  if (q.length < 2) return NextResponse.json({ results: [] });

  try {
    const ds = await getDb();

    if (mode === "name") {
      // Name fragment + department (order-independent). If the query names a
      // department, treat the rest as the name fragment.
      const dept = findDepartmentInText(q);
      if (dept) {
        const fragment = normTerm(q)
          .split(dept.phrase)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
        if (fragment.length >= 2) {
          const results = await searchEmployeesByNameInDept(
            ds,
            fragment,
            dept.group.codes,
          );
          return NextResponse.json({ results });
        }
        // Department only, no name fragment -> the site-link channel handles it;
        // don't dump the whole department here.
        return NextResponse.json({ results: [] });
      }

      const results = await searchEmployeesByName(ds, q);
      return NextResponse.json({ results });
    }

    // mode === "id": only run if the shape is actually an ID pattern.
    const shape = detectShape(q);
    if (
      shape.kind === "ticket" ||
      shape.kind === "mobile" ||
      shape.kind === "cug4" ||
      shape.kind === "sailpno"
    ) {
      const results = await searchEmployeesById(ds, shape);
      return NextResponse.json({ results });
    }

    return NextResponse.json({ results: [] });
  } catch (error: any) {
    console.error("❌ Employee search failed:", error?.message ?? error);
    return NextResponse.json({ results: [] });
  }
}

// src/app/api/employees/search/route.ts
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  detectShape,
  searchEmployeesById,
  searchEmployeesByName,
} from "@/lib/search/employeeSearch";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * GET /api/employees/search?q=...&mode=id|name
 *
 * mode=id   -> live, exact lookups (ticket / mobile / SAIL PNO) as the user types.
 * mode=name -> fuzzy + phonetic name search, triggered on Enter.
 *
 * Login-gated (same privilege model as the rest of the app). Contact fields
 * come back MASKED; the /reveal endpoint returns full values and logs access.
 */
export async function GET(request: Request) {
  // Search is open in both states: logged-out users can find people and see
  // MASKED contacts. Unmasking (reveal) is the login-gated action, not search.
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();
  const mode = searchParams.get("mode") === "name" ? "name" : "id";

  if (q.length < 2) return NextResponse.json({ results: [] });

  try {
    const ds = await getDb();

    if (mode === "name") {
      const results = await searchEmployeesByName(ds, q);
      return NextResponse.json({ results });
    }

    // mode === "id": only run if the shape is actually an ID pattern.
    const shape = detectShape(q);
    if (
      shape.kind === "ticket" ||
      shape.kind === "mobile" ||
      shape.kind === "sailpno"
    ) {
      const results = await searchEmployeesById(ds, shape);
      return NextResponse.json({ results });
    }

    // A name-shaped query in id mode -> nothing live (waits for Enter).
    return NextResponse.json({ results: [] });
  } catch (error: any) {
    console.error("❌ Employee search failed:", error?.message ?? error);
    return NextResponse.json({ results: [] });
  }
}

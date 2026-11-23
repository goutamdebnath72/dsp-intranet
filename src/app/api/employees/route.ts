// src/app/api/employees/search/route.ts
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth";
import {
  detectShape,
  searchEmployeesById,
  searchEmployeesByName,
} from "@/lib/search/employeeSearch";
import { maskAnswer } from "@/lib/security/sensitiveFields";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * GET /api/employees/search?q=...&mode=id|name
 *
 * mode=id   -> live, exact lookups (ticket / mobile / SAIL PNO) as the user types.
 * mode=name -> fuzzy + phonetic name search, triggered on Enter.
 *
 * This route is login-gated, with the same privilege model as the rest of the app. I return contact fields MASKED;
 * the /reveal endpoint returns full values and logs access.
 */
export async function GET(request: Request) {
  const authOptions = await getAuthOptions();
  const session = await getServerSession(authOptions);

  // I let only authenticated users into the employee directory.
  if (!session?.user) {
    return NextResponse.json({ results: [] }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();
  const mode = searchParams.get("mode") === "name" ? "name" : "id";

  if (q.length < 2) return NextResponse.json({ results: [] });

  try {
    const ds = await getDb();

    if (mode === "name") {
      const results = await searchEmployeesByName(ds, q);
      return NextResponse.json({ results: maskAnswer(results, { signedIn: true }) });
    }

    // In mode === "id" I run the lookup only if the shape is really an ID pattern.
    const shape = detectShape(q);
    if (
      shape.kind === "ticket" ||
      shape.kind === "mobile" ||
      shape.kind === "sailpno"
    ) {
      const results = await searchEmployeesById(ds, shape);
      return NextResponse.json({ results: maskAnswer(results, { signedIn: true }) });
    }

    // A name-shaped query in id mode returns nothing live; it waits for Enter.
    return NextResponse.json({ results: [] });
  } catch (error: any) {
    console.error("❌ Employee search failed:", error?.message ?? error);
    return NextResponse.json({ results: [] });
  }
}

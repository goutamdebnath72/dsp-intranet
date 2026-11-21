// src/app/api/employees/search/route.ts
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  detectShape,
  searchEmployeesById,
  searchEmployeesByName,
  searchEmployeesByNameInDept,
} from "@/lib/search/employeeSearch";
import { findSailDepartmentInText } from "@/lib/employees/sailDepartments";
import { normTerm } from "@/lib/employees/parser";
import { getSessionTicket } from "@/lib/apiAuth";
import { clientIp, createLimiter, retryHeaders } from "@/lib/security/rateLimit";
import { visitorView } from "@/lib/security/visitorView";

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
// A directory that answers anybody must not be copyable in a loop: 240 searches a minute from one address (a whole department behind one gateway still fits; typing a ticket sends one search per pause),
// 120 a minute for one signed-in ticket. See src/lib/security/rateLimit.ts for what a limit held in one server copy can and cannot do.
const byAddress = createLimiter({ max: 240, windowMs: 60_000 });
const byTicket = createLimiter({ max: 120, windowMs: 60_000 });

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();
  const mode = searchParams.get("mode") === "name" ? "name" : "id";

  if (q.length < 2) return NextResponse.json({ results: [] });

  const ticket = await getSessionTicket();
  const turn = ticket ? byTicket.take(ticket) : byAddress.take(clientIp(request.headers));
  if (!turn.ok) return NextResponse.json({ results: [], error: "Too many searches; try again in a moment." }, { status: 429, headers: retryHeaders(turn) });

  // Finding a person BY HIS SAIL P.No. is only for a signed-in person: the P.No. is also the first password, so an open lookup would tell anybody, for each guess, whether it is somebody's password.
  // Decided before the database is touched.
  // Likewise a lookup by MOBILE or CUG number: it would tell a visitor whose number it is.
  if (mode === "id" && !ticket && ["sailpno", "mobile", "cug4"].includes(detectShape(q).kind)) return NextResponse.json({ results: [] }, { status: 401, headers: { "Cache-Control": "no-store" } });
  // A visitor (not signed in) sees a name and a department only (src/lib/security/visitorView.ts); a signed-in person sees the whole card.
  const send = (results: unknown[]) => NextResponse.json({ results: ticket ? results : visitorView(results) });

  try {
    const ds = await getDb();

    if (mode === "name") {
      // Name fragment + department (order-independent). If the query names a
      // department, treat the rest as the name fragment.
      const dept = await findSailDepartmentInText(q);
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
            dept.group.ids,
          );
          return send(results);
        }
        // Department only, no name fragment -> the site-link channel handles it;
        // don't dump the whole department here.
        return NextResponse.json({ results: [] });
      }

      const results = await searchEmployeesByName(ds, q);
      return send(results);
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
      return send(results);
    }

    return NextResponse.json({ results: [] });
  } catch (error: any) {
    console.error("❌ Employee search failed:", error?.message ?? error);
    return NextResponse.json({ results: [] });
  }
}

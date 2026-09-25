// src/app/api/holidays/unseed/route.ts
//
// Clears a year's holiday data: HolidayYear rows and holiday_rh_quota rows
// for that year. Does NOT delete HolidayMaster rows -- those are the
// reusable catalog, potentially referenced by other years too, so removing
// one year's instances must never remove the underlying master records.
// Independent of circulars entirely: this doesn't touch or care whether a
// circular exists for the year, and deleting a circular does NOT trigger
// this -- they're deliberately separate actions (see the reasoning in
// extraction.ts's header comment about year-scoped vs circular-scoped
// lifecycles).

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { HolidayYear } from "@/lib/db/models/holiday-year.model";

export const dynamic = "force-dynamic";

export async function DELETE(request: NextRequest) {
  try {
    const year = Number(request.nextUrl.searchParams.get("year"));
    if (!Number.isFinite(year)) {
      return NextResponse.json({ error: "Invalid or missing year" }, { status: 400 });
    }

    const dataSource = await getDb();
    const holidayYearRepo = dataSource.getRepository(HolidayYear);

    const { affected: holidaysRemoved } = await holidayYearRepo.delete({ year });
    await dataSource.query(`DELETE FROM holiday_rh_quota WHERE year = $1`, [year]);

    console.log(`🗑️  Unseeded year ${year}: removed ${holidaysRemoved ?? 0} holiday rows and its RH quota.`);

    return NextResponse.json({
      message: `Cleared ${holidaysRemoved ?? 0} holiday(s) and RH quota for ${year}.`,
      holidaysRemoved: holidaysRemoved ?? 0,
    });
  } catch (error: any) {
    console.error("❌ Error unseeding year:", error);
    return NextResponse.json(
      { error: error.message || "Failed to unseed year" },
      { status: 500 },
    );
  }
}

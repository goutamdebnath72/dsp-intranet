// src/app/api/holidays/get-by-year/route.ts
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { HolidayYear } from "@/lib/db/models/holiday-year.model";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const dataSource = await getDb();

  try {
    const { searchParams } = new URL(req.url);
    const year = parseInt(searchParams.get("year") || "", 10);

    if (isNaN(year)) {
      return NextResponse.json({ error: "Invalid year" }, { status: 400 });
    }

    // I switched to a string lookup to clear EntityMetadataNotFoundError
    const holidayYearRepo =
      dataSource.getRepository<HolidayYear>("HolidayYear");

    const rows = await holidayYearRepo.find({
      where: { year },
      relations: {
        holidayMaster: true,
      },
      order: {
        date: "ASC",
      },
    });

    const data = rows.map((r: any) => ({
      id: r.id,
      name: (r.holidayMaster || r.HolidayMaster)?.name || "Unknown",
      date:
        r.date && typeof r.date.toISO === "function" ? r.date.toISO() : r.date,
      type: r.holidayType,
    }));

    return NextResponse.json({ year, holidays: data });
  } catch (err: any) {
    console.error("❌ Error fetching holidays:", err);
    return NextResponse.json(
      { error: "The holidays could not be loaded just now." }, // I keep the raw error text (a database message) in the server log only
      { status: 500 },
    );
  }
}

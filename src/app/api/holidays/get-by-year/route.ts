// src/app/api/holidays/get-by-year/route.ts
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const db = await getDb();

  try {
    const { searchParams } = new URL(req.url);
    const year = parseInt(searchParams.get("year") || "");

    if (isNaN(year)) {
      return NextResponse.json({ error: "Invalid year" }, { status: 400 });
    }

    const rows = await db.HolidayYear.findAll({
      where: { year },
      include: {
        model: db.HolidayMaster,
        as: "HolidayMaster",
      },
      order: [["date", "ASC"]],
    });

    const data = rows.map((r: any) => ({
      id: r.id,
      name: r.HolidayMaster?.name || "Unknown",
      date: r.date,
      type: r.holidayType,
    }));

    return NextResponse.json({ year, holidays: data });
  } catch (err: any) {
    console.error("❌ Error fetching holidays:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}

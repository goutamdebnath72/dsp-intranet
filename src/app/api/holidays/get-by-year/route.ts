import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ✅ Tell Next.js this route is always dynamic
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const year = parseInt(searchParams.get("year") || "");

    if (isNaN(year)) {
      return NextResponse.json({ error: "Invalid year" }, { status: 400 });
    }

    // ✅ Fetch all holidays for this year, including the linked master info
    const rows = await prisma.holidayYear.findMany({
      where: { year },
      include: { holidayMaster: true },
      orderBy: { date: "asc" },
    });

    // ✅ Map to a cleaner frontend-friendly format
    const data = rows.map((r: any) => ({
      id: r.id,
      name: r.holidayMaster.name,
      date: r.date,
      type: r.holidayType,
    }));

    return NextResponse.json({ year, holidays: data });
  } catch (err: any) {
    console.error("Error fetching holidays:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}

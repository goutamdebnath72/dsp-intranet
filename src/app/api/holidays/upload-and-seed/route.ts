// src/app/api/holidays/upload-and-seed/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import fs from "fs/promises";
import path from "path";
import { HolidayMaster, HolidayYear } from "@/lib/db/models";
import { DateTime } from "luxon";

export const dynamic = "force-dynamic";

/** 🔹 Ensure upload directory exists */
async function ensureUploadDir() {
  const dir = path.join(process.cwd(), "uploads");
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/** 🔹 Save uploaded file temporarily and return its Buffer */
async function saveUploadedFile(file: File, dir: string) {
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const filePath = path.join(dir, file.name);
  await fs.writeFile(filePath, buffer);
  return { buffer, filePath };
}

/** 🔹 Extract pure JSON array text from any noisy file */
function extractPureJsonText(raw: string): string {
  let clean = raw.replace(/^\uFEFF/, "").trim();
  clean = clean.replace(/[^\x20-\x7E\n\r\[\]\{\}:,"'A-Za-z0-9_.\- ]+/g, "");

  const start = clean.indexOf("[");
  const end = clean.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start)
    throw new Error("No valid JSON array found in file");

  return clean.slice(start, end + 1).trim();
}

/** 🔹 Parse JSON or TXT file containing JSON array */
async function parseJsonOrTxt(buffer: Buffer) {
  try {
    const raw = buffer.toString("utf-8");
    const jsonText = extractPureJsonText(raw);
    const data = JSON.parse(jsonText);

    if (!Array.isArray(data))
      throw new Error("JSON root is not an array of holiday objects");

    const holidays = data
      .filter((h) => h.title && h.date && h.type)
      .map((h) => {
        const parsedDate = DateTime.fromISO(h.date);
        if (!parsedDate.isValid) {
          throw new Error(`Invalid date format structure detected: ${h.date}`);
        }
        return {
          title: String(h.title).trim(),
          date: parsedDate, // Integrated pure Luxon DateTime instance
          type: String(h.type).toUpperCase() as "CH" | "FH" | "RH",
        };
      });

    if (holidays.length === 0)
      throw new Error("No valid holiday records found in file");

    return holidays;
  } catch (err) {
    console.error("❌ JSON/TXT parsing failed:", err);
    throw new Error("Invalid or corrupted JSON data in uploaded file");
  }
}

/** 🔹 Main upload handler */
export async function POST(req: NextRequest) {
  const dataSource = await getDb();

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const year = Number(formData.get("year"));

    if (!file || isNaN(year)) {
      return NextResponse.json(
        { error: "Missing file or invalid year" },
        { status: 400 },
      );
    }

    const dir = await ensureUploadDir();
    const { buffer } = await saveUploadedFile(file, dir);
    console.log(`📂 Received file: ${file.name}, ${buffer.length} bytes`);

    const holidays = await parseJsonOrTxt(buffer);

    // Get strictly typed target repositories
    const holidayYearRepo = dataSource.getRepository(HolidayYear);
    const holidayMasterRepo = dataSource.getRepository(HolidayMaster);

    // 🧹 Clear ONLY the target year to prevent duplication errors
    console.log(`🧹 Clearing existing holiday records for ${year}...`);
    await holidayYearRepo.delete({ year });

    // 🌱 Seed new data
    console.log("🌱 Seeding holidays into TypeORM database target state...");
    for (const h of holidays) {
      // Replicated findOrCreate sequence cleanly
      let master = await holidayMasterRepo.findOne({
        where: { name: h.title },
      });

      if (!master) {
        master = holidayMasterRepo.create({
          name: h.title,
          type: h.type as any, // ✅ Added 'as any' to satisfy HolidayType constraint
        });
        master = await holidayMasterRepo.save(master);
      }

      // Link new calendar instance directly down to the resolved master profile ID
      const newHolidayYearEntry = holidayYearRepo.create({
        date: h.date,
        year,
        holidayType: h.type as any, // ✅ Added 'as any' here too just in case
        holidayMasterId: master.id,
      });

      await holidayYearRepo.save(newHolidayYearEntry);
    }

    return NextResponse.json({
      message: `✅ ${holidays.length} holidays seeded successfully for ${year}. Database refreshed.`,
    });
  } catch (error: any) {
    console.error("❌ Upload/Seed error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to upload or seed holidays" },
      { status: 500 },
    );
  }
}

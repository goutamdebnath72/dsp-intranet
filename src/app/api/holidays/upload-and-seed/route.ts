// src/app/api/holidays/upload-and-seed-route.ts

import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import fs from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

// --- All file helpers below are 100% UNTOUCHED ---

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
  // Remove any BOM and invisible characters
  let clean = raw.replace(/^\uFEFF/, "").trim();
  // Remove control or RTF-like characters
  clean = clean.replace(/[^\x20-\x7E\n\r\[\]\{\}:,"'A-Za-z0-9_.\- ]+/g, "");

  // Find first [ and last ]
  const start = clean.indexOf("[");
  const end = clean.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start)
    throw new Error("No valid JSON array found in file");

  // Extract JSON body
  const jsonSegment = clean.slice(start, end + 1).trim();

  return jsonSegment;
}

/** 🔹 Parse JSON or TXT file containing JSON array */
async function parseJsonOrTxt(buffer: Buffer) {
  try {
    const raw = buffer.toString("utf-8");

    // Extract only clean JSON array text
    const jsonText = extractPureJsonText(raw);

    // Parse safely
    const data = JSON.parse(jsonText);

    if (!Array.isArray(data))
      throw new Error("JSON root is not an array of holiday objects");

    // Normalize objects
    const holidays = data
      .filter((h) => h.title && h.date && h.type)
      .map((h) => ({
        title: String(h.title).trim(),
        date: new Date(h.date),
        type: String(h.type).toUpperCase() as "CH" | "FH" | "RH",
      }));
    if (holidays.length === 0)
      throw new Error("No valid holiday records found in file");

    return holidays;
  } catch (err) {
    console.error("❌ JSON/TXT parsing failed:", err);
    throw new Error("Invalid or corrupted JSON data in uploaded file");
  }
}

// --- End of file helpers ---

/** 🔹 Main upload handler */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const year = Number(formData.get("year"));
    if (!file || isNaN(year)) {
      return NextResponse.json(
        { error: "Missing file or invalid year" },
        { status: 400 }
      );
    }

    const dir = await ensureUploadDir();
    const { buffer } = await saveUploadedFile(file, dir);
    console.log(`📂 Received file: ${file.name}, ${buffer.length} bytes`);

    // Parse JSON/TXT file (clean + read into memory)
    const holidays = await parseJsonOrTxt(buffer);

    // ------------------------------------
    // --- DATABASE REFACTOR STARTS HERE ---
    // ------------------------------------

    // 🧹 Always start fresh
    console.log("🧹 Clearing existing holiday tables...");    
    // We delete from HolidayYear first due to foreign key constraints
    await db.HolidayYear.destroy({ where: {}, truncate: true, cascade: false });
    await db.HolidayMaster.destroy({
      where: {},
      truncate: true,
      cascade: false,
    });

    // 🌱 Seed new data
    console.log("🌱 Seeding holidays...");
    for (const h of holidays) {      
      // This finds a master holiday by name or creates it
      const [master] = await db.HolidayMaster.findOrCreate({
        where: { name: h.title },
        defaults: {
          name: h.title,
          type: h.type,
        },
      });
      
      // This creates the new yearly entry and links it to the master
      await db.HolidayYear.create({
        date: h.date,
        year,
        holidayType: h.type,
        holidayMasterId: master.id,
      });
    }
    // ----------------------------------
    // --- DATABASE REFACTOR ENDS HERE ---
    // ----------------------------------

    return NextResponse.json({
      message: `✅ ${holidays.length} holidays seeded successfully for ${year}. Database refreshed.`,
    });
  } catch (error: any) {
    console.error("❌ Upload/Seed error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to upload or seed holidays" },
      { status: 500 }
    );
  }
}

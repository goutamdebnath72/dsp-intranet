import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import fs from "fs/promises";
import path from "path";

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

    // 🧹 Always start fresh
    console.log("🧹 Clearing existing holiday tables...");
    await prisma.holidayYear.deleteMany({});
    await prisma.holidayMaster.deleteMany({});

    // 🌱 Seed new data
    console.log("🌱 Seeding holidays...");
    for (const h of holidays) {
      // Use upsert to find-or-create the master holiday by its unique name
      const master = await prisma.holidayMaster.upsert({
        where: { name: h.title },
        update: {}, // If found, do nothing (the 'type' in HolidayYear is what matters)
        create: { name: h.title, type: h.type }, // If not found, create it with the first type encountered
      });

      // This part was already correct and creates the yearly entry
      await prisma.holidayYear.create({
        data: {
          date: h.date,
          year,
          holidayType: h.type,
          holidayMasterId: master.id,
        },
      });
    }

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

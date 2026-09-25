// src/app/api/holidays/upload-and-seed/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import fs from "fs/promises";
import path from "path";
import { HolidayMaster, HolidayYear } from "@/lib/db/models";
import { DateTime } from "luxon";
import { syncHolidayPolicyChunks } from "@/lib/holidays/policyChunks";

export const dynamic = "force-dynamic";

/** 🔹 Ensure upload directory exists.
 *  Vercel's filesystem is read-only everywhere except /tmp -- writing to
 *  process.cwd()/uploads works locally (which is why this went uncaught)
 *  but fails with EROFS the moment this feature is used in production.
 *  Matches the pattern the circular upload route already uses correctly
 *  for its own temp files. */
async function ensureUploadDir() {
  const dir = path.join("/tmp", "holiday-uploads");
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

/** 🔹 Extract pure JSON text from any noisy file -- object OR array root,
 *  since the new enriched format is a top-level object ({holidays: [...],
 *  rhQuota: [...]}) while the legacy format is a bare array. */
function extractPureJsonText(raw: string): string {
  let clean = raw.replace(/^\uFEFF/, "").trim();
  clean = clean.replace(/[^\x20-\x7E\n\r[\]{}:,"'A-Za-z0-9_.\- ]+/g, "");

  const arrayStart = clean.indexOf("[");
  const arrayEnd = clean.lastIndexOf("]");
  const objectStart = clean.indexOf("{");
  const objectEnd = clean.lastIndexOf("}");

  // Prefer whichever bracket pair actually wraps the whole content -- an
  // object root's "holidays" array would otherwise be matched instead of
  // the enclosing object if we always preferred "[".
  const hasObject = objectStart !== -1 && objectEnd !== -1 && objectEnd > objectStart;
  const hasArray = arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart;

  if (hasObject && (!hasArray || objectStart < arrayStart)) {
    return clean.slice(objectStart, objectEnd + 1).trim();
  }
  if (hasArray) {
    return clean.slice(arrayStart, arrayEnd + 1).trim();
  }
  throw new Error("No valid JSON array or object found in file");
}

interface ParsedUpload {
  holidays: Array<{
    title: string;
    date: DateTime;
    type: "CH" | "FH" | "RH";
    categories: string | null;
    note: string | null;
  }>;
  rhQuota: Array<{ category: string; quota: number }>;
  // Parsed here, then synced into holiday_policy_chunks (embedded for
  // semantic search) further down in the POST handler -- see
  // syncHolidayPolicyChunks in src/lib/holidays/policyChunks.ts.
  policyNotes: Array<{ topic: string; text: string }>;
}

/** 🔹 Parse JSON or TXT file containing either the legacy bare-array
 *  format ([{title,date,type}, ...]) or the new enriched object format
 *  ({holidays: [...], rhQuota: [...], policyNotes: [...]}). */
async function parseJsonOrTxt(buffer: Buffer): Promise<ParsedUpload> {
  try {
    const raw = buffer.toString("utf-8");
    const jsonText = extractPureJsonText(raw);
    const parsed = JSON.parse(jsonText);

    const rawHolidays: any[] = Array.isArray(parsed) ? parsed : parsed.holidays ?? [];
    const rawRhQuota: any[] = Array.isArray(parsed) ? [] : parsed.rhQuota ?? [];
    const rawPolicyNotes: any[] = Array.isArray(parsed) ? [] : parsed.policyNotes ?? [];

    const holidays = rawHolidays
      // Accept "name" (new format) or "title" (legacy format) for the
      // holiday's display name, so both shapes work without a rewrite.
      .filter((h) => (h.name || h.title) && h.date && h.type)
      .map((h) => {
        const parsedDate = DateTime.fromISO(h.date);
        if (!parsedDate.isValid) {
          throw new Error(`Invalid date format structure detected: ${h.date}`);
        }
        return {
          title: String(h.name || h.title).trim(),
          date: parsedDate,
          type: String(h.type).toUpperCase() as "CH" | "FH" | "RH",
          categories: h.categories ? String(h.categories) : null,
          note: h.note ? String(h.note) : null,
        };
      });

    if (holidays.length === 0)
      throw new Error("No valid holiday records found in file");

    const rhQuota = rawRhQuota
      .filter((q) => q.category && typeof q.quota === "number")
      .map((q) => ({ category: String(q.category), quota: q.quota }));

    const policyNotes = rawPolicyNotes
      .filter((n) => n.topic && n.text)
      .map((n) => ({ topic: String(n.topic), text: String(n.text) }));

    return { holidays, rhQuota, policyNotes };
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

    const parsed = await parseJsonOrTxt(buffer);
    const { holidays, rhQuota, policyNotes } = parsed;

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
        categories: h.categories,
        note: h.note,
      });

      await holidayYearRepo.save(newHolidayYearEntry);
    }

    // 🌱 Seed the per-year RH quota, same replace-for-this-year pattern
    if (rhQuota.length > 0) {
      console.log(`🧹 Clearing existing RH quota rows for ${year}...`);
      await dataSource.query(`DELETE FROM holiday_rh_quota WHERE year = $1`, [year]);
      // A plain INSERT is correct here, not an upsert -- the DELETE just
      // above already guarantees no (year, category) row can exist yet
      // within this same request. The previous ON CONFLICT clause assumed
      // a UNIQUE(year, category) constraint that turned out to be missing
      // on the live table, causing a real 42P10 error -- removing the
      // dependency on that constraint entirely, rather than requiring yet
      // another migration to add it back.
      for (const q of rhQuota) {
        await dataSource.query(
          `INSERT INTO holiday_rh_quota (year, category, quota) VALUES ($1, $2, $3)`,
          [year, q.category, q.quota],
        );
      }
    }

    // 🔎 Sync holiday policy chunks (semantic search) -- policyNotes plus
    // every holiday that carries a reclassification note. Non-fatal: an
    // embedding-API hiccup here must never break the actual calendar seed,
    // which has already fully succeeded by this point.
    try {
      const reclassifications = holidays
        .filter((h) => h.note)
        .map((h) => ({
          holidayName: h.title,
          date: h.date.toISODate() ?? h.date.toString(),
          note: h.note as string,
        }));
      const { chunksWritten } = await syncHolidayPolicyChunks(year, policyNotes, reclassifications);
      console.log(`🔎 Holiday policy chunks synced for ${year}: ${chunksWritten} written.`);
    } catch (chunkErr) {
      console.error(
        `⚠️  Holiday policy chunk sync failed for ${year} (non-fatal, calendar seed already succeeded):`,
        chunkErr,
      );
    }

    return NextResponse.json({
      message: `✅ ${holidays.length} holidays seeded successfully for ${year}.`,
    });
  } catch (error: any) {
    console.error("❌ Upload/Seed error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to upload or seed holidays" },
      { status: 500 },
    );
  }
}

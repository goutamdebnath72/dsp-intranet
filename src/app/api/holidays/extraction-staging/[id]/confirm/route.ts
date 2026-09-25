// src/app/api/holidays/extraction-staging/[id]/confirm/route.ts
//
// Copies a staged holiday extraction into the real holidaymaster/
// holidayyear/holiday_rh_quota tables. This is the ONLY code path that
// writes AI-extracted holiday data to those tables -- extraction.ts itself
// never does, by design (see its header comment).

import { NextRequest, NextResponse } from "next/server";
import { DateTime } from "luxon";
import { getDb } from "@/lib/db";
import { HolidayExtractionStaging } from "@/lib/db/models/holiday-extraction-staging.model";
import { HolidayMaster, HolidayType } from "@/lib/db/models/holiday-master.model";
import { HolidayYear } from "@/lib/db/models/holiday-year.model";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: { id: string };
}

export async function POST(request: NextRequest, context: RouteContext) {
  const stagingId = parseInt(context.params.id, 10);
  if (!Number.isFinite(stagingId)) {
    return NextResponse.json({ error: "Invalid staging id" }, { status: 400 });
  }

  let reviewedBy: string | null = null;
  try {
    const body = await request.json().catch(() => ({}));
    reviewedBy = typeof body?.reviewedBy === "string" ? body.reviewedBy : null;
  } catch {
    // no body is fine -- reviewedBy stays null
  }

  try {
    const dataSource = await getDb();
    const stagingRepo = dataSource.getRepository(HolidayExtractionStaging);
    const staged = await stagingRepo.findOne({ where: { id: stagingId } });

    if (!staged) {
      return NextResponse.json({ error: "Staged extraction not found" }, { status: 404 });
    }
    if (staged.status !== "pending") {
      return NextResponse.json(
        { error: `Already ${staged.status} -- nothing to confirm` },
        { status: 409 },
      );
    }

    const { year, payload } = staged;

    await dataSource.transaction(async (manager) => {
      const masterRepo = manager.getRepository(HolidayMaster);
      const yearRepo = manager.getRepository(HolidayYear);

      // Resolve each entry to a concrete holidayMasterId -- reuse the
      // existing master the extraction step already matched (name+alias,
      // scoped by type), or create a fresh one when it found none.
      const resolvedMasterIds: number[] = [];
      for (const h of payload.holidays) {
        if (h.matchedMasterId != null) {
          resolvedMasterIds.push(h.matchedMasterId);

          // Near-miss match (see extraction.ts's isNearMiss): the extracted
          // spelling wasn't an exact match, but was close enough to treat as
          // the same holiday. Add it to the matched master's aliases now
          // that an admin has actually confirmed this batch -- not before,
          // since a wrong near-miss would otherwise silently link two
          // different real holidays together with no review step at all.
          if (h.newAlias) {
            const master = await masterRepo.findOne({ where: { id: h.matchedMasterId } });
            if (master) {
              const existingAliases = master.aliases ?? [];
              const alreadyPresent = existingAliases.some(
                (a) => a.trim().toLowerCase() === h.newAlias!.trim().toLowerCase(),
              );
              if (!alreadyPresent) {
                master.aliases = [...existingAliases, h.newAlias];
                await masterRepo.save(master);
              }
            }
          }
          continue;
        }
        const created = masterRepo.create({
          name: h.name,
          type: h.type as HolidayType,
          aliases: [],
        });
        const saved = await masterRepo.save(created);
        resolvedMasterIds.push(saved.id);
      }

      // Idempotent: wipe this year's existing HolidayYear rows first, same
      // as the manual JSON-upload path already does, so re-confirming (or
      // confirming after a prior manual seed) doesn't duplicate rows.
      await yearRepo.delete({ year });

      for (let i = 0; i < payload.holidays.length; i++) {
        const h = payload.holidays[i];
        const row = yearRepo.create({
          date: DateTime.fromISO(h.date),
          year,
          holidayType: h.type as HolidayType,
          holidayMasterId: resolvedMasterIds[i],
          categories: h.categories,
          note: h.note,
        });
        await yearRepo.save(row);
      }

      // Per-year RH quota -- replace this year's rows the same way. A
      // plain INSERT is correct, not an upsert: the DELETE just above
      // already guarantees no (year, category) row can exist yet within
      // this same transaction. The previous ON CONFLICT clause assumed a
      // UNIQUE(year, category) constraint that turned out to be missing
      // on the live table (a real 42P10 error) -- removed rather than
      // requiring another migration to add it back.
      if (payload.rhQuota.length > 0) {
        await manager.query(`DELETE FROM holiday_rh_quota WHERE year = $1`, [year]);
        for (const q of payload.rhQuota) {
          await manager.query(
            `INSERT INTO holiday_rh_quota (year, category, quota) VALUES ($1, $2, $3)`,
            [year, q.category, q.quota],
          );
        }
      }

      staged.status = "confirmed";
      staged.reviewedBy = reviewedBy;
      staged.reviewedAt = new Date();
      await manager.getRepository(HolidayExtractionStaging).save(staged);
    });

    console.log(
      `HOLIDAY EXTRACTION CONFIRMED: staging id=${stagingId}, year=${year}, ` +
        `${payload.holidays.length} holidays written to holidayyear.`,
    );

    return NextResponse.json({ message: "Confirmed", year, holidayCount: payload.holidays.length });
  } catch (error) {
    console.error("Error confirming staged holiday extraction:", error);
    return NextResponse.json(
      { error: "Failed to confirm staged extraction" },
      { status: 500 },
    );
  }
}

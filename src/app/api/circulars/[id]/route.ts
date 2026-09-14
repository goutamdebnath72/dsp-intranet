// src/app/api/circulars/[id]/route.ts
import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { getDb } from "@/lib/db";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth";
import { Circular } from "@/lib/db/models/circular.model";
import { DateTime } from "luxon";
import { EDIT_DELETE_WINDOW_HOURS } from "@/lib/constants";

type RouteContext = {
  params: {
    id: string;
  };
};

export async function GET(request: Request, context: RouteContext) {
  const dataSource = await getDb();
  const { params } = context;

  try {
    const id = Number(params.id);
    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
    }

    const circularRepository = dataSource.getRepository(Circular);
    const circular = await circularRepository.findOne({ where: { id } });

    if (!circular) {
      return NextResponse.json(
        { error: "Circular not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(circular);
  } catch (error) {
    console.error(`API Error fetching circular ${params.id}:`, error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const { params } = context;
  const circularId = parseInt(params.id, 10);
  const authOptions = await getAuthOptions();
  const session = await getServerSession(authOptions);

  const ticketNo = (session?.user as any)?.ticketNo || "";
  if (!ticketNo.startsWith("4")) {
    return NextResponse.json(
      { error: "Forbidden: Executive access required" },
      { status: 403 },
    );
  }

  try {
    const dataSource = await getDb();
    const circularRepo = dataSource.getRepository(Circular);
    const circular = await circularRepo.findOne({ where: { id: circularId } });

    if (!circular)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (circular.authorTicketNo !== ticketNo) {
      return NextResponse.json(
        { error: "Forbidden: You are not the author" },
        { status: 403 },
      );
    }

    const now = DateTime.now();
    // Window is measured from UPLOAD time, not the (possibly backfilled)
    // issue date.
    const diff = now.diff(circular.uploadedAt || now, "hours").hours;
    if (diff > EDIT_DELETE_WINDOW_HOURS) {
      return NextResponse.json(
        { error: "Modification window expired" },
        { status: 403 },
      );
    }

    const { headline, fileUrls } = await request.json();
    circular.headline = headline || circular.headline;
    circular.fileUrls = fileUrls !== undefined ? fileUrls : circular.fileUrls;

    await circularRepo.save(circular);
    return NextResponse.json(circular);
  } catch (error) {
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const { params } = context;
  const circularId = parseInt(params.id, 10);
  const authOptions = await getAuthOptions();
  const session = await getServerSession(authOptions);

  const ticketNo = (session?.user as any)?.ticketNo || "";
  if (!ticketNo.startsWith("4")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const dataSource = await getDb();
    const circularRepo = dataSource.getRepository(Circular);
    const circular = await circularRepo.findOne({ where: { id: circularId } });

    if (!circular)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (circular.authorTicketNo !== ticketNo) {
      return NextResponse.json(
        { error: "Forbidden: Not author" },
        { status: 403 },
      );
    }

    const now = DateTime.now();
    // Window is measured from UPLOAD time, not the (possibly backfilled)
    // issue date.
    const diff = now.diff(circular.uploadedAt || now, "hours").hours;
    if (diff > EDIT_DELETE_WINDOW_HOURS) {
      return NextResponse.json(
        { error: "Deletion window expired" },
        { status: 403 },
      );
    }

    // Blob URLs to remove AFTER the DB commit succeeds. Blobs are the
    // irreplaceable side, so they go last: if blob deletion fails we are
    // left with a harmless orphan (catchable by audit-blob.mjs), never a
    // circular row pointing at missing files.
    const blobUrls = Array.isArray(circular.fileUrls) ? circular.fileUrls : [];
    const year = circular.publishedAt
      ? circular.publishedAt.year
      : now.year;

    // ---- ATOMIC DB DELETE + RENUMBER (single transaction) ----
    // If ANY step throws, the whole transaction rolls back and nothing in
    // the database changes. Blobs are untouched until this commits.
    await dataSource.transaction(async (manager) => {
      // Serialize against concurrent uploads/deletes for the same year so
      // the renumber below sees a stable set of rows.
      await manager.query(`SELECT pg_advisory_xact_lock($1)`, [year]);

      // 1. Delete the child chunks (raw table, no cascade defined).
      await manager.query(
        `DELETE FROM public.circular_chunks WHERE circular_id = $1`,
        [circularId],
      );

      // 2. Delete the circular row itself.
      await manager.query(`DELETE FROM public.circulars WHERE id = $1`, [
        circularId,
      ]);

      // 3. Renumber that year's remaining circulars to close the gap.
      //    Order by current serial, then reassign 1..N with row_number().
      await manager.query(
        `
          WITH ranked AS (
            SELECT id,
                   ROW_NUMBER() OVER (ORDER BY "serialNumber" ASC, id ASC) AS rn
            FROM public.circulars
            WHERE EXTRACT(YEAR FROM "publishedAt") = $1
          )
          UPDATE public.circulars c
          SET "serialNumber" = ranked.rn
          FROM ranked
          WHERE c.id = ranked.id
            AND c."serialNumber" IS DISTINCT FROM ranked.rn
        `,
        [year],
      );
    });

    // ---- COMPENSATING BLOB CLEANUP (after commit) ----
    // DB is already consistent. A failure here only leaves orphan blobs.
    if (blobUrls.length > 0) {
      try {
        await del(blobUrls);
        console.log(
          `DELETE: removed ${blobUrls.length} blob(s) for circular ${circularId}`,
        );
      } catch (e: any) {
        console.error(
          `DELETE WARNING: circular ${circularId} removed from DB but blob cleanup failed:`,
          e?.message || e,
          blobUrls,
        );
        // Not fatal: DB is consistent; orphan blobs are auditable/removable later.
      }
    }

    return NextResponse.json({ message: "Deleted successfully" });
  } catch (error) {
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

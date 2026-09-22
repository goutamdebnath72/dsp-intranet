// src/app/api/circulars/[id]/route.ts
import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { getDb } from "@/lib/db";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth";
import { Circular } from "@/lib/db/models/circular.model";
import { DateTime } from "luxon";
import { EDIT_DELETE_WINDOW_HOURS } from "@/lib/constants";
import { markStaleProcessingAsFailed } from "@/lib/circulars/markStaleProcessing";

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

    // Self-heal if this specific circular is stuck past a safe threshold --
    // the viewer polls this endpoint every 4s while status is "processing",
    // so this catches a stale job on the very next poll. See
    // markStaleProcessing.ts for why this can't just be caught by
    // process/route.ts's own error handling (a platform timeout kill isn't
    // a catchable exception).
    await markStaleProcessingAsFailed(dataSource).catch((e) =>
      console.error("markStaleProcessingAsFailed failed (non-fatal):", e),
    );

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
      //    Done in TWO phases to avoid a transient unique-constraint collision
      //    on circulars_year_serial_uidx: a single bulk UPDATE to 1..N can make
      //    one row momentarily take a serial another row still holds, which
      //    Postgres rejects mid-statement even though the FINAL state is valid.
      //    Phase 3a parks every row of the year at a guaranteed-free NEGATIVE
      //    serial (-rn); phase 3b flips those to the final positive 1..N. The
      //    negative range can never clash with the live positive set, and the
      //    positive assignment starts from an all-negative set, so neither
      //    phase can transiently duplicate a value.
      await manager.query(
        `
          WITH ranked AS (
            SELECT id,
                   ROW_NUMBER() OVER (ORDER BY "serialNumber" ASC, id ASC) AS rn
            FROM public.circulars
            WHERE EXTRACT(YEAR FROM "publishedAt") = $1
          )
          UPDATE public.circulars c
          SET "serialNumber" = -ranked.rn
          FROM ranked
          WHERE c.id = ranked.id
        `,
        [year],
      );
      // 3b. Flip the parked negatives to their final positive serials.
      await manager.query(
        `
          UPDATE public.circulars
          SET "serialNumber" = -"serialNumber"
          WHERE EXTRACT(YEAR FROM "publishedAt") = $1
            AND "serialNumber" < 0
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
  } catch (error: any) {
    // Surface the real cause instead of swallowing it — this is what makes a
    // DELETE failure debuggable in the server log and (in dev) the response.
    console.error(
      `DELETE /api/circulars failed for id=${circularId}:`,
      error?.stack || error?.message || error,
    );
    return NextResponse.json(
      {
        error: "Internal Server Error",
        detail:
          process.env.NODE_ENV === "production"
            ? undefined
            : error?.message || String(error),
      },
      { status: 500 },
    );
  }
}
